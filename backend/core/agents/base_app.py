"""Reusable base class for tool-using child agents under the root graph."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from langgraph.errors import GraphRecursionError
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent
from loguru import logger

from core.config import settings
from core.constants import AGENT_RECURSION_LIMIT
from shared.llm import get_llm

# Type definitions for consistent status/error codes
DelegationStatus = Literal["success", "no_action", "failed", "partial", "awaiting_confirmation"]


def _parse_tool_message_content(content: Any) -> Any:
    if isinstance(content, str):
        try:
            return json.loads(content)
        except Exception:
            return content
    return content


class BaseAppAgent:
    """Shared implementation for child agents invoked by the root graph.

    Covers both domain app agents and the platform agent.
    """

    app_id: str

    def __init__(self) -> None:
        self._graph: CompiledStateGraph | None = None

    @property
    def graph(self) -> CompiledStateGraph:
        """Return or build the compiled child agent graph.

        H1 DESIGN NOTE: Child agents intentionally have NO checkpointer or store.
        - They are stateless per-delegation: each `delegate()` call passes a fresh
          single-message input, so there is no multi-turn state to persist.
        - Canonical cross-turn persistence is handled by the root chat layer.
        - This graph is a SINGLETON shared across all users (no user data stored here).

        WARNING: If you add a checkpointer here in the future, you MUST also add
        per-user thread isolation (thread_id scoped to user_id) to prevent data leakage
        between users. See RootAgent.astream() for the correct pattern.
        """
        if self._graph is None:
            self._graph = create_react_agent(
                model=get_llm(),
                tools=self.tools(),
                prompt=self._make_dynamic_prompt(),
                name=f"{self.app_id}_agent",
            )
        return self._graph

    def tools(self) -> list[BaseTool]:
        raise NotImplementedError

    def build_prompt(self) -> str:
        raise NotImplementedError

    def _make_dynamic_prompt(self):
        """Build dynamic child-agent prompt from RunnableConfig.

        MUST return list[BaseMessage] (not str) so create_react_agent can prepend
        the system prompt to the messages list. Returning a plain string causes
        langchain to treat it as user content — the model echoes it back without
        calling tools.
        """

        def prompt(
            state: Any, config: RunnableConfig
        ) -> list[BaseMessage]:
            cfg = config.get("configurable") or {}
            user_tz = cfg.get("user_tz", "UTC")
            try:
                now_local = datetime.now(UTC).astimezone(ZoneInfo(user_tz))
            except Exception:
                user_tz = "UTC"
                now_local = datetime.now(UTC)

            system_content = (
                f"{self.build_prompt()}\n\n"
                "<timezone_rules>\n"
                "- Interpret all relative or ambiguous time expressions such as 'today', 'tomorrow', 'this week', '9am', or 'next Monday' in the user's timezone.\n"
                "- When a tool expects `local_date`, send `YYYY-MM-DD` in the user's local calendar.\n"
                "- When a tool expects `local_datetime`, send a local wall-clock datetime without timezone offset.\n"
                "- When a tool expects `instant`, send an offset-aware ISO datetime.\n"
                "- Do not assume naive datetimes are UTC.\n"
                "</timezone_rules>\n\n"
                "Execution context:\n"
                f"- User timezone: {user_tz}\n"
                f"- Current local datetime: {now_local.isoformat()}\n"
                f"- User ID: {cfg.get('user_id', 'unknown')}\n"
                f"- Thread ID: {cfg.get('thread_id', 'unknown')}\n"
            )

            from langchain_core.messages import SystemMessage

            # Prepend system message to existing messages so the LLM receives:
            # [SystemMessage(context + app prompt), ...existing messages...]
            existing: list[BaseMessage] = state.get("messages", [])
            return [SystemMessage(content=system_content)] + list(existing)

        return prompt

    async def delegate(
        self,
        subtask: str,
        thread_id: str,
        user_id: str | None = None,
        config: RunnableConfig | None = None,
        **_kwargs: Any,
    ) -> dict[str, Any]:
        """Run the child agent graph for a single domain-specific subtask.

        Context propagation:
            user_id / thread_id are injected into a fresh ``RunnableConfig`` and
            passed into ``graph.ainvoke``. LangGraph propagates ``configurable``
            to every tool, so tools can read context via
            ``shared.agent_config.require_user_id(config)``.
        """
        if not user_id:
            raise RuntimeError(f"{self.app_id} agent invoked without user_id")
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

        try:
            result = await asyncio.wait_for(
                self.graph.ainvoke(
                    {"messages": [{"role": "user", "content": subtask}]},
                    config=child_config,
                ),
                timeout=settings.llm_request_timeout_seconds,
            )
            final_status = str(result.get("status", "success"))
            messages = result.get("messages", [])
            return self._build_delegate_result(subtask, messages)
        except TimeoutError:
            logger.error(
                "{} child agent timed out after {}s",
                self.app_id,
                settings.llm_request_timeout_seconds,
            )
            return self._failed_result(
                subtask,
                f"The {self.app_id} assistant timed out while waiting for the language model. "
                "Please try again.",
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
            )
        except (AttributeError, TypeError, ValueError) as exc:
            logger.error("{} child agent encountered an error: {}", self.app_id, exc)
            return self._failed_result(
                subtask,
                f"The {self.app_id} assistant hit an internal error while handling that request. "
                "Please try again.",
            )
        finally:
            logger.info(
                "BaseAppAgent.delegate END  app={}  user={}  status={}",
                self.app_id,
                user_id,
                final_status,
            )

    def _build_child_config(
        self,
        parent_config: RunnableConfig | None,
        user_id: str,
        child_thread_id: str,
    ) -> RunnableConfig:
        """Merge parent config with child-scoped identifiers.

        Produces a new RunnableConfig whose ``configurable`` section carries
        the parent config's values, plus the child-scoped ``user_id`` and
        ``thread_id`` that every downstream tool reads.
        """
        parent_configurable: dict[str, Any] = {}
        if parent_config:
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

    def _failed_result(self, subtask: str, message: str) -> dict[str, Any]:
        """Build a standardized failure result dict."""
        return {
            "app": self.app_id,
            "status": "failed",
            "ok": False,
            "message": message,
            "subtask": subtask,
            "tool_results": [],
        }

    def _build_delegate_result(
        self,
        subtask: str,
        messages: list[BaseMessage],
    ) -> dict[str, Any]:
        tool_results = self._extract_tool_results(messages)
        reply = self._extract_reply(messages)
        status = self._derive_status(tool_results, reply)
        ok = status in {"success", "no_action"}

        return {
            "app": self.app_id,
            "status": status,
            "ok": ok,
            "message": reply or self._summarize_results(tool_results),
            "subtask": subtask,
            "tool_results": tool_results,
        }

    def _extract_reply(self, messages: list[BaseMessage]) -> str:
        for message in reversed(messages):
            if isinstance(message, AIMessage):
                text = message.text.strip()
                if text:
                    return text

        if messages:
            return messages[-1].text.strip()

        return ""

    def _extract_tool_results(self, messages: list[BaseMessage]) -> list[dict[str, Any]]:
        """Extract structured tool results from a ReAct message list."""
        results: list[dict[str, Any]] = []

        for message in messages:
            if not isinstance(message, ToolMessage):
                continue

            payload = _parse_tool_message_content(message.content)
            if isinstance(payload, dict) and "ok" in payload:
                results.append({
                    "tool_name": message.name or "unknown",
                    "tool_call_id": message.tool_call_id,
                    "ok": bool(payload.get("ok")),
                    "data": payload.get("data"),
                    "error": payload.get("error"),
                })
            else:
                results.append({
                    "tool_name": message.name or "unknown",
                    "tool_call_id": message.tool_call_id,
                    "ok": True,
                    "data": payload,
                    "error": None,
                })

        return results

    def _derive_status(
        self,
        tool_results: list[dict[str, Any]],
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

    def _summarize_results(self, tool_results: list[dict[str, Any]]) -> str:
        if not tool_results:
            return ""

        failures = [result for result in tool_results if not result.get("ok")]
        if failures:
            first_error = failures[0].get("error") or {}
            message = first_error.get("message") if isinstance(first_error, dict) else str(first_error)
            return message or f"The {self.app_id} assistant could not complete that request."

        return f"The {self.app_id} assistant completed the requested action."
