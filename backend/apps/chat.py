"""Chat streaming route for assistant-ui's modern UI message stream protocol."""

import json
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from core.agents.root import root_agent
from core.auth import get_current_user

router = APIRouter()


def _encode_ui_message_stream_chunk(chunk: dict[str, object]) -> bytes:
    return f"data: {json.dumps(chunk, separators=(',', ':'))}\n\n".encode()


def _encode_done_marker() -> bytes:
    return b"data: [DONE]\n\n"


def _is_tool_result_error(result: object) -> bool:
    return isinstance(result, dict) and result.get("ok") is False


@router.post("/stream")
async def chat_stream(
    request: Request,
    user_id: str = Depends(get_current_user),
):
    """
    POST /api/chat/stream
    Body: {
        "messages": GenericMessage[],
        "tools": ToolDefinition[]   # optional JSON Schema — forwarded to LLM
    }
    Returns: SSE (assistant-ui UI message stream protocol)
    """
    body = await request.json()
    messages = body.get("messages", [])
    thread_id = body.get("threadId") or body.get("thread_id")

    async def event_stream():
        message_id = body.get("unstable_assistantMessageId") or f"msg_{uuid4().hex}"

        yield _encode_ui_message_stream_chunk({
            "type": "start",
            "messageId": message_id,
        })

        try:
            async for event in root_agent.astream(
                user_id,
                messages,
                thread_id=thread_id,
                skip_db_load=True,
            ):
                event_type = event.get("type")

                if event_type in {"text", "token"}:
                    yield _encode_ui_message_stream_chunk({
                        "type": "text-delta",
                        "textDelta": event["content"],
                    })
                    continue

                if event_type == "tool_call":
                    tool_call_id = event["toolCallId"]
                    yield _encode_ui_message_stream_chunk({
                        "type": "tool-call-start",
                        "id": tool_call_id,
                        "toolCallId": tool_call_id,
                        "toolName": event["toolName"],
                    })

                    args = event.get("args")
                    if args is not None:
                        yield _encode_ui_message_stream_chunk({
                            "type": "tool-call-delta",
                            "argsText": json.dumps(args, separators=(",", ":")),
                        })

                    yield _encode_ui_message_stream_chunk({
                        "type": "tool-call-end",
                    })
                    continue

                if event_type == "tool_result":
                    result = event["result"]
                    payload: dict[str, object] = {
                        "type": "tool-result",
                        "toolCallId": event["toolCallId"],
                        "result": result,
                    }
                    if _is_tool_result_error(result):
                        payload["isError"] = True

                    yield _encode_ui_message_stream_chunk(payload)
                    continue

                if event_type == "done":
                    yield _encode_ui_message_stream_chunk({
                        "type": "finish",
                        "finishReason": "stop",
                        "usage": {
                            "inputTokens": 0,
                            "outputTokens": 0,
                        },
                    })
                    yield _encode_done_marker()
                    return

        except Exception as exc:
            yield _encode_ui_message_stream_chunk({
                "type": "error",
                "errorText": str(exc),
            })
            yield _encode_done_marker()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
