"""Reusable base class for installed app child agents."""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent

from shared.agent_context import get_user_context, set_thread_context, set_user_context
from shared.llm import get_llm

logger = logging.getLogger(__name__)


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

    Child agents are intentionally stateless across invocations.
    The root agent already receives full conversation history from the client,
    so keeping separate in-process child memory makes delegation brittle and can
    leak stale answers across domains.
    """

    app_id: str

    def __init__(self) -> None:
        self._graph: CompiledStateGraph | None = None

    @property
    def graph(self) -> CompiledStateGraph:
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

    async def delegate(self, question: str, thread_id: str) -> dict[str, Any]:
        user_id = get_user_context()
        if not user_id:
            raise RuntimeError(f"{self.app_id} agent invoked without user context")

        parent_thread_id = thread_id
        child_thread_id = f"{thread_id}:{self.app_id}"
        set_user_context(user_id)
        set_thread_context(child_thread_id)

        try:
            result = await self.graph.ainvoke(
                {"messages": [{"role": "user", "content": question}]},
                config={
                    "configurable": {"thread_id": child_thread_id},
                    "recursion_limit": 25,
                },
            )
            messages = result.get("messages", [])
            return self._build_delegate_result(question, messages)
        except Exception:
            logger.exception("%s child agent failed", self.app_id)
            return {
                "app": self.app_id,
                "status": "failed",
                "ok": False,
                "message": (
                    f"The {self.app_id} assistant hit an internal error while handling that request. "
                    "Please try again."
                ),
                "question": question,
                "tool_results": [],
            }
        finally:
            set_user_context(user_id)
            set_thread_context(parent_thread_id)

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

    def _derive_status(self, tool_results: list[dict[str, Any]], reply: str) -> str:
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
