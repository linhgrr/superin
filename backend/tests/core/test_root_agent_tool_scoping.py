"""Tests for the parallel LangGraph v2 root agent architecture."""

from __future__ import annotations

import asyncio
import sys
import types
from unittest.mock import MagicMock

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore

from core.agents.root.context import extract_question
from core.agents.root.routing import detect_platform_request, route_and_craft
from core.agents.root.synthesis import merge_app_results, synthesize
from core.agents.root.schemas import NewTurnInput, RootState


def _finance_manifest() -> dict:
    from shared.schemas import AppManifestSchema

    return AppManifestSchema(
        id="finance",
        name="Finance",
        version="1.0.0",
        description="Track spending and budgets.",
        icon="Wallet",
        color="oklch(0.72 0.19 145)",
        widgets=[],
        agent_description="Helps users manage budgets and transactions.",
        tools=["finance_get_summary"],
        models=["Wallet"],
        category="finance",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Schema types
# ─────────────────────────────────────────────────────────────────────────────


class TestSchemaTypes:
    def test_new_turn_input_requires_new_messages(self) -> None:
        inp: NewTurnInput = {"new_messages": [HumanMessage(content="hello")]}
        assert len(inp["new_messages"]) == 1

    def test_root_state_accepts_messages_only(self) -> None:
        state: RootState = {"messages": []}
        assert state["messages"] == []


# ─────────────────────────────────────────────────────────────────────────────
# extract_question
# ─────────────────────────────────────────────────────────────────────────────


class TestExtractQuestion:
    def test_string_content(self) -> None:
        assert extract_question([HumanMessage(content="What is my balance?")]) == "What is my balance?"

    def test_multimodal_content(self) -> None:
        messages = [
            HumanMessage(
                content=[
                    {"type": "text", "text": "Add a task"},
                    {"type": "image_url", "image_url": {"url": "http://x"}},
                ]
            )
        ]
        assert extract_question(messages) == "Add a task"

    def test_last_human_message_wins(self) -> None:
        messages = [
            AIMessage(content="Hello"),
            HumanMessage(content="First question?"),
            AIMessage(content="I see."),
            HumanMessage(content="Second question!"),
        ]
        assert extract_question(messages) == "Second question!"

    def test_empty_when_only_ai_messages(self) -> None:
        assert extract_question([AIMessage(content="Hello")]) == ""


# ─────────────────────────────────────────────────────────────────────────────
# merge_app_results
# ─────────────────────────────────────────────────────────────────────────────


class TestMergeAppResults:
    def test_empty(self) -> None:
        assert merge_app_results([]) == ""

    def test_single_success(self) -> None:
        merged = merge_app_results(
            [{"app": "finance", "status": "success", "message": "Balance is $100.", "tool_results": []}]
        )
        assert "[finance]" in merged
        assert "Balance is $100." in merged

    def test_with_tool_results(self) -> None:
        merged = merge_app_results(
            [
                {
                    "app": "finance",
                    "status": "success",
                    "message": "Done.",
                    "tool_results": [
                        {"tool_name": "list_wallets", "ok": True, "data": [{"id": "w1"}], "error": None}
                    ],
                }
            ]
        )
        assert "list_wallets: OK" in merged

    def test_error_app(self) -> None:
        merged = merge_app_results(
            [
                {
                    "app": "todo",
                    "status": "failed",
                    "message": "Could not fetch tasks.",
                    "tool_results": [
                        {
                            "tool_name": "list_tasks",
                            "ok": False,
                            "data": None,
                            "error": {"message": "Network error", "code": "network"},
                        }
                    ],
                }
            ]
        )
        assert "[todo]" in merged
        assert "list_tasks: ERROR" in merged

    def test_multiple_apps(self) -> None:
        merged = merge_app_results(
            [
                {"app": "finance", "status": "success", "message": "Finance result.", "tool_results": []},
                {"app": "todo", "status": "no_action", "message": "Nothing to do.", "tool_results": []},
            ]
        )
        assert "[finance]" in merged
        assert "[todo]" in merged


# ─────────────────────────────────────────────────────────────────────────────
# decide_target_apps
# ─────────────────────────────────────────────────────────────────────────────


class _MockRoutingLLM:
    """Stub LLM that returns RoutingDecision based on question content."""

    def with_structured_output(self, schema):
        return self

    async def ainvoke(self, messages, **kwargs):
        from core.agents.root.schemas import AppDecision, RoutingDecision

        for msg in messages:
            if hasattr(msg, "content") and isinstance(msg.content, str):
                content_lower = msg.content.lower()
                if "finance" in content_lower:
                    return RoutingDecision(
                        app_decisions=[
                            AppDecision(
                                app_id="finance",
                                subtask="Check the user's finance balance.",
                            )
                        ]
                    )
                if "todo" in content_lower:
                    return RoutingDecision(
                        app_decisions=[
                            AppDecision(
                                app_id="todo",
                                subtask="Check the user's pending tasks.",
                            )
                        ]
                    )
        return RoutingDecision(app_decisions=[])


class _FailingLLM:
    async def ainvoke(self, *_args, **_kwargs) -> None:
        raise RuntimeError("LLM unavailable")


class _MockPlatformLLM:
    """Stub LLM that routes install/memory requests to platform."""

    def with_structured_output(self, schema):
        return self

    async def ainvoke(self, messages, **kwargs):
        from core.agents.root.schemas import PlatformDecision

        for msg in reversed(messages):
            if isinstance(getattr(msg, "content", None), str):
                content_lower = msg.content.lower()
                if "install" in content_lower or "remember" in content_lower:
                    return PlatformDecision(route="platform", reason="explicit platform request")
                break
        return PlatformDecision(route="none")


class TestRouteAndCraft:
    def test_returns_empty_when_no_installed_apps(self) -> None:
        decision = asyncio.run(
            route_and_craft(
                [HumanMessage(content="What is my balance?")],
                [],
            )
        )
        assert decision.app_decisions == []


class TestDetectPlatformRequest:
    def test_returns_platform_for_install_request(self, monkeypatch) -> None:
        monkeypatch.setattr("core.agents.root.routing.get_llm", lambda: _MockPlatformLLM())
        decision = asyncio.run(
            detect_platform_request(
                [HumanMessage(content="Install calendar for me")],
                ["todo"],
            )
        )
        assert decision.route == "platform"

    def test_returns_none_for_domain_request(self, monkeypatch) -> None:
        monkeypatch.setattr("core.agents.root.routing.get_llm", lambda: _MockPlatformLLM())
        decision = asyncio.run(
            detect_platform_request(
                [HumanMessage(content="Schedule a meeting tomorrow")],
                ["calendar"],
            )
        )
        assert decision.route == "none"

    def test_returns_matching_app_ids(self, monkeypatch) -> None:
        monkeypatch.setattr(
            "core.registry.PLUGIN_REGISTRY",
            {"finance": {"manifest": _finance_manifest()}},
        )
        monkeypatch.setattr(
            "core.agents.root.routing.get_llm",
            lambda: _MockRoutingLLM(),
        )
        messages = [HumanMessage(content="What is my finance balance?")]
        decision = asyncio.run(route_and_craft(messages, ["finance"]))
        assert [item.app_id for item in decision.app_decisions] == ["finance"]
        assert decision.app_decisions[0].subtask == "Check the user's finance balance."

    def test_fails_closed_on_llm_error(self, monkeypatch) -> None:
        monkeypatch.setattr(
            "core.registry.PLUGIN_REGISTRY",
            {"finance": {"manifest": _finance_manifest()}},
        )
        monkeypatch.setattr(
            "core.agents.root.routing.get_llm",
            lambda: _FailingLLM(),
        )
        decision = asyncio.run(
            route_and_craft(
                [HumanMessage(content="What is my balance?")],
                ["finance"],
            )
        )
        assert decision.app_decisions == []


# ─────────────────────────────────────────────────────────────────────────────
# direct_synthesize
# ─────────────────────────────────────────────────────────────────────────────


class TestSynthesize:
    def test_streams_tokens(self, monkeypatch) -> None:
        emitted: list[dict] = []

        async def fake_stream(_):
            yield MagicMock(content="Hello from direct!")

        mock_llm = MagicMock()
        mock_llm.astream = fake_stream
        monkeypatch.setattr("core.agents.root.synthesis.get_llm", lambda: mock_llm)

        result = asyncio.run(
            synthesize(
                messages=[HumanMessage(content="hi")],
                writer=lambda e: emitted.append(e),
                user_id="u1",
                store=None,
            )
        )
        assert result == "Hello from direct!"
        assert any(e.get("type") == "token" for e in emitted)

    def test_direct_synthesis_includes_installed_and_available_catalogs(self, monkeypatch) -> None:
        captured_prompts: list[object] = []

        async def fake_stream(prompt):
            captured_prompts.append(prompt)
            yield MagicMock(content="Use calendar.")

        mock_llm = MagicMock()
        mock_llm.astream = fake_stream
        monkeypatch.setattr("core.agents.root.synthesis.get_llm", lambda: mock_llm)
        monkeypatch.setattr(
            "core.registry.PLUGIN_REGISTRY",
            {
                "calendar": {"manifest": type("Manifest", (), {"agent_description": "Manage events."})()},
                "todo": {"manifest": type("Manifest", (), {"agent_description": "Manage tasks."})()},
            },
        )

        result = asyncio.run(
            synthesize(
                messages=[HumanMessage(content="I need help scheduling")],
                writer=lambda _: None,
                user_id="u1",
                store=None,
                installed_app_ids=["calendar"],
            )
        )

        assert result == "Use calendar."
        assert len(captured_prompts) == 1
        prompt = captured_prompts[0]
        assert isinstance(prompt, list)
        system_message = prompt[0]
        assert "Manage events." in system_message.content
        assert "Manage tasks." in system_message.content
        assert "<installed_apps>" in system_message.content
        assert "<available_apps>" in system_message.content

    def test_fails_closed_when_llm_raises(self, monkeypatch) -> None:
        async def bad_stream(_):
            await asyncio.sleep(0)
            raise RuntimeError("LLM is down")
            yield None

        mock_llm = MagicMock()
        mock_llm.astream = bad_stream
        monkeypatch.setattr("core.agents.root.synthesis.get_llm", lambda: mock_llm)

        result = asyncio.run(
            synthesize(
                messages=[HumanMessage(content="hi")],
                writer=lambda _: None,
                user_id="u1",
                store=None,
            )
        )
        # Must not raise; must return an error string
        assert "error" in result.lower() or "LLM" in result


# ─────────────────────────────────────────────────────────────────────────────
# _parse_new_turn
# ─────────────────────────────────────────────────────────────────────────────


class TestParseNewTurn:
    @staticmethod
    def _stub_sanitizer(monkeypatch) -> None:
        module = types.ModuleType("core.utils.sanitizer")

        async def sanitize_user_content_async(text: str) -> tuple[str, list[str]]:
            return text.lower(), []

        module.sanitize_user_content_async = sanitize_user_content_async
        monkeypatch.setitem(sys.modules, "core.utils.sanitizer", module)

    def test_parses_user_message(self, monkeypatch) -> None:
        from core.agents.root.agent import _parse_new_turn

        self._stub_sanitizer(monkeypatch)
        raw = [{"role": "user", "content": "hello world", "id": "msg-1"}]
        out = asyncio.run(_parse_new_turn(raw))
        assert len(out) == 1
        assert out[0].content == "hello world"
        assert out[0].id == "msg-1"

    def test_parses_multimodal_user_message(self, monkeypatch) -> None:
        from core.agents.root.agent import _parse_new_turn

        self._stub_sanitizer(monkeypatch)
        raw = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Check this"},
                    {"type": "image_url", "image_url": {"url": "http://x"}},
                ],
            }
        ]
        out = asyncio.run(_parse_new_turn(raw))
        assert len(out) == 1
        assert "check this" in out[0].content  # sanitizer lowercases

    def test_ignores_assistant_and_tool_messages(self, monkeypatch) -> None:
        from core.agents.root.agent import _parse_new_turn

        self._stub_sanitizer(monkeypatch)
        raw = [
            {"role": "assistant", "content": "Hello"},
            {"role": "user", "content": "hi"},
            {"role": "tool", "content": "result"},
        ]
        out = asyncio.run(_parse_new_turn(raw))
        assert len(out) == 1
        assert out[0].content == "hi"

    def test_returns_empty_list_when_no_user_message(self, monkeypatch) -> None:
        from core.agents.root.agent import _parse_new_turn

        self._stub_sanitizer(monkeypatch)
        raw = [{"role": "assistant", "content": "Hello"}]
        out = asyncio.run(_parse_new_turn(raw))
        assert out == []


# ─────────────────────────────────────────────────────────────────────────────
# Graph singleton + refresh
# ─────────────────────────────────────────────────────────────────────────────


class TestGraphSingleton:
    def test_returns_same_instance(self, monkeypatch) -> None:
        from core.agents.root.graph import get_root_agent_graph

        mock_store = InMemoryStore()
        mock_checkpointer = InMemorySaver()
        monkeypatch.setattr("core.db.get_store", lambda: mock_store)
        monkeypatch.setattr("core.db.get_checkpointer", lambda: mock_checkpointer)

        # Reset the module-level singleton
        import core.agents.root.graph as graph_module

        graph_module._root_agent_graph = None

        g1 = get_root_agent_graph()
        g2 = get_root_agent_graph()
        assert g1 is g2

    def test_refresh_invalidates_singleton(self, monkeypatch) -> None:
        from core.agents.root.graph import get_root_agent_graph, refresh_graph

        mock_store = InMemoryStore()
        mock_checkpointer = InMemorySaver()
        monkeypatch.setattr("core.db.get_store", lambda: mock_store)
        monkeypatch.setattr("core.db.get_checkpointer", lambda: mock_checkpointer)

        import core.agents.root.graph as graph_module

        graph_module._root_agent_graph = None

        g1 = get_root_agent_graph()
        refresh_graph()
        g2 = get_root_agent_graph()
        assert g1 is not g2
