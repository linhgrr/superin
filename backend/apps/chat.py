"""Chat streaming route — SSE via assistant-stream DataStreamResponse."""

import json

from fastapi import APIRouter, Depends, Request

from core.auth import get_current_user
from core.agents.root import root_agent

router = APIRouter()


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
    Returns: SSE (assistant-stream data stream protocol)
    """
    body = await request.json()
    messages = body.get("messages", [])
    thread_id = body.get("threadId") or body.get("thread_id")
    # incoming_tools: JSON Schema tools from frontend — forwarded to LLM, not parsed here

    try:
        from assistant_stream import create_run
        from assistant_stream.serialization import DataStreamResponse
    except ImportError:
        # assistant-stream not installed yet — return a stub response
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content={"error": "assistant-stream not installed. Install with: pip install assistant-stream"},
            status_code=503,
        )

    async def run(controller):
        tool_calls: dict[str, object] = {}

        try:
            async for event in root_agent.astream(
                user_id,
                messages,
                thread_id=thread_id,
                skip_db_load=True,
            ):
                event_type = event.get("type")

                if event_type in {"text", "token"}:
                    controller.append_text(event["content"])

                elif event_type == "tool_call":
                    tool_call = await controller.add_tool_call(
                        tool_name=event["toolName"],
                        tool_call_id=event["toolCallId"],
                    )
                    args = event.get("args")
                    if args:
                        tool_call.append_args_text(json.dumps(args))
                    tool_calls[event["toolCallId"]] = tool_call

                elif event_type == "tool_result":
                    tool_call_id = event["toolCallId"]
                    tool_call = tool_calls.get(tool_call_id)
                    if tool_call is not None and hasattr(tool_call, "set_response"):
                        tool_call.set_response(event["result"])
                    else:
                        controller.add_tool_result(tool_call_id=tool_call_id, result=event["result"])

        except Exception as e:
            controller.add_error(str(e))

    return DataStreamResponse(create_run(run, state={"messages": messages}))
