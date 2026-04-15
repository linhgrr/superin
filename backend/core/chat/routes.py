"""Chat streaming route for assistant-ui's modern UI message stream protocol."""

import json
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from core.agents.root import root_agent
from core.auth.dependencies import get_current_user
from core.chat.service import (
    append_thread_message,
    get_message_by_client_id,
    list_thread_messages,
    list_user_threads,
    normalize_thread_id,
    upsert_thread_meta,
)
from core.constants import (
    CHAT_STREAM_FRIENDLY_ERROR_TEXT,
    RATE_LIMIT_CHAT_DAILY_FREE,
    RATE_LIMIT_CHAT_DAILY_PAID,
    RATE_LIMIT_CHAT_FREE,
    RATE_LIMIT_CHAT_PAID,
)
from core.models import ConversationMessage, User
from core.subscriptions.service import get_effective_tier
from core.utils.limiter import tiered_limiter
from shared.enums import ChatEventType, SubscriptionTier, UserRole

logger = logging.getLogger(__name__)

router = APIRouter()

# Maximum request body size for chat stream.
_CHAT_BODY_MAX_BYTES = 1 * 1024 * 1024  # 1 MB


def _encode_chunk(chunk: dict[str, object]) -> bytes:
    return f"data: {json.dumps(chunk, separators=(',', ':'))}\n\n".encode()


def _encode_done() -> bytes:
    return b"data: [DONE]\n\n"


def _is_error(result: object) -> bool:
    return isinstance(result, dict) and result.get("ok") is False


def _message_to_api(item: ConversationMessage) -> dict[str, object]:
    """Serialize a ConversationMessage for the REST API."""
    return {
        "id": str(item.client_message_id or item.id),
        "role": item.role,
        "content": item.content,
        "createdAt": item.created_at.isoformat(),
    }


def _extract_text_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text", "")))
        return " ".join(part for part in parts if part).strip()
    return str(content or "").strip()


def _extract_latest_user_message(messages: list[object]) -> tuple[str, str | None]:
    for msg in reversed(messages):
        if not isinstance(msg, dict):
            continue
        if msg.get("role") != "user":
            continue
        content = _extract_text_content(msg.get("content"))
        if content:
            msg_id = msg.get("id")
            return content, str(msg_id) if msg_id is not None else None
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Chat request must include a non-empty latest user message.",
    )


@router.get("/threads")
async def list_threads(user_id: str = Depends(get_current_user)):
    """
    GET /api/chat/threads
    Returns list of thread metadata for the current user (most-recently-updated first).
    """
    threads = await list_user_threads(user_id)
    return {
        "threads": [
            {
                "threadId": t.thread_id,
                "title": t.title,
                "preview": t.preview,
                "messageCount": t.message_count,
                "createdAt": t.created_at.isoformat(),
                "updatedAt": t.updated_at.isoformat(),
            }
            for t in threads
        ],
    }


@router.get("/history")
async def chat_history(thread_id: str, user_id: str = Depends(get_current_user)):
    """
    GET /api/chat/history?thread_id=<canonical_or_client_thread_id>
    Returns persisted messages for a thread in chronological order.
    """
    canonical = normalize_thread_id(user_id, thread_id)
    history = await list_thread_messages(user_id, canonical)
    return {
        "threadId": canonical,
        "messages": [_message_to_api(item) for item in history],
    }


@router.post("/stream")
async def chat_stream(request: Request, user_id: str = Depends(get_current_user)):
    """
    POST /api/chat/stream
    Body: {
        "threadId": str       # REQUIRED — client-generated UUID (immutable identity)
        "threadTitle": str    # optional — override auto-generated title from first msg
        "messages": GenericMessage[],
    }
    Returns: SSE (assistant-ui UI message stream protocol)
    """
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > _CHAT_BODY_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Request body too large. Maximum size is {_CHAT_BODY_MAX_BYTES // 1024}KB.",
        )
    raw_body = await request.body()
    if len(raw_body) > _CHAT_BODY_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Request body too large. Maximum size is {_CHAT_BODY_MAX_BYTES // 1024}KB.",
        )

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON body.",
        ) from exc

    if not isinstance(body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Body must be a JSON object.")

    # threadId is REQUIRED — strict contract
    raw_thread_id = body.get("threadId")
    if not raw_thread_id or not isinstance(raw_thread_id, str) or not raw_thread_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'threadId' is required and must be a non-empty string.",
        )

    messages = body.get("messages", [])
    if not isinstance(messages, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="'messages' must be an array.")

    canonical_thread_id = normalize_thread_id(user_id, raw_thread_id.strip())
    thread_title = body.get("threadTitle")
    latest_user_text, latest_user_message_id = _extract_latest_user_message(messages)
    assistant_message_id_raw = body.get("unstable_assistantMessageId")
    assistant_message_id = (
        str(assistant_message_id_raw).strip()
        if assistant_message_id_raw is not None and str(assistant_message_id_raw).strip()
        else None
    )

    # Admin users bypass all rate limits
    user = await User.get(user_id)
    is_admin = user is not None and user.role == UserRole.ADMIN

    if is_admin:
        limits: list[tuple[int, int]] = [(RATE_LIMIT_CHAT_PAID, 60), (RATE_LIMIT_CHAT_DAILY_PAID, 86400)]
        tier = SubscriptionTier.PAID
    else:
        tier = await get_effective_tier(user_id)
        if tier == SubscriptionTier.PAID:
            limits = [(RATE_LIMIT_CHAT_PAID, 60), (RATE_LIMIT_CHAT_DAILY_PAID, 86400)]
        else:
            limits = [(RATE_LIMIT_CHAT_FREE, 60), (RATE_LIMIT_CHAT_DAILY_FREE, 86400)]

    # Check rate limit BEFORE opening SSE stream
    if not is_admin:
        is_allowed, limit_error_message = await tiered_limiter.check(user_id, limits)
        if not is_allowed:
            friendly_err = (
                f"{limit_error_message} Please upgrade to Paid or try again later."
                if tier != SubscriptionTier.PAID
                else limit_error_message
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=friendly_err,
            )

    async def event_stream():
        message_id = assistant_message_id or f"msg_{uuid4().hex}"
        assistant_parts: list[str] = []

        existing_user_message = await get_message_by_client_id(
            user_id,
            canonical_thread_id,
            latest_user_message_id,
        )
        if existing_user_message is None:
            await append_thread_message(
                user_id=user_id,
                thread_id=canonical_thread_id,
                role="user",
                content=latest_user_text,
                client_message_id=latest_user_message_id,
            )
            # Create thread meta only when first user message is confirmed persisted
            await upsert_thread_meta(
                user_id,
                canonical_thread_id,
                title=thread_title,
                preview=latest_user_text,
            )

        history = await list_thread_messages(user_id, canonical_thread_id)
        canonical_messages = [
            {
                "id": str(item.client_message_id or item.id),
                "role": item.role,
                "content": item.content,
            }
            for item in history
        ]

        yield _encode_chunk({"type": "start", "messageId": message_id})

        try:
            async for event in root_agent.astream(
                user_id, canonical_messages, thread_id=canonical_thread_id
            ):
                event_type = event.get("type")

                if event_type in {"text", ChatEventType.TOKEN}:
                    assistant_parts.append(str(event["content"]))
                    yield _encode_chunk({
                        "type": "text-delta",
                        "textDelta": event["content"],
                    })
                    continue

                if event_type == ChatEventType.TOOL_CALL:
                    tool_call_id = event["toolCallId"]
                    yield _encode_chunk({
                        "type": "tool-call-start",
                        "id": tool_call_id,
                        "toolCallId": tool_call_id,
                        "toolName": event["toolName"],
                    })
                    args = event.get("args")
                    if args is not None:
                        yield _encode_chunk({
                            "type": "tool-call-delta",
                            "argsText": json.dumps(args, separators=(",", ":")),
                        })
                    yield _encode_chunk({"type": "tool-call-end"})
                    continue

                if event_type == ChatEventType.TOOL_RESULT:
                    result = event["result"]
                    payload: dict[str, object] = {
                        "type": "tool-result",
                        "toolCallId": event["toolCallId"],
                        "result": result,
                    }
                    if _is_error(result):
                        payload["isError"] = True
                    yield _encode_chunk(payload)
                    continue

                if event_type == ChatEventType.DONE:
                    final_assistant_text = "".join(assistant_parts).strip()
                    if final_assistant_text and await get_message_by_client_id(
                        user_id,
                        canonical_thread_id,
                        message_id,
                    ) is None:
                        await append_thread_message(
                            user_id=user_id,
                            thread_id=canonical_thread_id,
                            role="assistant",
                            content=final_assistant_text,
                            client_message_id=message_id,
                        )
                        # Update thread meta after assistant reply: bump counter + refresh preview
                        await upsert_thread_meta(
                            user_id,
                            canonical_thread_id,
                            preview=final_assistant_text,
                            increment_count=1,
                        )
                    yield _encode_chunk({
                        "type": "finish",
                        "finishReason": "stop",
                        "usage": {"inputTokens": 0, "outputTokens": 0},
                    })
                    yield _encode_done()
                    return

        except Exception as exc:
            logger.exception("Chat stream error: %s", exc)
            yield _encode_chunk({
                "type": ChatEventType.ERROR,
                "errorText": CHAT_STREAM_FRIENDLY_ERROR_TEXT,
            })
            yield _encode_done()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
