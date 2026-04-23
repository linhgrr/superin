"""Reusable base class for tool-using child agents under the root graph."""

from __future__ import annotations

import asyncio
import time
from typing import Any

from langchain.agents import create_agent
from langchain.agents.middleware import ModelRequest, dynamic_prompt
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from langgraph.errors import GraphRecursionError
from loguru import logger

from core.agents.app_state import AppAgentResponse, AppAgentState
from core.agents.root.schemas import DelegationStatus, ToolResult, WorkerOutcome
from core.agents.runtime_context import AppAgentContext
from core.agents.tool_middleware import StructuredToolResultMiddleware
from core.config import settings
from core.constants import AGENT_RECURSION_LIMIT
from core.db import get_store
from core.utils.timezone import get_local_now_for_timezone
from shared.llm import get_llm


class BaseAppAgent:
    """Shared implementation for child agents invoked by the root graph.

    Covers both domain app agents and the platform agent.
    """

    app_id: str

    def __init__(self) -> None:
        self._graph: Any = None

    @property
    def graph(self) -> Any:
        """Return or build the compiled child agent graph.

        H1 DESIGN NOTE: Child agents intentionally have NO checkpointer.
        - They are stateless per-delegation: each `delegate()` call passes a fresh
          single-message input, so there is no multi-turn state to persist.
        - Canonical cross-turn persistence is handled by the root chat layer.
        - A shared store is attached so tools can use ``ToolRuntime.store`` for
          long-term memory or cross-thread lookups without reaching for globals.
        - This graph is a SINGLETON shared across all users (no user data stored here).

        WARNING: If you add a checkpointer here in the future, you MUST also add
        per-user thread isolation (thread_id scoped to user_id) to prevent data leakage
        between users. See RootAgent.astream() for the correct pattern.
        """
        if self._graph is None:
            self._graph = create_agent(
                model=get_llm(),
                tools=self.tools(),
                middleware=[
                    self._make_dynamic_prompt_middleware(),
                    StructuredToolResultMiddleware(),
                ],
                response_format=AppAgentResponse,
                state_schema=AppAgentState,
                context_schema=AppAgentContext,
                store=get_store(),
                name=f"{self.app_id}_agent",
            )
        return self._graph

    def tools(self) -> list[BaseTool]:
        raise NotImplementedError

    def build_prompt(self) -> str:
        raise NotImplementedError

    def _make_dynamic_prompt_middleware(self) -> Any:
        """Inject execution context into the system prompt for each child-agent run."""

        @dynamic_prompt
        def prompt(request: ModelRequest[AppAgentContext]) -> str:
            user_tz, now_local = get_local_now_for_timezone(request.runtime.context.user_tz)
            return (
                f"{self.build_prompt()}\n\n"
                "<timezone_rules>\n"
                "- Interpret all relative or ambiguous time expressions such as 'today', 'tomorrow', 'this week', '9am', or 'next Monday' in the user's timezone.\n"
                "- When a tool expects `local_date`, send `YYYY-MM-DD` in the user's local calendar.\n"
                "- When a tool expects `local_datetime`, send a local wall-clock datetime without timezone offset.\n"
                "- When a tool expects `instant`, send an offset-aware ISO datetime.\n"
                "- Do not assume naive datetimes are UTC.\n"
                "</timezone_rules>\n\n"
                "<response_contract>\n"
                "- Always finish with a concise, user-facing summary of what happened.\n"
                "- If no action was needed, say that clearly in the final response.\n"
                "- The final response must be non-empty.\n"
                "- Set `followup_useful=true` only when another round against this same app is likely to reveal materially new evidence.\n"
                "- Set `followup_hint` only when `followup_useful=true`, and make it narrower than the current attempt.\n"
                "- If the current tools cannot fully answer because they only expose current state or lack audit/history detail, set `capability_limit` to a short label like `no_history_support` and keep `followup_useful=false`.\n"
                "</response_contract>\n\n"
                "<efficiency_rules>\n"
                "- Prefer the smallest number of tool calls needed to answer correctly.\n"
                "- For recap, digest, or summary requests, stop once you have enough evidence to answer; do not explore exhaustively.\n"
                "- If the available tools expose current state but not a true history or audit log, say that explicitly instead of trying to infer created, updated, or deleted changes.\n"
                "- Never repeat the same tool call with materially identical arguments after it already succeeded; use the previous result or change strategy.\n"
                "</efficiency_rules>\n\n"
                "Execution context:\n"
                f"- User timezone: {user_tz}\n"
                f"- Current local datetime: {now_local.isoformat()}\n"
                f"- User ID: {request.runtime.context.user_id}\n"
                f"- Thread ID: {request.runtime.context.thread_id}\n"
            )

        return prompt

    async def delegate(
        self,
        subtask: str,
        thread_id: str,
        user_id: str,
        config: RunnableConfig,
        **_kwargs: object,
    ) -> WorkerOutcome:
        """Run the child agent graph for a single domain-specific subtask.

        Context propagation:
            user_id / thread_id are injected into a fresh ``RunnableConfig`` and
            passed into ``graph.ainvoke``. The typed ``context_schema`` then
            becomes ``ToolRuntime.context`` for downstream tools, so tools read
            execution context from ``runtime.context`` instead of per-tool config
            plumbing.
        """
        logger.info(
            "BaseAppAgent.delegate START  app={}  user={}  thread={}  subtask={}",
            self.app_id,
            user_id,
            thread_id,
            subtask[:80],
        )

        # Child thread ids are namespaced under the parent thread id to keep
        # sub-agent checkpoints distinct while preserving one frontend-owned
        # root thread identity end-to-end.
        child_thread_id = f"{thread_id}:{self.app_id}"

        child_config = self._build_child_config(config, user_id, child_thread_id)
        final_status = "failed"
        started_at = time.perf_counter()
        child_timeout_seconds = settings.child_agent_timeout_seconds

        try:
            result: AppAgentState = await asyncio.wait_for(
                self.graph.ainvoke(
                    {"messages": [{"role": "user", "content": subtask}]},
                    config=child_config,
                    context=self._build_agent_context(child_config),
                ),
                timeout=child_timeout_seconds,
            )
            delegate_result = self._build_delegate_result(
                subtask=subtask,
                response=self._require_structured_response(result),
                tool_results=result.get("tool_results", []),
            )
            final_status = delegate_result["status"]
            return delegate_result
        except TimeoutError:
            logger.error(
                "{} child agent timed out after {}s while completing delegated task",
                self.app_id,
                child_timeout_seconds,
            )
            return self._failed_result(
                subtask,
                f"The {self.app_id} assistant timed out while completing that request. "
                "Please try again.",
                retryable=True,
                failure_kind="timeout",
            )
        except GraphRecursionError:
            logger.warning(
                "{} child agent exceeded recursion limit ({})",
                self.app_id,
                AGENT_RECURSION_LIMIT,
            )
            return self._failed_result(
                subtask,
                f"The {self.app_id} assistant needed too many steps to complete this request. "
                "Please try a simpler query.",
                retryable=True,
                failure_kind="recursion_limit",
            )
        except (AttributeError, TypeError, ValueError) as exc:
            logger.error("{} child agent encountered an error: {}", self.app_id, exc)
            return self._failed_result(
                subtask,
                f"The {self.app_id} assistant hit an internal error while handling that request. "
                "Please try again.",
                retryable=False,
                failure_kind="internal_error",
            )
        finally:
            logger.info(
                "BaseAppAgent.delegate END  app={}  user={}  status={}  elapsed={:.2f}s  timeout={:.2f}s",
                self.app_id,
                user_id,
                final_status,
                time.perf_counter() - started_at,
                child_timeout_seconds,
            )

    def _build_child_config(
        self,
        parent_config: RunnableConfig,
        user_id: str,
        child_thread_id: str,
    ) -> RunnableConfig:
        """Merge parent config with child-scoped identifiers.

        Produces a new RunnableConfig whose ``configurable`` section carries
        the parent config's values, plus the child-scoped ``user_id`` and
        ``thread_id`` that every downstream tool reads.
        """
        parent_configurable = dict(parent_config.get("configurable") or {})

        configurable = {
            **parent_configurable,
            "user_id": user_id,
            "thread_id": child_thread_id,
        }
        return {
            "configurable": configurable,
            "recursion_limit": AGENT_RECURSION_LIMIT,
        }

    def _build_agent_context(self, config: RunnableConfig) -> AppAgentContext:
        configurable = config.get("configurable") or {}
        return AppAgentContext(
            user_id=str(configurable["user_id"]),
            thread_id=str(configurable["thread_id"]),
            user_tz=str(configurable.get("user_tz", "UTC")),
        )

    def _failed_result(
        self,
        subtask: str,
        message: str,
        *,
        retryable: bool,
        failure_kind: str,
    ) -> WorkerOutcome:
        """Build a standardized failure result dict."""
        return {
            "app": self.app_id,
            "status": "failed",
            "ok": False,
            "message": message,
            "subtask": subtask,
            "tool_results": [],
            "error": message,
            "retryable": retryable,
            "failure_kind": failure_kind,
            "followup_useful": retryable,
            "followup_hint": "",
            "capability_limit": "",
        }

    def _build_delegate_result(
        self,
        *,
        subtask: str,
        response: AppAgentResponse,
        tool_results: list[ToolResult],
    ) -> WorkerOutcome:
        reply = response.message.strip()
        status = self._derive_status(tool_results, reply)
        ok = status in {"success", "no_action"}

        return {
            "app": self.app_id,
            "status": status,
            "ok": ok,
            "message": reply,
            "subtask": subtask,
            "tool_results": tool_results,
            "error": "",
            "followup_useful": response.followup_useful,
            "followup_hint": response.followup_hint.strip(),
            "capability_limit": response.capability_limit.strip(),
        }

    def _require_structured_response(self, state: AppAgentState) -> AppAgentResponse:
        response = state.get("structured_response")
        if not isinstance(response, AppAgentResponse):
            raise ValueError(
                f"{self.app_id} child agent returned without a valid structured_response.",
            )
        return response

    def _derive_status(
        self,
        tool_results: list[ToolResult],
        reply: str,
    ) -> DelegationStatus:
        if not tool_results:
            return "no_action" if reply else "failed"

        successes = sum(1 for result in tool_results if result.get("ok"))
        failures = len(tool_results) - successes

        if failures and successes:
            return "partial"
        if failures:
            return "failed"
        return "success"
