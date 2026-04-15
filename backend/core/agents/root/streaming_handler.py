"""Stream event types and LangGraph → frontend event converter."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi.encoders import jsonable_encoder
from loguru import logger

from shared.enums import ChatEventType


@dataclass
class StreamEvent:
    """Stream event for frontend consumption."""

    type: str
    content: str | None = None
    tool_name: str | None = None
    tool_call_id: str | None = None
    args: dict | None = None
    result: Any = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dict for JSON serialization."""
        data: dict[str, Any] = {"type": self.type}
        if self.content is not None:
            data["content"] = self.content
        if self.tool_name is not None:
            data["toolName"] = self.tool_name
        if self.tool_call_id is not None:
            data["toolCallId"] = self.tool_call_id
        if self.args is not None:
            data["args"] = self.args
        if self.result is not None:
            data["result"] = self.result
        return data


class EventStreamHandler:
    """
    Convert LangGraph stream events to frontend-compatible StreamEvent format.

    Tracks active delegation runs to suppress token chunks while waiting
    for child-agent responses.
    """

    def __init__(self, tools: list[Any]) -> None:
        # Only tools whose names are in this set produce visible stream events.
        # Internal child-agent tools are kept hidden.
        self.visible_tool_names = {t.name for t in tools}
        self.active_delegations: set[str] = set()
        self.assistant_buffer = ""

    def handle(self, event: dict[str, Any]) -> StreamEvent | None:
        """Process a single LangGraph event and return a StreamEvent, or None to skip."""
        event_type = event.get("event", "")
        data = event.get("data", {})
        run_id = event.get("run_id", "")
        tool_name = event.get("name", "unknown")

        if event_type == "on_chat_model_stream":
            return self._handle_chat_stream(run_id, data)
        elif event_type == "on_tool_start":
            return self._handle_tool_start(run_id, tool_name, data)
        elif event_type == "on_tool_end":
            return self._handle_tool_end(run_id, tool_name, data)
        elif event_type == "on_tool_error":
            return self._handle_tool_error(run_id, tool_name, data)
        return None

    def _handle_chat_stream(self, run_id: str, data: dict) -> StreamEvent | None:
        """Handle chat model streaming chunks — suppress while delegating."""
        if self.active_delegations:
            return None
        chunk = data.get("chunk")
        content = getattr(chunk, "content", "") or ""
        if content:
            self.assistant_buffer += str(content)
            return StreamEvent(type=ChatEventType.TOKEN, content=str(content))
        return None

    def _handle_tool_start(self, run_id: str, tool_name: str, data: dict) -> StreamEvent | None:
        """Handle tool execution start — suppress internal tools."""
        if tool_name not in self.visible_tool_names:
            return None
        logger.info("TOOL_START  run_id=%s  tool=%s", run_id, tool_name)
        if tool_name.startswith("ask_"):
            self.active_delegations.add(run_id)

        inp = data.get("input", {})
        return StreamEvent(
            type=ChatEventType.TOOL_CALL,
            tool_name=tool_name,
            tool_call_id=run_id,
            args=jsonable_encoder(inp) if isinstance(inp, dict) else {},
        )

    def _handle_tool_end(self, run_id: str, tool_name: str, data: dict) -> StreamEvent | None:
        """Handle tool execution completion."""
        if tool_name not in self.visible_tool_names:
            return None

        self.active_delegations.discard(run_id)
        logger.info("TOOL_END  run_id=%s  tool=%s", run_id, tool_name)
        return StreamEvent(
            type=ChatEventType.TOOL_RESULT,
            tool_call_id=run_id,
            result=_normalize_output(data.get("output", {})),
        )

    def _handle_tool_error(self, run_id: str, tool_name: str, data: dict) -> StreamEvent | None:
        """Handle tool execution error."""
        if tool_name not in self.visible_tool_names:
            return None

        self.active_delegations.discard(run_id)
        err = data.get("error", "Tool execution failed")
        logger.error("TOOL_ERROR  run_id=%s  tool=%s  error=%s", run_id, tool_name, err)
        return StreamEvent(
            type=ChatEventType.TOOL_RESULT,
            tool_call_id=run_id,
            result={
                "ok": False,
                "error": {
                    "message": str(data.get("error", "Tool execution failed")),
                    "code": "tool_error",
                    "retryable": True,
                },
            },
        )


def _normalize_output(output: Any) -> Any:
    """Normalize tool output to JSON-serializable format."""
    from langchain_core.messages import ToolMessage

    if isinstance(output, ToolMessage):
        content = output.content
        if isinstance(content, str):
            try:
                import json

                return json.loads(content)
            except Exception:
                return content
        return jsonable_encoder(content)

    if hasattr(output, "content"):
        content = getattr(output, "content")
        if isinstance(content, str):
            try:
                import json

                return json.loads(content)
            except Exception:
                return content
        return jsonable_encoder(content)

    return jsonable_encoder(output)
