"""Reusable base class for installed app child agents."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.tools import BaseTool
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent

from shared.agent_context import get_user_context, set_thread_context, set_user_context
from shared.llm import get_llm


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


class BaseAppAgent:
    """Shared implementation for child app agents invoked by the root agent."""

    app_id: str

    def __init__(self) -> None:
        self._checkpointer = MemorySaver()
        self._graph: CompiledStateGraph | None = None

    @property
    def graph(self) -> CompiledStateGraph:
        if self._graph is None:
            self._graph = create_react_agent(
                model=get_llm(),
                tools=self.tools(),
                prompt=self.build_prompt(),
                checkpointer=self._checkpointer,
                name=f"{self.app_id}_agent",
            )
        return self._graph

    def tools(self) -> list[BaseTool]:
        raise NotImplementedError

    def build_prompt(self) -> str:
        raise NotImplementedError

    async def delegate(self, question: str, thread_id: str) -> str:
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
            return self._extract_reply(messages)
        finally:
            set_user_context(user_id)
            set_thread_context(parent_thread_id)

    def _extract_reply(self, messages: list[BaseMessage]) -> str:
        for message in reversed(messages):
            if isinstance(message, AIMessage):
                text = _content_to_text(message.content)
                if text:
                    return text

        if messages:
            return _content_to_text(getattr(messages[-1], "content", ""))

        return ""
