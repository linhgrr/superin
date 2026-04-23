from __future__ import annotations

from typing import Any

from langchain.tools import ToolRuntime

from core.agents.runtime_context import AppAgentContext


def _noop_stream_writer(_chunk: Any) -> None:
    return None


def build_app_tool_runtime(
    user_id: str,
    *,
    thread_id: str = "test-thread",
    user_tz: str = "Asia/Ho_Chi_Minh",
) -> ToolRuntime[AppAgentContext]:
    return ToolRuntime(
        state={},
        context=AppAgentContext(
            user_id=user_id,
            thread_id=thread_id,
            user_tz=user_tz,
        ),
        config={
            "configurable": {
                "user_id": user_id,
                "thread_id": thread_id,
                "user_tz": user_tz,
            }
        },
        stream_writer=_noop_stream_writer,
        tool_call_id=None,
        store=None,
    )
