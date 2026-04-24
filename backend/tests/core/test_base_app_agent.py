from __future__ import annotations

import asyncio

import pytest
from langchain_core.messages import AIMessage
from langchain_core.tools import BaseTool
from langgraph.errors import GraphRecursionError
from pydantic import ValidationError

from core.agents.app_state import AppAgentResponse
from core.agents.base_app import BaseAppAgent


class _StubGraph:
    async def ainvoke(
        self,
        _input: dict[str, object],
        *,
        config: dict[str, object],
        context: object,
    ) -> dict[str, object]:
        return {
            "messages": [AIMessage(content="Budget updated successfully.")],
            "structured_response": AppAgentResponse(message="Budget updated successfully."),
            "tool_results": [
                {
                    "tool_name": "finance_update_budget",
                    "tool_call_id": "call_123",
                    "ok": True,
                    "data": {"budget_id": "b1"},
                    "error": None,
                }
            ],
        }


class _StubAgent(BaseAppAgent):
    app_id = "finance"

    def tools(self) -> list[BaseTool]:
        return []

    def build_prompt(self) -> str:
        return "Finance helper"


class TestBaseAppAgent:
    def test_delegate_reads_tool_results_from_explicit_state(self) -> None:
        agent = _StubAgent()
        agent._graph = _StubGraph()

        result = asyncio.run(
            agent.delegate(
                subtask="Update the monthly food budget to 5 million VND.",
                thread_id="thread_1",
                user_id="user_1",
                config={"configurable": {"user_tz": "Asia/Ho_Chi_Minh"}},
            )
        )

        assert result["status"] == "success"
        assert result["message"] == "Budget updated successfully."
        assert result["answer_state"] == "answered"
        assert result["contained_mutation"] is False
        assert result["tool_results"] == [
            {
                "tool_name": "finance_update_budget",
                "tool_call_id": "call_123",
                "ok": True,
                "data": {"budget_id": "b1"},
                "error": None,
                "is_mutating": False,
            }
        ]

    def test_delegate_exposes_structured_followup_metadata(self) -> None:
        class _StructuredResponseGraph:
            async def ainvoke(
                self,
                _input: dict[str, object],
                *,
                config: dict[str, object],
                context: object,
            ) -> dict[str, object]:
                return {
                    "messages": [
                        AIMessage(
                            content="Current finance state shows no new activity today.",
                        )
                    ],
                    "structured_response": AppAgentResponse(
                        message="Current finance state shows no new activity today.",
                        answer_state="partial",
                        evidence_summary="The current summary shows no new activity.",
                        followup_useful=True,
                        followup_hint="Check only uncategorized transactions from today.",
                        stop_reason="tool_budget",
                    ),
                    "tool_results": [
                        {
                            "tool_name": "finance_get_summary",
                            "tool_call_id": "call_456",
                            "ok": True,
                            "data": {"summary": "no changes"},
                            "error": None,
                            "is_mutating": False,
                        }
                    ],
                }

        agent = _StubAgent()
        agent._graph = _StructuredResponseGraph()

        result = asyncio.run(
            agent.delegate(
                subtask="Summarize finance changes today.",
                thread_id="thread_1",
                user_id="user_1",
                config={"configurable": {"user_tz": "Asia/Ho_Chi_Minh"}},
            )
        )

        assert result["status"] == "partial"
        assert result["followup_useful"] is True
        assert result["followup_hint"] == "Check only uncategorized transactions from today."
        assert result["stop_reason"] == "tool_budget"

    def test_delegate_requires_explicit_structured_response(self) -> None:
        class _MissingStructuredResponseGraph:
            async def ainvoke(
                self,
                _input: dict[str, object],
                *,
                config: dict[str, object],
                context: object,
            ) -> dict[str, object]:
                return {
                    "messages": [AIMessage(content="Fallback text should not be used.")],
                    "tool_results": [],
                }

        agent = _StubAgent()
        agent._graph = _MissingStructuredResponseGraph()

        result = asyncio.run(
            agent.delegate(
                subtask="Summarize my finance status.",
                thread_id="thread_1",
                user_id="user_1",
                config={"configurable": {"user_tz": "Asia/Ho_Chi_Minh"}},
            )
        )

        assert result["status"] == "failed"
        assert result["failure_kind"] == "invalid_structured_response"

    def test_delegate_drops_null_tool_results_entries(self) -> None:
        class _NullToolResultGraph:
            async def ainvoke(
                self,
                _input: dict[str, object],
                *,
                config: dict[str, object],
                context: object,
            ) -> dict[str, object]:
                return {
                    "messages": [AIMessage(content="Need account clarification.")],
                    "structured_response": AppAgentResponse(
                        message="Need account clarification.",
                        answer_state="needs_user_input",
                        missing_information=["account name"],
                        stop_reason="missing_user_input",
                    ),
                    "tool_results": [None],
                }

        agent = _StubAgent()
        agent._graph = _NullToolResultGraph()

        result = asyncio.run(
            agent.delegate(
                subtask="Clarify the target account.",
                thread_id="thread_1",
                user_id="user_1",
                config={"configurable": {"user_tz": "Asia/Ho_Chi_Minh"}},
            )
        )

        assert result["status"] == "awaiting_confirmation"
        assert result["tool_results"] == []

    def test_delegate_uses_child_agent_timeout_setting(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        class _SleepingGraph:
            async def ainvoke(
                self,
                _input: dict[str, object],
                *,
                config: dict[str, object],
                context: object,
            ) -> dict[str, object]:
                await asyncio.sleep(0.05)
                return {
                    "messages": [AIMessage(content="Should not finish before timeout.")],
                    "structured_response": AppAgentResponse(message="Should not finish before timeout."),
                    "tool_results": [],
                }

        agent = _StubAgent()
        agent._graph = _SleepingGraph()
        monkeypatch.setattr("core.agents.base_app.settings.child_agent_timeout_seconds", 0.01)

        result = asyncio.run(
            agent.delegate(
                subtask="Summarize my finance status.",
                thread_id="thread_1",
                user_id="user_1",
                config={"configurable": {"user_tz": "Asia/Ho_Chi_Minh"}},
            )
        )

        assert result["status"] == "failed"
        assert "timed out while completing that request" in result["message"].lower()
        assert "language model" not in result["message"].lower()

    def test_delegate_recovers_partial_from_child_checkpoint(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        class _RecoveredSnapshot:
            values = {
                "tool_results": [
                    {
                        "tool_name": "todo_list_tasks",
                        "tool_call_id": "call_789",
                        "ok": True,
                        "data": [{"id": "task_1"}],
                        "error": None,
                    }
                ]
            }

        class _CheckpointGraph:
            async def ainvoke(
                self,
                _input: dict[str, object],
                *,
                config: dict[str, object],
                context: object,
            ) -> dict[str, object]:
                raise GraphRecursionError("too many steps")

            async def aget_state(self, config: dict[str, object]) -> _RecoveredSnapshot:
                return _RecoveredSnapshot()

        agent = _StubAgent()
        agent._graph = _CheckpointGraph()
        monkeypatch.setattr("core.agents.base_app.settings.child_agent_checkpoint_enabled", True)

        result = asyncio.run(
            agent.delegate(
                subtask="List my tasks.",
                thread_id="thread:1",
                user_id="user_1",
                config={
                    "configurable": {
                        "user_tz": "Asia/Ho_Chi_Minh",
                        "turn_id": "turn_123",
                        "round_index": 2,
                        "attempt_index": 1,
                    }
                },
            )
        )

        assert result["status"] == "partial"
        assert result["stop_reason"] == "recursion_budget"
        assert result["tool_results"][0]["tool_name"] == "todo_list_tasks"

    def test_build_child_thread_id_isolated_by_user_turn_round_and_attempt(self) -> None:
        agent = _StubAgent()
        child_thread_id = agent._build_child_thread_id(
            parent_thread_id="thread:1",
            user_id="user:1",
            parent_config={
                "configurable": {
                    "turn_id": "turn:123",
                    "round_index": 2,
                    "attempt_index": 3,
                }
            },
        )

        assert child_thread_id == "child:user%3A1:thread%3A1:turn%3A123:r2:a3:finance"

    def test_app_agent_response_validates_followup_contract(self) -> None:
        with pytest.raises(ValidationError):
            AppAgentResponse(
                message="Need one more lookup.",
                answer_state="partial",
                evidence_summary="Fetched some evidence.",
                followup_useful=True,
            )
