"""Tests for the parallel LangGraph v2 root agent architecture."""

from __future__ import annotations

import asyncio
import sys
import types
from collections.abc import AsyncIterator, Sequence
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import MagicMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore

from core.agents.root.context import build_dispatch_catalog, extract_question
from core.agents.root.graph import (
    _blocked_followup_apps,
    _build_synthesis_context,
    _plan_followups,
    _round_has_followup_signal,
)
from core.agents.root.merged_response import merge_app_results
from core.agents.root.prompts import (
    build_root_direct_synthesis_prompt,
    build_root_dispatch_prompt,
    build_root_followup_prompt,
)
from core.agents.root.routing import plan_followups, route_and_craft
from core.agents.root.runtime_context import RootGraphContext
from core.agents.root.schemas import NewTurnInput, RootGraphEvent, RootState
from core.agents.root.synthesis import synthesize
from shared.schemas import AppManifestSchema


def _finance_manifest() -> AppManifestSchema:
    return AppManifestSchema(
        id="finance",
        name="Finance",
        version="1.0.0",
        description="Track spending and budgets.",
        icon="Wallet",
        color="oklch(0.72 0.19 145)",
        widgets=[],
        agent_description="Helps users manage budgets and transactions.",
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

    def test_root_dispatch_prompt_is_dispatch_only(self) -> None:
        prompt = build_root_dispatch_prompt("<catalog />")
        assert "You are not answering the user" in prompt
        assert "Only return structured dispatch decisions." in prompt
        assert "durable facts or preferences worth remembering" in prompt
        assert "workspace-wide summary" in prompt
        assert "smallest observable summary" in prompt
        assert "history or audit capabilities" in prompt

    def test_dispatch_catalog_describes_proactive_memory(self) -> None:
        catalog = build_dispatch_catalog([])
        assert "proactively store durable user context worth remembering" in catalog

    def test_root_direct_prompt_is_not_general_assistant(self) -> None:
        prompt = build_root_direct_synthesis_prompt("installed", "available")
        assert "You are not a general-purpose assistant." in prompt
        assert "must not draft generic messages" in prompt
        assert "recommend installing that app instead" in prompt
        assert "prefer aggregating the relevant installed apps" in prompt

    def test_root_followup_prompt_is_supervisor_only(self) -> None:
        prompt = build_root_followup_prompt("<catalog />")
        assert "root supervisor" in prompt
        assert "another targeted worker round" in prompt
        assert "Never repeat a prior subtask" in prompt
        assert "Only return structured supervisor decisions." in prompt

    def test_root_merged_prompt_handles_failure_judgment(self) -> None:
        from core.agents.root.prompts import build_root_merged_synthesis_prompt

        prompt = build_root_merged_synthesis_prompt()
        assert "user-actionable" in prompt
        assert "permission/tier related" in prompt


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
            [
                {
                    "app": "finance",
                    "status": "success",
                    "ok": True,
                    "subtask": "Summarize finance balance.",
                    "message": "Balance is $100.",
                    "tool_results": [],
                    "error": "",
                }
            ]
        )
        assert "[finance]" in merged
        assert "Balance is $100." in merged

    def test_with_tool_results(self) -> None:
        merged = merge_app_results(
            [
                {
                    "app": "finance",
                    "status": "success",
                    "ok": True,
                    "subtask": "List finance wallets.",
                    "message": "Done.",
                    "tool_results": [
                        {
                            "tool_name": "list_wallets",
                            "tool_call_id": None,
                            "ok": True,
                            "data": [{"id": "w1"}],
                            "error": None,
                        }
                    ],
                    "error": "",
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
                    "ok": False,
                    "subtask": "Fetch todo tasks.",
                    "message": "Could not fetch tasks.",
                    "tool_results": [
                        {
                            "tool_name": "list_tasks",
                            "tool_call_id": None,
                            "ok": False,
                            "data": None,
                            "error": {"message": "Network error", "code": "network"},
                        }
                    ],
                    "error": "Network error",
                }
            ]
        )
        assert "[todo]" in merged
        assert "list_tasks: ERROR" in merged

    def test_multiple_apps(self) -> None:
        merged = merge_app_results(
            [
                {
                    "app": "finance",
                    "status": "success",
                    "ok": True,
                    "subtask": "Summarize finance changes.",
                    "message": "Finance result.",
                    "tool_results": [],
                    "error": "",
                },
                {
                    "app": "todo",
                    "status": "no_action",
                    "ok": True,
                    "subtask": "Summarize todo changes.",
                    "message": "Nothing to do.",
                    "tool_results": [],
                    "error": "",
                },
            ]
        )
        assert "[finance]" in merged
        assert "[todo]" in merged


# ─────────────────────────────────────────────────────────────────────────────
# decide_target_apps
# ─────────────────────────────────────────────────────────────────────────────


class _MockRoutingLLM:
    """Stub LLM that returns RoutingDecision based on question content."""

    def with_structured_output(self, schema: object, **kwargs: object) -> _MockRoutingLLM:
        return self

    async def ainvoke(self, messages: Sequence[Any], **kwargs: object) -> Any:
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
    def with_structured_output(self, schema: object, **kwargs: object) -> _FailingLLM:
        return self

    async def ainvoke(self, *_args: object, **_kwargs: object) -> None:
        raise RuntimeError("LLM unavailable")


class _EmptyRoutingLLM:
    def with_structured_output(self, schema: object, **kwargs: object) -> _EmptyRoutingLLM:
        return self

    async def ainvoke(self, messages: Sequence[Any], **kwargs: object) -> Any:
        from core.agents.root.schemas import RoutingDecision

        return RoutingDecision(app_decisions=[])


class _MockPlatformDispatchLLM:
    """Stub LLM that can route platform-only or mixed worker dispatch."""

    def with_structured_output(self, schema: object, **kwargs: object) -> _MockPlatformDispatchLLM:
        return self

    async def ainvoke(self, messages: Sequence[Any], **kwargs: object) -> Any:
        from core.agents.root.schemas import AppDecision, RoutingDecision

        for msg in reversed(messages):
            if isinstance(getattr(msg, "content", None), str):
                content_lower = msg.content.lower()
                if "install" in content_lower and "finance" in content_lower:
                    return RoutingDecision(
                        app_decisions=[
                            AppDecision(
                                app_id="platform",
                                subtask="Install the calendar app if it is available.",
                            ),
                            AppDecision(
                                app_id="finance",
                                subtask="Summarize the user's finance balance after the install request is handled.",
                            ),
                        ]
                    )
                if "install" in content_lower or "remember" in content_lower:
                    return RoutingDecision(
                        app_decisions=[
                            AppDecision(
                                app_id="platform",
                                subtask="Handle the user's platform or memory request.",
                            )
                        ]
                    )
                break
        return RoutingDecision(app_decisions=[])


class _MockDuplicateDispatchLLM:
    def with_structured_output(self, schema: object, **kwargs: object) -> _MockDuplicateDispatchLLM:
        return self

    async def ainvoke(self, messages: Sequence[Any], **kwargs: object) -> Any:
        from core.agents.root.schemas import AppDecision, RoutingDecision

        return RoutingDecision(
            app_decisions=[
                AppDecision(app_id="platform", subtask="Install calendar."),
                AppDecision(app_id="platform", subtask="Remember the user's preference."),
            ]
        )


class _MockWorkspaceSummaryDispatchLLM:
    def with_structured_output(
        self,
        schema: object,
        **kwargs: object,
    ) -> _MockWorkspaceSummaryDispatchLLM:
        return self

    async def ainvoke(self, messages: Sequence[Any], **kwargs: object) -> Any:
        return _workspace_summary_decision()


class _MockFollowupRedispatchLLM:
    def with_structured_output(
        self,
        schema: object,
        **kwargs: object,
    ) -> _MockFollowupRedispatchLLM:
        return self

    async def ainvoke(self, messages: Sequence[Any], **kwargs: object) -> Any:
        from core.agents.root.schemas import AppDecision, FollowupDecision

        return FollowupDecision(
            action="redispatch",
            rationale="Need a narrower todo lookup.",
            app_decisions=[
                AppDecision(
                    app_id="todo",
                    subtask="Use a narrower todo summary for tasks due today only.",
                )
            ],
        )


class _MockFollowupStopLLM:
    def with_structured_output(
        self,
        schema: object,
        **kwargs: object,
    ) -> _MockFollowupStopLLM:
        return self

    async def ainvoke(self, messages: Sequence[Any], **kwargs: object) -> Any:
        from core.agents.root.schemas import FollowupDecision

        return FollowupDecision(
            action="synthesize",
            rationale="Current evidence is sufficient.",
            app_decisions=[],
        )


def _workspace_summary_decision() -> Any:
    from core.agents.root.schemas import AppDecision, RoutingDecision

    return RoutingDecision(
        app_decisions=[
            AppDecision(
                app_id="calendar",
                subtask="Summarize calendar events added, changed, or scheduled today.",
            ),
            AppDecision(
                app_id="todo",
                subtask="Summarize tasks created, completed, or updated today.",
            ),
            AppDecision(
                app_id="finance",
                subtask="Summarize finance activity or budget changes recorded today.",
            ),
        ]
    )


class TestRouteAndCraft:
    def test_returns_empty_when_no_relevant_worker_exists(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr("core.agents.root.routing.get_llm", lambda: _EmptyRoutingLLM())
        decision = asyncio.run(
            route_and_craft(
                [HumanMessage(content="What is my balance?")],
                [],
            )
        )
        assert decision.app_decisions == []

    def test_routes_platform_for_install_request(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr("core.agents.root.routing.get_llm", lambda: _MockPlatformDispatchLLM())
        decision = asyncio.run(
            route_and_craft(
                [HumanMessage(content="Install calendar for me")],
                [],
            )
        )
        assert [item.app_id for item in decision.app_decisions] == ["platform"]

    def test_routes_platform_for_install_request_with_installed_apps_present(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr("core.agents.root.routing.get_llm", lambda: _MockPlatformDispatchLLM())
        decision = asyncio.run(
            route_and_craft(
                [HumanMessage(content="Install calendar for me")],
                ["todo"],
            )
        )
        assert [item.app_id for item in decision.app_decisions] == ["platform"]

    def test_routes_platform_and_domain_workers_together(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            "core.registry.PLUGIN_REGISTRY",
            {"finance": {"manifest": _finance_manifest()}},
        )
        monkeypatch.setattr("core.agents.root.routing.get_llm", lambda: _MockPlatformDispatchLLM())
        decision = asyncio.run(
            route_and_craft(
                [HumanMessage(content="Install calendar and check my finance balance")],
                ["finance"],
            )
        )
        assert [item.app_id for item in decision.app_decisions] == ["platform", "finance"]

    def test_deduplicates_same_worker_dispatch(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr("core.agents.root.routing.get_llm", lambda: _MockDuplicateDispatchLLM())
        decision = asyncio.run(
            route_and_craft(
                [HumanMessage(content="Install calendar and remember my preference")],
                [],
            )
        )
        assert [item.app_id for item in decision.app_decisions] == ["platform"]

    def test_routes_workspace_summary_across_relevant_installed_apps(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr("core.agents.root.routing.get_llm", lambda: _MockWorkspaceSummaryDispatchLLM())
        decision = asyncio.run(
            route_and_craft(
                [HumanMessage(content="summarize what changed across my workspace today")],
                ["calendar", "todo", "finance"],
            )
        )
        assert [item.app_id for item in decision.app_decisions] == ["calendar", "todo", "finance"]

    def test_returns_matching_app_ids(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
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

    def test_bubbles_llm_error_for_task_retry(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            "core.registry.PLUGIN_REGISTRY",
            {"finance": {"manifest": _finance_manifest()}},
        )
        monkeypatch.setattr(
            "core.agents.root.routing.get_llm",
            lambda: _FailingLLM(),
        )
        try:
            asyncio.run(
                route_and_craft(
                    [HumanMessage(content="What is my balance?")],
                    ["finance"],
                )
            )
        except RuntimeError as exc:
            assert "LLM unavailable" in str(exc)
        else:
            raise AssertionError("route_and_craft should raise so task-level retry can run")


class TestPlanFollowups:
    def test_can_request_another_targeted_round(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr("core.agents.root.routing.get_llm", lambda: _MockFollowupRedispatchLLM())

        decision = asyncio.run(
            plan_followups(
                [HumanMessage(content="summarize what changed across my workspace today")],
                ["todo"],
                current_round_outcomes=[
                    {
                        "app": "todo",
                        "status": "failed",
                        "ok": False,
                        "subtask": "Summarize all todo list changes that occurred today.",
                        "message": "The todo assistant needed too many steps to complete this request. Please try a simpler query.",
                        "tool_results": [],
                        "error": "The todo assistant needed too many steps to complete this request. Please try a simpler query.",
                        "retryable": True,
                        "failure_kind": "recursion_limit",
                    }
                ],
                all_worker_outcomes=[
                    {
                        "app": "todo",
                        "status": "failed",
                        "ok": False,
                        "subtask": "Summarize all todo list changes that occurred today.",
                        "message": "The todo assistant needed too many steps to complete this request. Please try a simpler query.",
                        "tool_results": [],
                        "error": "The todo assistant needed too many steps to complete this request. Please try a simpler query.",
                        "retryable": True,
                        "failure_kind": "recursion_limit",
                    }
                ],
                blocked_app_ids=set(),
                dispatch_round=1,
                max_rounds=3,
            )
        )

        assert decision.action == "redispatch"
        assert [item.app_id for item in decision.app_decisions] == ["todo"]

    def test_can_stop_when_current_evidence_is_enough(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr("core.agents.root.routing.get_llm", lambda: _MockFollowupStopLLM())

        decision = asyncio.run(
            plan_followups(
                [HumanMessage(content="what changed today?")],
                ["finance"],
                current_round_outcomes=[
                    {
                        "app": "finance",
                        "status": "success",
                        "ok": True,
                        "subtask": "Summarize finance activity today.",
                        "message": "No finance changes occurred today.",
                        "tool_results": [],
                        "error": "",
                    }
                ],
                all_worker_outcomes=[
                    {
                        "app": "finance",
                        "status": "success",
                        "ok": True,
                        "subtask": "Summarize finance activity today.",
                        "message": "No finance changes occurred today.",
                        "tool_results": [],
                        "error": "",
                    }
                ],
                blocked_app_ids=set(),
                dispatch_round=1,
                max_rounds=3,
            )
        )

        assert decision.action == "synthesize"
        assert decision.app_decisions == []


class TestGraphFollowupSignals:
    def test_round_has_no_followup_signal_for_plain_success(self) -> None:
        assert _round_has_followup_signal(
            [
                {
                    "app": "finance",
                    "status": "success",
                    "ok": True,
                    "subtask": "Summarize finance activity today.",
                    "message": "No finance changes occurred today.",
                    "tool_results": [],
                    "error": "",
                }
            ]
        ) is False

    def test_round_has_followup_signal_for_retryable_failure(self) -> None:
        assert _round_has_followup_signal(
            [
                {
                    "app": "calendar",
                    "status": "failed",
                    "ok": False,
                    "subtask": "Summarize calendar changes today.",
                    "message": "The calendar assistant timed out.",
                    "tool_results": [],
                    "error": "The calendar assistant timed out.",
                    "retryable": True,
                    "failure_kind": "timeout",
                }
            ]
        ) is True

    def test_blocks_capability_limited_apps_from_same_turn_followups(self) -> None:
        blocked = _blocked_followup_apps(
            [
                {
                    "app": "todo",
                    "status": "success",
                    "ok": True,
                    "subtask": "Summarize todo changes today.",
                    "message": "Current summary is available, but detailed history is not.",
                    "tool_results": [],
                    "error": "",
                    "followup_useful": False,
                    "capability_limit": "no_history_support",
                }
            ]
        )

        assert blocked == {"todo"}

    def test_plan_followups_stops_before_planner_without_signal(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        emitted: list[dict[str, object]] = []

        def _unexpected_followup_planner(*_args: object, **_kwargs: object) -> object:
            raise AssertionError("follow-up planner should not run when no signal exists")

        monkeypatch.setattr(
            "core.agents.root.graph.get_stream_writer",
            lambda: lambda event: emitted.append(cast(dict[str, object], event)),
        )
        monkeypatch.setattr(
            "core.agents.root.graph.plan_followups",
            _unexpected_followup_planner,
        )

        runtime = SimpleNamespace(
            context=RootGraphContext(
                user_id="u1",
                thread_id="thread-1",
                user_tz="Asia/Ho_Chi_Minh",
                installed_app_ids=["calendar"],
                assistant_message_id=None,
                worker_semaphore=asyncio.Semaphore(1),
            )
        )

        result = asyncio.run(
            _plan_followups(
                {
                    "messages": [HumanMessage(content="what changed today?")],
                    "worker_outcomes": [
                        {
                            "app": "calendar",
                            "status": "success",
                            "ok": True,
                            "subtask": "Summarize calendar activity today.",
                            "message": "No calendar changes occurred today.",
                            "tool_results": [],
                            "error": "",
                        }
                    ],
                    "current_round_outcomes": [
                        {
                            "app": "calendar",
                            "status": "success",
                            "ok": True,
                            "subtask": "Summarize calendar activity today.",
                            "message": "No calendar changes occurred today.",
                            "tool_results": [],
                            "error": "",
                        }
                    ],
                    "dispatch_round": 1,
                },
                runtime,
            )
        )

        assert result == {"dispatches": [], "current_round_outcomes": []}
        assert emitted[-1] == {
            "type": "thinking",
            "step_id": "followup",
            "label": "Current app results are already sufficient",
            "status": "done",
        }


# ─────────────────────────────────────────────────────────────────────────────
# direct_synthesize
# ─────────────────────────────────────────────────────────────────────────────


class TestSynthesize:
    def test_streams_tokens(self, monkeypatch: pytest.MonkeyPatch) -> None:
        emitted: list[RootGraphEvent] = []

        async def fake_stream(_: object) -> AsyncIterator[MagicMock]:
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

    def test_direct_synthesis_includes_installed_and_available_catalogs(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        captured_prompts: list[object] = []

        async def fake_stream(prompt: object) -> AsyncIterator[MagicMock]:
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
        assert "ROOT FALLBACK mode" in system_message.content
        assert "recommend installing that app instead" in system_message.content

    def test_fails_closed_when_llm_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def bad_stream(_: object) -> AsyncIterator[None]:
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


class TestGraphSynthesisContext:
    def test_includes_failed_worker_results(self) -> None:
        merged = _build_synthesis_context(
            [
                {
                    "app": "platform",
                    "status": "failed",
                    "ok": False,
                    "subtask": "Install a paid-only app.",
                    "message": "Upgrade to paid.",
                    "tool_results": [],
                    "error": "Upgrade to paid.",
                },
                {
                    "app": "finance",
                    "status": "success",
                    "ok": True,
                    "subtask": "Summarize finance balance.",
                    "message": "Balance is $100.",
                    "tool_results": [],
                    "error": "",
                },
            ]
        )
        assert "[platform]" in merged
        assert "[status: failed]" in merged
        assert "Upgrade to paid." in merged
        assert "[finance]" in merged

    def test_final_ai_message_reuses_stream_message_id(self) -> None:
        from asyncio import Semaphore

        from core.agents.root.graph import _build_final_ai_message
        from core.agents.root.runtime_context import RootGraphContext

        runtime = SimpleNamespace(
            context=RootGraphContext(
                user_id="u1",
                thread_id="thread-1",
                user_tz="Asia/Ho_Chi_Minh",
                installed_app_ids=["calendar"],
                assistant_message_id="msg_stream_123",
                worker_semaphore=Semaphore(1),
            )
        )

        message = _build_final_ai_message("Hello", runtime)
        assert message.id == "msg_stream_123"
        assert message.text == "Hello"


class TestFollowupGuards:
    def test_filter_followup_dispatches_skips_duplicate_subtasks(self) -> None:
        from core.agents.root.graph import _filter_followup_dispatches

        dispatches = [
            {
                "app_id": "calendar",
                "subtask": "Summarize calendar activity today.",
            }
        ]
        worker_outcomes = [
            {
                "app": "calendar",
                "status": "failed",
                "ok": False,
                "subtask": "Summarize calendar activity today.",
                "message": "Timed out.",
                "tool_results": [],
                "error": "Timed out.",
                "retryable": True,
                "failure_kind": "timeout",
            }
        ]

        assert _filter_followup_dispatches(dispatches, worker_outcomes) == []

    def test_filter_followup_dispatches_blocks_non_retryable_apps(self) -> None:
        from core.agents.root.graph import _filter_followup_dispatches

        dispatches = [
            {
                "app_id": "finance",
                "subtask": "Retry finance lookup with the same wallet scope.",
            }
        ]
        worker_outcomes = [
            {
                "app": "finance",
                "status": "failed",
                "ok": False,
                "subtask": "Summarize finance activity today.",
                "message": "Internal error.",
                "tool_results": [],
                "error": "Internal error.",
                "retryable": False,
                "failure_kind": "internal_error",
            }
        ]

        assert _filter_followup_dispatches(dispatches, worker_outcomes) == []

    def test_root_recursion_limit_scales_with_installed_apps(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from core.agents.root.agent import _compute_root_recursion_limit

        monkeypatch.setattr("core.agents.root.agent.settings.root_agent_max_dispatch_rounds", 3)

        assert _compute_root_recursion_limit(0) >= 25
        assert _compute_root_recursion_limit(10) > _compute_root_recursion_limit(1)


# ─────────────────────────────────────────────────────────────────────────────
# _parse_new_turn
# ─────────────────────────────────────────────────────────────────────────────


class TestParseNewTurn:
    @staticmethod
    def _stub_sanitizer(monkeypatch: pytest.MonkeyPatch) -> None:
        module = types.ModuleType("core.utils.sanitizer")

        async def sanitize_user_content_async(text: str) -> tuple[str, list[str]]:
            return text.lower(), []

        setattr(module, "sanitize_user_content_async", sanitize_user_content_async)
        monkeypatch.setitem(sys.modules, "core.utils.sanitizer", module)

    def test_parses_user_message(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from core.agents.root.agent import _parse_new_turn

        self._stub_sanitizer(monkeypatch)
        raw = cast(list[Any], [{"role": "user", "content": "hello world", "id": "msg-1"}])
        out = asyncio.run(_parse_new_turn(raw))
        assert len(out) == 1
        assert out[0].content == "hello world"
        assert out[0].id == "msg-1"

    def test_parses_multimodal_user_message(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from core.agents.root.agent import _parse_new_turn

        self._stub_sanitizer(monkeypatch)
        raw = cast(list[Any], [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Check this"},
                    {"type": "image_url", "image_url": {"url": "http://x"}},
                ],
            }
        ])
        out = asyncio.run(_parse_new_turn(raw))
        assert len(out) == 1
        assert "check this" in out[0].content  # sanitizer lowercases

    def test_ignores_assistant_and_tool_messages(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from core.agents.root.agent import _parse_new_turn

        self._stub_sanitizer(monkeypatch)
        raw = cast(list[Any], [
            {"role": "assistant", "content": "Hello"},
            {"role": "user", "content": "hi"},
            {"role": "tool", "content": "result"},
        ])
        out = asyncio.run(_parse_new_turn(raw))
        assert len(out) == 1
        assert out[0].content == "hi"

    def test_returns_empty_list_when_no_user_message(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from core.agents.root.agent import _parse_new_turn

        self._stub_sanitizer(monkeypatch)
        raw = cast(list[Any], [{"role": "assistant", "content": "Hello"}])
        out = asyncio.run(_parse_new_turn(raw))
        assert out == []


# ─────────────────────────────────────────────────────────────────────────────
# Graph singleton + refresh
# ─────────────────────────────────────────────────────────────────────────────


class TestGraphSingleton:
    def test_returns_same_instance(self, monkeypatch: pytest.MonkeyPatch) -> None:
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

    def test_refresh_invalidates_singleton(self, monkeypatch: pytest.MonkeyPatch) -> None:
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


class _StubStore:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def aput(
        self,
        namespace: object,
        key: object,
        value: object,
        index: object,
    ) -> None:
        self.calls.append(
            {
                "namespace": namespace,
                "key": key,
                "value": value,
                "index": index,
            }
        )


class TestRootMemory:
    def test_save_memory_persists_metadata(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from core.agents.root.memory import persist_memory

        store = cast(Any, _StubStore())

        module = types.ModuleType("core.utils.sanitizer")

        async def sanitize_for_memory_async(text: str) -> str:
            return text.strip()

        setattr(module, "sanitize_for_memory_async", sanitize_for_memory_async)
        monkeypatch.setitem(sys.modules, "core.utils.sanitizer", module)

        key = asyncio.run(
            persist_memory(
                store,
                user_id="u1",
                content="prefers daily summaries",
                category="preferences",
                source_thread_id="thread-123",
            )
        )

        assert key.startswith("mem_")
        assert len(store.calls) == 1
        saved = store.calls[0]["value"]
        assert saved["content"] == "prefers daily summaries"
        assert saved["category"] == "preferences"
        assert saved["source_thread_id"] == "thread-123"
        assert saved["saved_at"]

    def test_platform_save_memory_returns_sanitized_content(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from core.agents.root.platform_tools import save_memory_tool_impl

        store = cast(Any, _StubStore())

        module = types.ModuleType("core.utils.sanitizer")

        async def sanitize_for_memory_async(text: str) -> str:
            return text.strip().lower()

        setattr(module, "sanitize_for_memory_async", sanitize_for_memory_async)
        monkeypatch.setitem(sys.modules, "core.utils.sanitizer", module)

        result = asyncio.run(
            save_memory_tool_impl(
                store,
                user_id="u1",
                content="  Prefers Daily Summaries  ",
                category="preferences",
                source_thread_id="thread-123",
            )
        )

        assert result["content"] == "prefers daily summaries"
        saved = store.calls[0]["value"]
        assert saved["content"] == "prefers daily summaries"
