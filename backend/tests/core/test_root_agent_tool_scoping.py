from beanie import PydanticObjectId
from langchain_core.tools import tool

from core.agents.root.agent import EventStreamHandler, RootAgent


@tool("ask_finance")
async def ask_finance(question: str) -> dict[str, str]:
    """Finance tool fixture for root-agent scoping tests."""
    return {"question": question}


@tool("ask_todo")
async def ask_todo(question: str) -> dict[str, str]:
    """Todo tool fixture for root-agent scoping tests."""
    return {"question": question}


def build_root_agent() -> RootAgent:
    agent = RootAgent()
    agent._all_ask_tools = {
        "finance": ask_finance,
        "todo": ask_todo,
    }
    return agent


async def test_get_user_tools_returns_only_installed_app_tools(monkeypatch) -> None:
    agent = build_root_agent()

    async def fake_list_installed_app_ids(_user_id: str) -> list[str]:
        return ["finance"]

    monkeypatch.setattr(
        "core.agents.root.agent.list_installed_app_ids",
        fake_list_installed_app_ids,
    )

    tools = await agent._get_user_tools("user-1")

    assert [tool.name for tool in tools] == ["ask_finance"]


async def test_get_user_tools_falls_back_closed_when_scoping_fails(monkeypatch) -> None:
    agent = build_root_agent()

    async def fake_list_installed_app_ids(_user_id: str) -> list[str]:
        raise RuntimeError("db unavailable")

    monkeypatch.setattr(
        "core.agents.root.agent.list_installed_app_ids",
        fake_list_installed_app_ids,
    )

    tools = await agent._get_user_tools("user-1")

    assert [tool.name for tool in tools] == ["get_platform_info"]


async def test_get_user_tools_returns_platform_info_when_no_apps_installed(monkeypatch) -> None:
    agent = build_root_agent()

    async def fake_list_installed_app_ids(_user_id: str) -> list[str]:
        return []

    monkeypatch.setattr(
        "core.agents.root.agent.list_installed_app_ids",
        fake_list_installed_app_ids,
    )

    tools = await agent._get_user_tools("user-1")

    assert [tool.name for tool in tools] == ["get_platform_info"]


def test_event_stream_handler_surfaces_multiple_parallel_root_tool_calls() -> None:
    handler = EventStreamHandler([ask_finance, ask_todo])

    first_start = handler.handle(
        {
            "event": "on_tool_start",
            "run_id": "run-finance",
            "name": "ask_finance",
            "data": {"input": {"question": "finance?"}},
        }
    )
    second_start = handler.handle(
        {
            "event": "on_tool_start",
            "run_id": "run-todo",
            "name": "ask_todo",
            "data": {"input": {"question": "todo?"}},
        }
    )
    first_end = handler.handle(
        {
            "event": "on_tool_end",
            "run_id": "run-finance",
            "name": "ask_finance",
            "data": {"output": {"ok": True}},
        }
    )
    second_end = handler.handle(
        {
            "event": "on_tool_end",
            "run_id": "run-todo",
            "name": "ask_todo",
            "data": {"output": {"ok": True}},
        }
    )

    assert first_start is not None and first_start.tool_name == "ask_finance"
    assert second_start is not None and second_start.tool_name == "ask_todo"
    assert first_end is not None and first_end.tool_call_id == "run-finance"
    assert second_end is not None and second_end.tool_call_id == "run-todo"
    assert handler.active_delegations == set()


async def test_load_history_scopes_by_user_and_thread(monkeypatch) -> None:
    agent = RootAgent()
    expected_user_id = "507f1f77bcf86cd799439011"
    captured: dict[str, object] = {}

    class FakeCursor:
        def sort(self, field: str):
            captured["sort"] = field
            return self

        def limit(self, value: int):
            captured["limit"] = value
            return self

        async def to_list(self):
            return []

    def fake_find(query: dict[str, object]):
        captured["query"] = query
        return FakeCursor()

    monkeypatch.setattr(
        "core.agents.root.agent.ConversationMessage.find",
        staticmethod(fake_find),
    )

    history = await agent._load_history(expected_user_id, "thread-1")

    assert history == []
    assert captured["query"] == {
        "user_id": PydanticObjectId(expected_user_id),
        "thread_id": "thread-1",
    }
    assert captured["sort"] == "-created_at"
    assert captured["limit"] == 50
