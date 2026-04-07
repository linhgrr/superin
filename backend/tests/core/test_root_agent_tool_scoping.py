from langchain_core.tools import tool

from core.agents.root.agent import RootAgent


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
