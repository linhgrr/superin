"""Chat streaming route for assistant-ui's modern UI message stream protocol."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import cast
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from pydantic import BaseModel, Field

from core.agents.root.agent import RawChatMessage, TextStreamEvent, root_agent
from core.agents.root.graph import get_root_agent_graph
from core.auth.dependencies import get_current_user
from core.chat.service import (
    delete_thread_meta,
    get_thread_meta,
    list_user_threads,
    normalize_thread_id,
    rename_thread,
    set_thread_status,
    upsert_thread_meta,
)
from core.constants import (
    CHAT_STREAM_FRIENDLY_ERROR_TEXT,
    RATE_LIMIT_CHAT_DAILY_FREE,
    RATE_LIMIT_CHAT_DAILY_PAID,
    RATE_LIMIT_CHAT_FREE,
    RATE_LIMIT_CHAT_PAID,
)
from core.db import get_checkpointer
from core.models import ThreadMeta, User
from core.subscriptions.service import get_effective_tier
from core.utils.limiter import tiered_limiter
from shared.enums import ChatEventType, SubscriptionTier, UserRole

logger = logging.getLogger(__name__)

router = APIRouter()

# Maximum request body size for chat stream.
_CHAT_BODY_MAX_BYTES = 1 * 1024 * 1024  # 1 MB


class ThreadUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


def _encode_chunk(chunk: dict[str, object]) -> bytes:
    return f"data: {json.dumps(chunk, separators=(',', ':'))}\n\n".encode()


def _encode_done() -> bytes:
    return b"data: [DONE]\n\n"


def _message_to_api(item: BaseMessage, fallback_id: str) -> dict[str, object]:
    """Serialize a LangChain message from LangGraph state for the REST API."""
    role: str | None = None
    if isinstance(item, HumanMessage):
        role = "user"
    elif isinstance(item, AIMessage):
        role = "assistant"

    if role is None:
        raise ValueError(f"Unsupported chat history message type: {type(item)!r}")

    return {
        "id": str(item.id or fallback_id),
        "role": role,
        "content": item.text,
    }


def _thread_meta_to_api(meta: ThreadMeta) -> dict[str, object]:
    return {
        "threadId": meta.thread_id,
        "status": meta.status,
        "title": meta.title,
        "preview": meta.preview,
        "messageCount": meta.message_count,
        "createdAt": meta.created_at.isoformat(),
        "updatedAt": meta.updated_at.isoformat(),
    }


async def _load_thread_state_messages(
    user_id: str,
    thread_id: str,
) -> list[BaseMessage]:
    """Load thread messages from LangGraph checkpoint state."""
    graph = get_root_agent_graph()
    state = await graph.aget_state(
        {
            "configurable": {
                "thread_id": thread_id,
                "user_id": user_id,
            }
        }
    )
    values = state.values if isinstance(state.values, dict) else {}
    messages = values.get("messages", [])
    return [msg for msg in messages if isinstance(msg, BaseMessage)]


def _is_duplicate_latest_user_turn(
    *,
    thread_messages: list[BaseMessage],
    latest_user_message_id: str | None,
) -> bool:
    """Detect client retry of the latest user turn against persisted thread state."""
    if not latest_user_message_id or not thread_messages:
        return False

    last_message = thread_messages[-1]
    return isinstance(last_message, HumanMessage) and str(last_message.id or "") == latest_user_message_id


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
async def list_threads(
    include_archived: bool = True,
    user_id: str = Depends(get_current_user),
) -> dict[str, list[dict[str, object]]]:
    """
    GET /api/chat/threads
    Returns list of thread metadata for the current user (most-recently-updated first).
    """
    threads = await list_user_threads(user_id, include_archived=include_archived)
    return {
        "threads": [_thread_meta_to_api(t) for t in threads],
    }


@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str, user_id: str = Depends(get_current_user)) -> dict[str, object]:
    """Return one thread metadata row for the authenticated user."""
    normalized_thread_id = normalize_thread_id(user_id, thread_id)
    thread = await get_thread_meta(user_id, normalized_thread_id)
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
    return _thread_meta_to_api(thread)


@router.patch("/threads/{thread_id}")
async def update_thread(
    thread_id: str,
    payload: ThreadUpdateRequest,
    user_id: str = Depends(get_current_user),
) -> dict[str, object]:
    """Rename one thread for the authenticated user."""
    normalized_thread_id = normalize_thread_id(user_id, thread_id)
    thread = await rename_thread(user_id, normalized_thread_id, payload.title)
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
    return _thread_meta_to_api(thread)


@router.post("/threads/{thread_id}/archive")
async def archive_thread(thread_id: str, user_id: str = Depends(get_current_user)) -> dict[str, object]:
    """Archive one thread for the authenticated user."""
    normalized_thread_id = normalize_thread_id(user_id, thread_id)
    thread = await set_thread_status(user_id, normalized_thread_id, status="archived")
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
    return _thread_meta_to_api(thread)


@router.post("/threads/{thread_id}/unarchive")
async def unarchive_thread(thread_id: str, user_id: str = Depends(get_current_user)) -> dict[str, object]:
    """Restore one archived thread for the authenticated user."""
    normalized_thread_id = normalize_thread_id(user_id, thread_id)
    thread = await set_thread_status(user_id, normalized_thread_id, status="regular")
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
    return _thread_meta_to_api(thread)


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, user_id: str = Depends(get_current_user)) -> dict[str, object]:
    """Delete one thread and its LangGraph checkpoints."""
    normalized_thread_id = normalize_thread_id(user_id, thread_id)
    thread = await get_thread_meta(user_id, normalized_thread_id)
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")

    checkpointer = get_checkpointer()
    delete_thread_fn = getattr(checkpointer, "adelete_thread", None)
    if callable(delete_thread_fn):
        await delete_thread_fn(normalized_thread_id)

    await delete_thread_meta(user_id, normalized_thread_id)
    return {"threadId": normalized_thread_id, "deleted": True}


@router.get("/history")
async def chat_history(thread_id: str, user_id: str = Depends(get_current_user)) -> dict[str, object]:
    """
    GET /api/chat/history?thread_id=<thread_id>
    Returns messages for a thread from LangGraph checkpoint state.
    """
    normalized_thread_id = normalize_thread_id(user_id, thread_id)
    history = await _load_thread_state_messages(user_id, normalized_thread_id)
    return {
        "threadId": normalized_thread_id,
        "messages": [
            _message_to_api(item, fallback_id=f"{normalized_thread_id}:{index}")
            for index, item in enumerate(history)
            if isinstance(item, (HumanMessage, AIMessage))
        ],
    }


@router.post("/stream")
async def chat_stream(request: Request, user_id: str = Depends(get_current_user)) -> StreamingResponse:
    """
    POST /api/chat/stream
    Body: {
        "threadId": str       # REQUIRED — client-generated UUID (immutable identity)
        "threadTitle": str    # optional — override auto-generated title from first msg
        "messages": GenericMessage[],
    }
    Returns: SSE of LangGraph-compatible `{event, data}` chunks for `useLangGraphRuntime`.
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

    thread_id = normalize_thread_id(user_id, raw_thread_id.strip())
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

    async def event_stream() -> AsyncIterator[bytes]:
        message_id = assistant_message_id or f"msg_{uuid4().hex}"
        assistant_parts: list[str] = []
        saw_done_event = False
        logger.info(
            "CHAT_STREAM_START user=%s thread=%s latest_user_len=%d",
            user_id,
            thread_id,
            len(latest_user_text),
        )

        thread_messages = await _load_thread_state_messages(user_id, thread_id)
        if not _is_duplicate_latest_user_turn(
            thread_messages=thread_messages,
            latest_user_message_id=latest_user_message_id,
        ):
            await upsert_thread_meta(
                user_id=user_id,
                thread_id=thread_id,
                title=thread_title,
                preview=latest_user_text,
            )

        try:
            raw_message: RawChatMessage = {
                "role": "user",
                "content": latest_user_text,
            }
            if latest_user_message_id is not None:
                raw_message["id"] = latest_user_message_id

            async for event in root_agent.astream(
                user_id,
                [raw_message],
                thread_id=thread_id,
                assistant_message_id=message_id,
            ):
                event_type = event["type"]

                if event_type == "text":
                    content = cast(TextStreamEvent, event)["content"]
                    assistant_parts.append(content)
                    yield _encode_chunk({
                        "event": "messages/partial",
                        "data": [
                            {
                                "id": message_id,
                                "type": "AIMessageChunk",
                                "content": content,
                            }
                        ],
                    })
                    continue

                if event_type == "thinking":
                    yield _encode_chunk({
                        "event": "thinking",
                        "data": {
                            "stepId": event.get("step_id"),
                            "label": event.get("label"),
                            "status": event.get("status"),
                        },
                    })
                    continue

                if event_type == ChatEventType.DONE:
                    saw_done_event = True
                    continue

            if saw_done_event:
                final_assistant_text = "".join(assistant_parts).strip()
                thread_messages = await _load_thread_state_messages(
                    user_id,
                    thread_id,
                )
                if final_assistant_text:
                    visible_message_count = sum(
                        1 for item in thread_messages
                        if isinstance(item, (HumanMessage, AIMessage))
                    )
                    await upsert_thread_meta(
                        user_id,
                        thread_id,
                        preview=final_assistant_text,
                        message_count=visible_message_count,
                    )
                yield _encode_chunk({
                    "event": "updates",
                    "data": {
                        "messages": [
                            {
                                "id": str(item.id or f"{thread_id}:{index}"),
                                "type": "human" if isinstance(item, HumanMessage) else "ai",
                                "content": item.text,
                            }
                            for index, item in enumerate(thread_messages)
                            if isinstance(item, (HumanMessage, AIMessage))
                        ]
                    },
                })
                yield _encode_done()
                return

        except (asyncio.CancelledError, GeneratorExit):
            logger.info(
                "CHAT_STREAM_CANCELLED user=%s thread=%s partial_assistant_len=%d",
                user_id,
                thread_id,
                len("".join(assistant_parts)),
            )
            return
        except Exception as exc:
            logger.exception("Chat stream error: %s", exc)
            yield _encode_chunk({
                "event": "error",
                "data": {"message": CHAT_STREAM_FRIENDLY_ERROR_TEXT},
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
