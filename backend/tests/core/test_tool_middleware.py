from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any, cast

from langchain_core.messages import ToolMessage
from langgraph.types import Command

from core.agents.tool_middleware import ChildBudgetMiddleware, StructuredToolResultMiddleware


def _build_request(*, state: dict[str, Any] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        tool_call={"name": "calendar_lookup", "id": "call_123"},
        tool=SimpleNamespace(extras=None),
        runtime=SimpleNamespace(context=SimpleNamespace(user_id="user_1")),
        state=state or {},
    )


class TestStructuredToolResultMiddleware:
    def test_allows_tool_with_none_extras(self) -> None:
        middleware = StructuredToolResultMiddleware()
        request = cast(Any, _build_request())

        async def handler(_request: object) -> Command[Any]:
            return Command(update={"messages": []})

        result = asyncio.run(middleware.awrap_tool_call(request, handler))

        assert isinstance(result, Command)
        assert result.update == {"messages": []}


class TestChildBudgetMiddleware:
    def test_allows_tool_with_none_extras(self) -> None:
        middleware = ChildBudgetMiddleware(soft_limit=2, hard_limit=3)
        request = cast(Any, _build_request(state={"tool_call_count": 0}))

        async def handler(_request: object) -> ToolMessage:
            return ToolMessage(
                content="ok",
                name="calendar_lookup",
                tool_call_id="call_123",
                status="success",
            )

        result = asyncio.run(middleware.awrap_tool_call(request, handler))

        assert isinstance(result, Command)
        assert result.update == {
            "messages": [
                ToolMessage(
                    content="ok",
                    name="calendar_lookup",
                    tool_call_id="call_123",
                    status="success",
                )
            ],
            "tool_call_count": 1,
            "tool_budget_soft_exhausted": False,
            "tool_budget_exhausted": False,
        }
