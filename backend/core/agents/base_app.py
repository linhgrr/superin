"""Reusable base class for tool-using child agents under the root graph."""

from __future__ import annotations

import asyncio
import time
from typing import Any, cast
from urllib.parse import quote

from langchain.agents import create_agent
from langchain.agents.middleware import ModelRequest, dynamic_prompt
from langchain.agents.middleware.types import AgentMiddleware
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from langgraph.errors import GraphRecursionError
from loguru import logger
from pydantic import TypeAdapter, ValidationError
from typing_extensions import TypedDict

from core.agents.app_state import AppAgentResponse, AppAgentState
from core.agents.root.schemas import DelegationStatus, ToolResult, WorkerOutcome
from core.agents.runtime_context import AppAgentContext
from core.agents.tool_middleware import ChildBudgetMiddleware, StructuredToolResultMiddleware
from core.config import settings
from core.db import get_child_checkpointer, get_store
from core.utils.timezone import get_local_now_for_timezone
from shared.llm import get_llm


class InvalidChildStateError(ValueError):
    """Raised when a child graph returns malformed state."""


class RecoveryFields(TypedDict):
    """Typed recovery payload reused for checkpoint fallbacks."""

    message: str
    evidence_summary: str
    missing_information: list[str]
    followup_useful: bool
    followup_hint: str
    capability_limit: str


class BaseAppAgent:
    """Shared implementation for child agents invoked by the root graph.

    Covers both domain app agents and the platform agent.
    """

    app_id: str
    _tool_results_adapter = TypeAdapter(list[ToolResult])

    def __init__(self) -> None:
        self._graph: Any = None

    @property
    def graph(self) -> Any:
        """Return or build the compiled child agent graph.

        The compiled graph is shared per process, but each delegate run receives
        a fresh child-scoped thread id and runtime context. Child state is still
        per-delegation; long-term persistence continues to live in the root layer
        and shared store.
        """
        if self._graph is None:
            self._graph = create_agent(
                model=get_llm(),
                tools=self.tools(),
                middleware=self._build_middleware(),
                response_format=AppAgentResponse,
                state_schema=AppAgentState,
                context_schema=AppAgentContext,
                checkpointer=get_child_checkpointer() if settings.child_agent_checkpoint_enabled else None,
                store=get_store(),
                name=f"{self.app_id}_agent",
            )
        return self._graph

    def tools(self) -> list[BaseTool]:
        raise NotImplementedError

    def build_prompt(self) -> str:
        raise NotImplementedError

    def _build_middleware(self) -> list[AgentMiddleware[AppAgentState, AppAgentContext, Any]]:
        return [
            self._make_dynamic_prompt_middleware(),
            ChildBudgetMiddleware(
                soft_limit=settings.child_agent_tool_call_soft_limit,
                hard_limit=settings.child_agent_tool_call_hard_limit,
            ),
            StructuredToolResultMiddleware(),
        ]

    def _build_budget_rules(self, state: object) -> str:
        if not isinstance(state, dict):
            return ""
        if state.get("tool_budget_exhausted"):
            return (
                "<tool_budget_rules>\n"
                "- Tool budget is exhausted. Do not call any more tools.\n"
                "- Return the best structured partial response now.\n"
                "</tool_budget_rules>\n\n"
            )
        if state.get("tool_budget_soft_exhausted"):
            return (
                "<tool_budget_rules>\n"
                "- You are at the tool-call soft limit.\n"
                "- Stop using tools and return the best structured partial response now.\n"
                "</tool_budget_rules>\n\n"
            )
        return ""

    def _make_dynamic_prompt_middleware(self) -> AgentMiddleware[AppAgentState, AppAgentContext, Any]:
        """Inject execution context into the system prompt for each child-agent run."""

        @dynamic_prompt
        def prompt(request: ModelRequest[AppAgentContext]) -> str:
            user_tz, now_local = get_local_now_for_timezone(request.runtime.context.user_tz)
            budget_rules = self._build_budget_rules(request.state)
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
                "</response_contract>\n\n"
                "<efficiency_rules>\n"
                "- Prefer the smallest number of tool calls needed to answer correctly.\n"
                "- For recap, digest, or summary requests, stop once you have enough evidence to answer; do not explore exhaustively.\n"
                "- If the available tools expose current state but not a true history or audit log, say that explicitly instead of trying to infer created, updated, or deleted changes.\n"
                "- Never repeat the same tool call with materially identical arguments after it already succeeded; use the previous result or change strategy.\n"
                "</efficiency_rules>\n\n"
                "<partial_response_rules>\n"
                "- If you gathered useful evidence but cannot complete the full subtask, return a partial structured response instead of repeating tool calls.\n"
                "- If the next step requires user-provided data or explicit confirmation, set answer_state=needs_user_input and list missing_information.\n"
                "- Set followup_useful=true only when one narrower follow-up against this same app is likely to add new evidence.\n"
                "- If available tools cannot answer a history or audit request, state the capability limit explicitly.\n"
                "</partial_response_rules>\n\n"
                f"{budget_rules}"
                "Execution context:\n"
                f"- User timezone: {user_tz}\n"
                f"- Current local datetime: {now_local.isoformat()}\n"
                f"- User ID: {request.runtime.context.user_id}\n"
                f"- Thread ID: {request.runtime.context.thread_id}\n"
            )

        return cast(AgentMiddleware[AppAgentState, AppAgentContext, Any], prompt)

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

        child_config = self._build_delegate_config(
            parent_thread_id=thread_id,
            user_id=user_id,
            parent_config=config,
        )
        final_status = "failed"
        started_at = time.perf_counter()
        child_timeout_seconds = settings.child_agent_timeout_seconds

        try:
            result = await self._invoke_child_graph(
                subtask=subtask,
                child_config=child_config,
                timeout_seconds=child_timeout_seconds,
            )
            tool_results = self._normalize_tool_results(result.get("tool_results"))
            delegate_result = self._build_delegate_result(
                subtask=subtask,
                response=self._require_structured_response(result),
                tool_results=tool_results,
            )
            final_status = delegate_result["status"]
            return delegate_result
        except TimeoutError:
            timeout_result = await self._handle_timeout(
                subtask=subtask,
                child_config=child_config,
                timeout_seconds=child_timeout_seconds,
            )
            final_status = timeout_result["status"]
            return timeout_result
        except GraphRecursionError:
            recursion_result = await self._handle_recursion_limit(
                subtask=subtask,
                child_config=child_config,
            )
            final_status = recursion_result["status"]
            return recursion_result
        except (AttributeError, TypeError, ValueError, ValidationError) as exc:
            logger.error("{} child agent encountered an error: {}", self.app_id, exc)
            return self._failed_result(
                subtask,
                f"The {self.app_id} assistant hit an internal error while handling that request. "
                "Please try again.",
                retryable=False,
                failure_kind=(
                    "invalid_structured_response"
                    if isinstance(exc, (ValidationError, InvalidChildStateError))
                    else "internal_error"
                ),
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

    async def _invoke_child_graph(
        self,
        *,
        subtask: str,
        child_config: RunnableConfig,
        timeout_seconds: float,
    ) -> AppAgentState:
        return await asyncio.wait_for(
            self.graph.ainvoke(
                {"messages": [{"role": "user", "content": subtask}]},
                config=child_config,
                context=self._build_agent_context(child_config),
            ),
            timeout=timeout_seconds,
        )

    async def _handle_timeout(
        self,
        *,
        subtask: str,
        child_config: RunnableConfig,
        timeout_seconds: float,
    ) -> WorkerOutcome:
        logger.error(
            "{} child agent timed out after {}s while completing delegated task",
            self.app_id,
            timeout_seconds,
        )
        return await self._recover_or_fail(
            subtask=subtask,
            child_config=child_config,
            failure_kind="timeout",
            fallback_message=(
                f"The {self.app_id} assistant timed out while completing that request. "
                "Please try again."
            ),
        )

    async def _handle_recursion_limit(
        self,
        *,
        subtask: str,
        child_config: RunnableConfig,
    ) -> WorkerOutcome:
        logger.warning(
            "{} child agent exceeded recursion limit ({})",
            self.app_id,
            settings.child_agent_recursion_limit,
        )
        return await self._recover_or_fail(
            subtask=subtask,
            child_config=child_config,
            failure_kind="recursion_limit",
            fallback_message=(
                f"The {self.app_id} assistant needed too many steps to complete this request. "
                "Please try a simpler query."
            ),
        )

    async def _recover_or_fail(
        self,
        *,
        subtask: str,
        child_config: RunnableConfig,
        failure_kind: str,
        fallback_message: str,
    ) -> WorkerOutcome:
        recovered = await self._recover_checkpoint_outcome(
            child_config=child_config,
            subtask=subtask,
            failure_kind=failure_kind,
        )
        if recovered is not None:
            return recovered
        return self._failed_result(
            subtask,
            fallback_message,
            retryable=True,
            failure_kind=failure_kind,
        )

    def _build_delegate_config(
        self,
        *,
        parent_thread_id: str,
        user_id: str,
        parent_config: RunnableConfig,
    ) -> RunnableConfig:
        child_thread_id = self._build_child_thread_id(
            parent_thread_id=parent_thread_id,
            user_id=user_id,
            parent_config=parent_config,
        )
        return self._build_child_config(parent_config, user_id, child_thread_id)

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
            "app_id": self.app_id,
        }
        return {
            "configurable": configurable,
            "metadata": dict(parent_config.get("metadata") or {}),
            "recursion_limit": settings.child_agent_recursion_limit,
        }

    def _build_agent_context(self, config: RunnableConfig) -> AppAgentContext:
        configurable = config.get("configurable") or {}
        return AppAgentContext(
            user_id=str(configurable["user_id"]),
            thread_id=str(configurable["thread_id"]),
            user_tz=str(configurable.get("user_tz", "UTC")),
            parent_thread_id=str(configurable.get("parent_thread_id", "")),
            app_id=str(configurable.get("app_id", self.app_id)),
            turn_id=str(configurable.get("turn_id", "")),
            round_index=int(configurable.get("round_index", 0) or 0),
            attempt_index=int(configurable.get("attempt_index", 0) or 0),
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
            "answer_state": "blocked" if not retryable else "partial",
            "evidence_summary": "",
            "missing_information": [],
            "followup_useful": False,
            "followup_hint": "",
            "capability_limit": "",
            "stop_reason": failure_kind,
            "contained_mutation": False,
            "retryable": retryable,
            "failure_kind": failure_kind,
        }

    def _build_delegate_result(
        self,
        *,
        subtask: str,
        response: AppAgentResponse,
        tool_results: list[ToolResult],
    ) -> WorkerOutcome:
        reply = response.message.strip()
        status = self._derive_status(response, tool_results, reply)
        ok = status in {"success", "no_action"}
        contained_mutation = any(result.get("is_mutating", False) for result in tool_results)

        return {
            "app": self.app_id,
            "status": status,
            "ok": ok,
            "message": reply,
            "subtask": subtask,
            "tool_results": tool_results,
            "error": "",
            "answer_state": response.answer_state,
            "evidence_summary": response.evidence_summary,
            "missing_information": response.missing_information,
            "followup_useful": response.followup_useful,
            "followup_hint": response.followup_hint,
            "capability_limit": response.capability_limit,
            "stop_reason": response.stop_reason,
            "contained_mutation": contained_mutation,
            "retryable": response.followup_useful,
        }

    def _require_structured_response(self, state: AppAgentState) -> AppAgentResponse:
        response = state.get("structured_response")
        if not isinstance(response, AppAgentResponse):
            raise InvalidChildStateError(
                f"{self.app_id} child agent returned without a valid structured_response.",
            )
        return response

    def _normalize_tool_results(self, raw_tool_results: object) -> list[ToolResult]:
        """Validate child tool results before downstream code assumes dict-like items."""
        if raw_tool_results is None:
            return []

        if not isinstance(raw_tool_results, list):
            raise InvalidChildStateError(
                f"{self.app_id} child agent returned non-list tool_results: "
                f"{type(raw_tool_results).__name__}",
            )

        sanitized_tool_results = [item for item in raw_tool_results if item is not None]
        dropped_count = len(raw_tool_results) - len(sanitized_tool_results)
        if dropped_count:
            logger.warning(
                "{} child agent returned {} null tool_results entries; dropping them",
                self.app_id,
                dropped_count,
            )

        try:
            normalized = self._tool_results_adapter.validate_python(sanitized_tool_results)
        except ValidationError as exc:
            raise InvalidChildStateError(
                f"{self.app_id} child agent returned invalid tool_results payload"
            ) from exc
        for result in normalized:
            result.setdefault("is_mutating", False)
        return normalized

    def _build_child_thread_id(
        self,
        *,
        parent_thread_id: str,
        user_id: str,
        parent_config: RunnableConfig,
    ) -> str:
        configurable = dict(parent_config.get("configurable") or {})
        turn_id = str(configurable.get("turn_id", "turn"))
        round_index = int(configurable.get("round_index", 0) or 0)
        attempt_index = int(configurable.get("attempt_index", 0) or 0)
        return (
            "child:"
            f"{quote(user_id, safe='')}:"
            f"{quote(parent_thread_id, safe='')}:"
            f"{quote(turn_id, safe='')}:"
            f"r{round_index}:"
            f"a{attempt_index}:"
            f"{quote(self.app_id, safe='')}"
        )

    async def _recover_checkpoint_outcome(
        self,
        *,
        child_config: RunnableConfig,
        subtask: str,
        failure_kind: str,
    ) -> WorkerOutcome | None:
        if not settings.child_agent_checkpoint_enabled:
            return None

        try:
            snapshot = await self.graph.aget_state(child_config)
        except Exception as exc:
            logger.warning(
                "{} child agent checkpoint recovery failed: {}",
                self.app_id,
                exc,
            )
            return None

        values = self._snapshot_values(snapshot)
        tool_results = self._normalize_tool_results(values.get("tool_results"))
        if not tool_results:
            return None

        recovery_fields = self._build_recovery_fields(values.get("structured_response"))
        contained_mutation = any(result.get("is_mutating", False) for result in tool_results)
        if contained_mutation and recovery_fields["followup_useful"]:
            recovery_fields["followup_useful"] = False
            recovery_fields["followup_hint"] = ""

        return {
            "app": self.app_id,
            "status": "partial",
            "ok": False,
            "message": recovery_fields["message"],
            "subtask": subtask,
            "tool_results": tool_results,
            "error": "",
            "answer_state": "partial",
            "evidence_summary": recovery_fields["evidence_summary"],
            "missing_information": recovery_fields["missing_information"],
            "followup_useful": recovery_fields["followup_useful"],
            "followup_hint": recovery_fields["followup_hint"],
            "capability_limit": recovery_fields["capability_limit"],
            "stop_reason": "timeout" if failure_kind == "timeout" else "recursion_budget",
            "contained_mutation": contained_mutation,
            "retryable": recovery_fields["followup_useful"],
            "failure_kind": failure_kind,
        }

    def _snapshot_values(self, snapshot: object) -> dict[str, object]:
        if snapshot is None:
            return {}
        values = getattr(snapshot, "values", None)
        return values if isinstance(values, dict) else {}

    def _build_recovery_fields(self, structured_response: object) -> RecoveryFields:
        if isinstance(structured_response, AppAgentResponse):
            return {
                "message": structured_response.message.strip()
                or f"I gathered some information in {self.app_id} before the run stopped.",
                "evidence_summary": structured_response.evidence_summary.strip()
                or "Recovered partial evidence from checkpointed tool results.",
                "missing_information": structured_response.missing_information,
                "followup_useful": structured_response.followup_useful,
                "followup_hint": structured_response.followup_hint,
                "capability_limit": structured_response.capability_limit,
            }
        return {
            "message": (
                f"I gathered some information in {self.app_id} but ran out of steps before "
                "finishing the full request."
            ),
            "evidence_summary": "Recovered partial evidence from checkpointed tool results.",
            "missing_information": [],
            "followup_useful": False,
            "followup_hint": "",
            "capability_limit": "",
        }

    def _derive_status(
        self,
        response: AppAgentResponse,
        tool_results: list[ToolResult],
        reply: str,
    ) -> DelegationStatus:
        if response.answer_state == "answered":
            return "success"
        if response.answer_state == "partial":
            return "partial"
        if response.answer_state == "needs_user_input":
            return "awaiting_confirmation"
        if response.answer_state == "blocked":
            return "failed"
        if response.answer_state == "no_action":
            return "no_action"

        if not tool_results:
            return "no_action" if reply else "failed"

        successes = sum(1 for result in tool_results if result.get("ok"))
        failures = len(tool_results) - successes

        if failures and successes:
            return "partial"
        if failures:
            return "failed"
        return "success"
