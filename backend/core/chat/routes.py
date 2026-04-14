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
    normalize_thread_id,
)
from core.constants import (
    CHAT_STREAM_FRIENDLY_ERROR_TEXT,
    RATE_LIMIT_CHAT_DAILY_FREE,
    RATE_LIMIT_CHAT_DAILY_PAID,
    RATE_LIMIT_CHAT_FREE,
    RATE_LIMIT_CHAT_PAID,
)
from core.models import User
from core.subscriptions.service import get_effective_tier
from core.utils.limiter import tiered_limiter
from shared.enums import ChatEventType, SubscriptionTier, UserRole

logger = logging.getLogger(__name__)

router = APIRouter()

# Maximum request body size for chat stream.
# The backend only uses the latest user message from the request body, but the
# current frontend transport still posts the in-memory thread state.
_CHAT_BODY_MAX_BYTES = 1 * 1024 * 1024  # 1 MB


def _encode_chunk(chunk: dict[str, object]) -> bytes:
    return f"data: {json.dumps(chunk, separators=(',', ':'))}\n\n".encode()


def _encode_done() -> bytes:
    return b"data: [DONE]\n\n"


def _is_error(result: object) -> bool:
    return isinstance(result, dict) and result.get("ok") is False


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


@router.post("/stream")
async def chat_stream(request: Request, user_id: str = Depends(get_current_user)):
    """
    POST /api/chat/stream
    Body: {
        "messages": GenericMessage[],
        "tools": ToolDefinition[]   # optional
    }
    Returns: SSE (assistant-ui UI message stream protocol)
    """
    # H3: Enforce request body size limit before deserializing
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

    messages = body.get("messages", [])
    if not isinstance(messages, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="'messages' must be an array.")

    thread_id = body.get("threadId") or body.get("thread_id")
    canonical_thread_id = normalize_thread_id(user_id, str(thread_id) if thread_id is not None else None)
    latest_user_text, latest_user_message_id = _extract_latest_user_message(messages)
    assistant_message_id_raw = body.get("unstable_assistantMessageId")
    assistant_message_id = (
        str(assistant_message_id_raw).strip()
        if assistant_message_id_raw is not None and str(assistant_message_id_raw).strip()
        else None
    )

    # Fix4: Admin users get unlimited chat (bypass all rate limits)
    user = await User.get(user_id)
    is_admin = user is not None and user.role == UserRole.ADMIN

    if is_admin:
        # Admins always use paid-tier routing (unlimited daily, high per-minute)
        limits: list[tuple[int, int]] = [(RATE_LIMIT_CHAT_PAID, 60), (RATE_LIMIT_CHAT_DAILY_PAID, 86400)]
        tier = SubscriptionTier.PAID
    else:
        tier = await get_effective_tier(user_id)
        if tier == SubscriptionTier.PAID:
            limits = [(RATE_LIMIT_CHAT_PAID, 60), (RATE_LIMIT_CHAT_DAILY_PAID, 86400)]
        else:
            limits = [(RATE_LIMIT_CHAT_FREE, 60), (RATE_LIMIT_CHAT_DAILY_FREE, 86400)]

    # Fix3: Check rate limit BEFORE opening the SSE stream.
    # Prevents UI flicker where frontend sees `start` then immediately `error`.
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

        # Rate limit already checked above (Fix3 — no longer duplicated here for non-admin)
        # For admin users, skip the rate limit entirely.

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
