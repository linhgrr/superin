from __future__ import annotations

import asyncio

import pytest
from langchain_core.messages import AIMessage
from langchain_core.tools import BaseTool

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
        assert result["tool_results"] == [
            {
                "tool_name": "finance_update_budget",
                "tool_call_id": "call_123",
                "ok": True,
                "data": {"budget_id": "b1"},
                "error": None,
            }
        ]

    def test_delegate_copies_structured_followup_metadata(self) -> None:
        class _StructuredMetadataGraph:
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
                        followup_useful=False,
                        capability_limit="no_history_support",
                    ),
                    "tool_results": [
                        {
                            "tool_name": "finance_get_summary",
                            "tool_call_id": "call_456",
                            "ok": True,
                            "data": {"summary": "no changes"},
                            "error": None,
                        }
                    ],
                }

        agent = _StubAgent()
        agent._graph = _StructuredMetadataGraph()

        result = asyncio.run(
            agent.delegate(
                subtask="Summarize finance changes today.",
                thread_id="thread_1",
                user_id="user_1",
                config={"configurable": {"user_tz": "Asia/Ho_Chi_Minh"}},
            )
        )

        assert result["status"] == "success"
        assert result["followup_useful"] is False
        assert result["followup_hint"] == ""
        assert result["capability_limit"] == "no_history_support"

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
        assert "internal error" in result["message"].lower()

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
