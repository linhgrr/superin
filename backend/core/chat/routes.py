"""Chat streaming route for assistant-ui's modern UI message stream protocol."""

import json
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from core.agents.root import root_agent
from core.auth.dependencies import get_current_user
from core.constants import (
    CHAT_STREAM_FRIENDLY_ERROR_TEXT,
    RATE_LIMIT_CHAT_FREE,
    RATE_LIMIT_CHAT_DAILY_FREE,
    RATE_LIMIT_CHAT_PAID,
    RATE_LIMIT_CHAT_DAILY_PAID,
)
from core.subscriptions.service import get_effective_tier
from core.utils.rate_limit import chat_rate_limiter
from shared.enums import ChatEventType, SubscriptionTier

logger = logging.getLogger(__name__)

router = APIRouter()


def _encode_chunk(chunk: dict[str, object]) -> bytes:
    return f"data: {json.dumps(chunk, separators=(',', ':'))}\n\n".encode()


def _encode_done() -> bytes:
    return b"data: [DONE]\n\n"


def _is_error(result: object) -> bool:
    return isinstance(result, dict) and result.get("ok") is False


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
    body = await request.json()
    messages = body.get("messages", [])
    thread_id = body.get("threadId") or body.get("thread_id")
    
    tier = await get_effective_tier(user_id)
    if tier == SubscriptionTier.PAID:
        limits = [(RATE_LIMIT_CHAT_PAID, 60), (RATE_LIMIT_CHAT_DAILY_PAID, 86400)]
    else:
        limits = [(RATE_LIMIT_CHAT_FREE, 60), (RATE_LIMIT_CHAT_DAILY_FREE, 86400)]

    async def event_stream():
        message_id = body.get("unstable_assistantMessageId") or f"msg_{uuid4().hex}"

        yield _encode_chunk({"type": "start", "messageId": message_id})

        is_allowed, limit_error_message = chat_rate_limiter.check_limit(user_id, limits)
        if not is_allowed:
            friendly_err = f"{limit_error_message} Please upgrade to Paid or try again later." if tier != SubscriptionTier.PAID else limit_error_message
            yield _encode_chunk({
                "type": ChatEventType.ERROR,
                "errorText": friendly_err,
            })
            yield _encode_done()
            return

        try:
            async for event in root_agent.astream(
                user_id, messages, thread_id=thread_id
            ):
                event_type = event.get("type")

                if event_type in {"text", ChatEventType.TOKEN}:
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
