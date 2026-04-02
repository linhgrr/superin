"""Chat streaming route — SSE via assistant-stream DataStreamResponse."""

import json

from assistant_stream import create_run
from assistant_stream.serialization import DataStreamResponse
from fastapi import APIRouter, Depends, Request

from core.agents.root import root_agent
from core.auth import get_current_user

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
    async def run(controller):
        tool_calls: dict[str, object] = {}
        # Queue for tool results that arrive before their tool_call is registered
        pending_results: dict[str, list[dict]] = {}

        def process_pending_results(tool_call_id: str):
            """Process any pending results for a tool_call_id."""
            if tool_call_id in pending_results:
                for result in pending_results[tool_call_id]:
                    tool_call = tool_calls.get(tool_call_id)
                    if tool_call and hasattr(tool_call, "set_response"):
                        tool_call.set_response(result)
                del pending_results[tool_call_id]

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
                    tool_call_id = event["toolCallId"]
                    tool_call = await controller.add_tool_call(
                        tool_name=event["toolName"],
                        tool_call_id=tool_call_id,
                    )
                    args = event.get("args")
                    if args:
                        tool_call.append_args_text(json.dumps(args))
                    tool_calls[tool_call_id] = tool_call
                    # Process any pending results for this tool_call
                    process_pending_results(tool_call_id)

                elif event_type == "tool_result":
                    tool_call_id = event["toolCallId"]
                    tool_call = tool_calls.get(tool_call_id)
                    result = event["result"]
                    if tool_call is not None and hasattr(tool_call, "set_response"):
                        tool_call.set_response(result)
                    else:
                        # Queue the result until the tool_call arrives
                        # This prevents "unknown id" errors in the frontend
                        if tool_call_id not in pending_results:
                            pending_results[tool_call_id] = []
                        pending_results[tool_call_id].append(result)

        except Exception as e:
            controller.add_error(str(e))

    return DataStreamResponse(create_run(run, state={"messages": messages}))
