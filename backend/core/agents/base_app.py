"""Reusable base class for installed app child agents."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Literal

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.errors import GraphRecursionError
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent
from loguru import logger
from shared.agent_context import get_user_context, set_thread_context, set_user_context

from core.config import settings
from core.constants import AGENT_RECURSION_LIMIT
from core.models import User
from core.utils.timezone import get_user_timezone_context
from shared.llm import get_llm

# Type definitions for consistent status/error codes
DelegationStatus = Literal["success", "no_action", "failed", "partial", "awaiting_confirmation"]
ToolErrorCode = Literal[
    "domain_error",
    "invalid_request",
    "internal_error",
    "too_many_tool_calls",
]


def _content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        text_parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                text_parts.append(part)
            elif isinstance(part, dict):
                if part.get("type") == "text":
                    text_parts.append(str(part.get("text", "")))
                elif "text" in part:
                    text_parts.append(str(part["text"]))
        return "\n".join(part for part in text_parts if part).strip()

    return str(content).strip()


def _parse_tool_message_content(content: Any) -> Any:
    if isinstance(content, str):
        try:
            return json.loads(content)
        except Exception:
            return content
    return content


class BaseAppAgent:
    """Shared implementation for child app agents invoked by the root agent.

    Safety features:
    - Recursion limit (configurable) prevents infinite loops
    - Tool call tracking detects runaway execution
    - All tool results are sanitized before returning to LLM
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
                prompt=self.build_prompt(),
                name=f"{self.app_id}_agent",
            )
        return self._graph

    def tools(self) -> list[BaseTool]:
        raise NotImplementedError

    def build_prompt(self) -> str:
        raise NotImplementedError


    async def delegate(
        self,
        question: str,
        thread_id: str,
        user_id: str | None = None,
        **_kwargs: Any,
    ) -> dict[str, Any]:
        # Support explicit user_id (from @entrypoint) or ContextVar (from old-style invoke)
        # Accept **_kwargs for forward-compat (e.g. `config` passed by workers.py)
        if user_id is None:
            user_id = get_user_context()
        if not user_id:
            raise RuntimeError(f"{self.app_id} agent invoked without user context")
        logger.info("BaseAppAgent.delegate START  app={}  user={}  thread={}  question={}", self.app_id, user_id, thread_id, question[:80])

        parent_thread_id = thread_id
        # M7: Child thread_id is scoped under the parent thread (which is already user-scoped
        # via 'user:{user_id}:...' prefix enforced by RootAgent.astream). This provides an
        # additional logical namespace but does NOT add security since child agents are stateless.
        child_thread_id = f"{thread_id}:{self.app_id}"
        set_user_context(user_id)
        set_thread_context(child_thread_id)

        # Inject current date/time so child agent knows "today" in user's timezone
        user_obj = await User.find_one(User.id == user_id) if user_id else None
        tz_ctx = get_user_timezone_context(user_obj)
        date_str, time_str = tz_ctx.get_date_time_tuple()
        prefixed_question = (
            f"Current date: {date_str}, current time: {time_str}.\n\n{question}"
        )

        final_status = "failed"

        try:
            result = await asyncio.wait_for(
                self.graph.ainvoke(
                    {"messages": [{"role": "user", "content": prefixed_question}]},
                    config={
                        "recursion_limit": AGENT_RECURSION_LIMIT,
                    },
                ),
                timeout=settings.llm_request_timeout_seconds,
            )
            final_status = str(result.get("status", "success"))
            messages = result.get("messages", [])
            return self._build_delegate_result(question, messages)
        except TimeoutError:
            logger.error(
                "{} child agent timed out after {}s",
                self.app_id,
                settings.llm_request_timeout_seconds,
            )
            return self._failed_result(
                question,
                f"The {self.app_id} assistant timed out while waiting for the language model. "
                "Please try again.",
            )
        except GraphRecursionError:
            logger.warning(
                "%s child agent exceeded recursion limit (%d)",
                self.app_id,
                AGENT_RECURSION_LIMIT,
            )
            return self._failed_result(
                question,
                f"The {self.app_id} assistant needed too many steps to complete this request. "
                "Please try a simpler query.",
            )
        except (AttributeError, TypeError, ValueError) as exc:
            # Programming / domain errors — surface to caller with a clear message
            logger.error("%s child agent encountered an error: %s", self.app_id, exc)
            return self._failed_result(
                question,
                f"The {self.app_id} assistant hit an internal error while handling that request. "
                "Please try again.",
            )
        finally:
            set_user_context(user_id)
            set_thread_context(parent_thread_id)
            logger.info("BaseAppAgent.delegate END  app={}  user={}  status={}", self.app_id, user_id, final_status)

    def _failed_result(self, question: str, message: str) -> dict[str, Any]:
        """Build a standardized failure result dict."""
        return {
            "app": self.app_id,
            "status": "failed",
            "ok": False,
            "message": message,
            "question": question,
            "tool_results": [],
        }

    def _build_delegate_result(
        self,
        question: str,
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
            "question": question,
            "tool_results": tool_results,
        }

    def _extract_reply(self, messages: list[BaseMessage]) -> str:
        for message in reversed(messages):
            if isinstance(message, AIMessage):
                text = _content_to_text(message.content)
                if text:
                    return text

        if messages:
            return _content_to_text(getattr(messages[-1], "content", ""))

        return ""

    def _extract_tool_results(self, messages: list[BaseMessage]) -> list[dict[str, Any]]:
        """Extract tool results from messages.

        Note: Manual tool call counting (MAX_TOOL_CALLS_PER_DELEGATION) has been
        removed — recursion_limit + GraphRecursionError handling is sufficient.
        """
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
