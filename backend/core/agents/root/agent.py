"""
RootAgent implementation.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from beanie import PydanticObjectId
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import BaseTool, tool
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent

from core.models import ConversationMessage, UserAppInstallation
from core.registry import PLUGIN_REGISTRY
from shared.agent_context import set_user_context
from shared.llm import get_llm

from .prompts import build_system_prompt
from .tools import _build_ask_tool

class RootAgent:
    """
    Top-level LangGraph orchestrator.

    Wraps each registered AppAgent as a tool (ask_{app_id}) so the LLM
    can decide which app to delegate to. Conversation history is loaded from
    and saved to MongoDB (ConversationMessage) on every request.
    """

    def __init__(self) -> None:
        self._system_prompt = ""
        self._all_ask_tools: dict[str, BaseTool] = {}
        # Per-request in-memory checkpointer — graph state is fully
        # persisted in MongoDB via ConversationMessage (source of truth).
        self._checkpointer = MemorySaver()
        self._graphs: dict[tuple[str, ...], Any] = {}

    def refresh(self) -> None:
        """Rebuild system prompt, ask_X tools, and cached graph. Called after plugin discovery."""
        self._system_prompt = build_system_prompt()
        self._all_ask_tools = {
            app_id: _build_ask_tool(
                app_id,
                plugin["agent"],
                agent_description=plugin["manifest"].agent_description,
            )
            for app_id, plugin in PLUGIN_REGISTRY.items()
        }
        self._graphs.clear()  # force rebuild on next request

    async def _get_user_tools(self, user_id: str) -> list[BaseTool]:
        # Try to parse user_id, handle test users if any
        try:
            oid = PydanticObjectId(user_id)
            installations = await UserAppInstallation.find(
                UserAppInstallation.user_id == oid,
                UserAppInstallation.status == "active"
            ).to_list()
            installed_app_ids = {inst.app_id for inst in installations}
        except Exception:
            installed_app_ids = set()

        tools = [
            t for app_id, t in self._all_ask_tools.items()
            if app_id in installed_app_ids
        ]

        if not tools:
            @tool("get_platform_info", description="Get basic information about the Superin platform")
            async def get_platform_info() -> str:
                return "Superin is an AI platform with an app store. Users can install apps to add capabilities."
            tools.append(get_platform_info)

        return tools

    def _get_graph(self, tools: list[BaseTool]) -> Any:
        tool_names = tuple(sorted(t.name for t in tools))
        if tool_names not in self._graphs:
            self._graphs[tool_names] = create_react_agent(
                model=get_llm(temperature=0.0),
                tools=tools,
                prompt=self._system_prompt or None,
            )
        return self._graphs[tool_names]

    async def _load_history(self, thread_id: str) -> list[ConversationMessage]:
        """Load ordered message history from MongoDB for a thread."""
        return await ConversationMessage.find(
            ConversationMessage.thread_id == thread_id,
        ).sort("created_at").to_list()

    async def _save_messages(
        self,
        user_id: str,
        thread_id: str,
        user_content: str,
        assistant_content: str,
    ) -> None:
        """Persist user + assistant messages to MongoDB after streaming completes."""
        if user_content:
            await ConversationMessage(
                user_id=PydanticObjectId(user_id),
                thread_id=thread_id,
                role="user",
                content=user_content,
            ).insert()
        if assistant_content:
            await ConversationMessage(
                user_id=PydanticObjectId(user_id),
                thread_id=thread_id,
                role="assistant",
                content=assistant_content,
            ).insert()

    async def astream(
        self,
        user_id: str,
        messages: list[dict[str, Any]],
        thread_id: str | None = None,
        skip_db_load: bool = False,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Stream data-stream events for the frontend chat UI.

        If skip_db_load is False (default): loads history from MongoDB,
        merges with incoming messages, then saves new messages back to DB.
        If skip_db_load is True: only uses the incoming messages (frontend
        sends the full history, e.g. when using assistant-ui's Thread runtime).
        """
        set_user_context(user_id)

        tools = await self._get_user_tools(user_id)
        graph = self._get_graph(tools)
        thread = thread_id or f"user:{user_id}"

        # ── Build message list ───────────────────────────────────────────────
        langchain_messages: list = []

        if not skip_db_load:
            # Load history from DB — for backends that don't send full history
            history = await self._load_history(thread)
            for msg in history:
                if msg.role == "user":
                    langchain_messages.append(HumanMessage(content=msg.content))
                else:
                    langchain_messages.append(AIMessage(content=msg.content))

        user_buffer = ""
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            msg_id = msg.get("id")

            tool_calls = msg.get("tool_calls", [])

            text_parts = []
            if isinstance(content, list):
                for p in content:
                    if isinstance(p, dict) and p.get("type") == "text":
                        text_parts.append(p.get("text", ""))
                    elif isinstance(p, dict) and p.get("type") in ("tool-call", "tool_call"):
                        tool_calls.append({
                            "id": p.get("toolCallId") or p.get("id"),
                            "function": {
                                "name": p.get("toolName") or p.get("name"),
                                "arguments": p.get("args") or p.get("arguments")
                            }
                        })
                content_str = " ".join(text_parts)
            else:
                content_str = str(content)

            if role == "user":
                langchain_messages.append(HumanMessage(content=content_str, id=msg_id))
                user_buffer = content_str
            elif role == "assistant":
                lc_tool_calls = []
                for tc in tool_calls:
                    fn = tc.get("function", {})
                    args_str = fn.get("arguments", "{}")
                    
                    if isinstance(args_str, str):
                        try:
                            args = json.loads(args_str)
                        except Exception:
                            args = {}
                    else:
                        args = args_str

                    lc_tool_calls.append({
                        "name": fn.get("name") or tc.get("toolName") or tc.get("name"),
                        "args": args,
                        "id": tc.get("id") or tc.get("toolCallId"),
                        "type": "tool_call",
                    })
                langchain_messages.append(AIMessage(content=content_str, tool_calls=lc_tool_calls, id=msg_id))
            elif role in ("tool", "data"):
                if isinstance(content, list):
                    for p in content:
                        if isinstance(p, dict) and p.get("type") in ("tool-result", "tool_result"):
                            langchain_messages.append(ToolMessage(
                                content=str(p.get("result", "")),
                                tool_call_id=p.get("toolCallId", ""),
                                name=p.get("toolName", ""),
                                id=msg_id
                            ))
                else:
                    langchain_messages.append(ToolMessage(
                        content=content_str,
                        tool_call_id=msg.get("tool_call_id", ""),
                        id=msg_id
                    ))

        # ── Run graph ────────────────────────────────────────────────────────
        config = {
            "configurable": {"thread_id": thread},
            "recursion_limit": 50,
        }

        assistant_buffer = ""
        pending_save: asyncio.Task[None] | None = None

        async for event in graph.astream_events(
            {"messages": langchain_messages},
            config=config,
            version="v2",
        ):
            event_type = event.get("event", "")
            data = event.get("data", {})

            if event_type == "on_chat_model_stream":
                chunk = data.get("chunk")
                content = getattr(chunk, "content", "") or ""
                if content:
                    assistant_buffer += str(content)
                    yield {"type": "token", "content": str(content)}
            elif event_type == "on_tool_start":
                inp = data.get("input", {})
                yield {
                    "type": "tool_call",
                    "toolName": event.get("name", "unknown"),
                    "toolCallId": event.get("run_id", ""),
                    "args": inp if isinstance(inp, dict) else {},
                }
            elif event_type == "on_tool_end":
                yield {
                    "type": "tool_result",
                    "toolCallId": event.get("run_id", ""),
                    "result": data.get("output", {}),
                }

        # ── Persist to MongoDB (fire-and-forget, don't block the stream end) ─
        pending_save = asyncio.create_task(
            self._save_messages(user_id, thread, user_buffer, assistant_buffer)
        )

        yield {"type": "done"}

        # Ensure the DB write completes before the response closes
        try:
            await pending_save
        except Exception:
            # Log but don't crash — messages were already streamed to the client
            logging.getLogger(__name__).exception("Failed to persist conversation messages")

# Singleton
root_agent = RootAgent()
