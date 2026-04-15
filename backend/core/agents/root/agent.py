"""
RootAgent — top-level LangGraph orchestrator.

Wraps each registered AppAgent as a tool (ask_{app_id}) so the LLM
can decide which app to delegate to. The root graph is stateless across
requests; callers provide the canonical thread history.

The class delegates heavy responsibilities to co-located collaborators:
  - GraphCache   — LRU-bounded compiled graph cache
  - ToolScoper   — per-user tool scoping with fail-closed error handling
  - EventStreamHandler — LangGraph stream → frontend event conversion
  - MessageParser — frontend message → LangChain message parsing
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any

from beanie import PydanticObjectId
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from loguru import logger

from core.models import User
from core.registry import PLUGIN_REGISTRY
from core.utils.timezone import get_user_timezone_context
from core.workspace.service import list_installed_app_ids as _list_installed_app_ids
from shared.enums import ChatEventType

from .graph_cache import GraphCache
from .prompts import build_available_apps_context, build_system_prompt
from .root_tools import (
    _build_ask_tool,
    _build_install_app_tool,
    _build_platform_info_tool,
    _build_uninstall_app_tool,
)
from .streaming_handler import EventStreamHandler
from .tool_scoping import ToolScoper

# ─── Free functions ────────────────────────────────────────────────────────────


def _extract_args(args_str: Any) -> dict:
    """Extract arguments from various formats (str, dict, or other)."""
    if isinstance(args_str, str):
        try:
            return json.loads(args_str)
        except Exception:
            return {}
    if isinstance(args_str, dict):
        return args_str
    return {}


# ─── Data classes ──────────────────────────────────────────────────────────────


class ParsedMessage:
    """Result of parsing a frontend message into LangChain format."""

    __slots__ = ("langchain_message", "user_content", "warnings")

    def __init__(
        self,
        langchain_message: BaseMessage | None = None,
        user_content: str = "",
        warnings: list[str] | None = None,
    ) -> None:
        self.langchain_message = langchain_message
        self.user_content = user_content
        self.warnings = warnings or []


# ─── RootAgent ────────────────────────────────────────────────────────────────


class RootAgent:
    """
    Top-level LangGraph orchestrator.

    Wraps each registered AppAgent as a tool (ask_{app_id}) so the LLM
    can decide which app to delegate to. The root graph itself is stateless
    across requests; callers provide the canonical thread history.
    """

    def __init__(self) -> None:
        self._system_prompt = ""
        self._all_ask_tools: dict[str, Any] = {}
        self._base_tools: list[Any] = []
        self._graph_cache = GraphCache()
        self._tool_scopers: dict[str, ToolScoper] = {}
        self.refresh()

    # ── refresh ──────────────────────────────────────────────────────────────────

    def refresh(self) -> None:
        """Rebuild system prompt, ask_X tools, and invalidate the graph cache."""
        self._system_prompt = build_system_prompt()
        self._all_ask_tools = {
            app_id: _build_ask_tool(
                app_id,
                plugin["agent"],
                agent_description=plugin["manifest"].agent_description,
            )
            for app_id, plugin in PLUGIN_REGISTRY.items()
        }
        self._base_tools = _build_base_tools()
        self._graph_cache.invalidate()
        self._tool_scopers.clear()  # tool scopings are user-specific, not globally shared

    # ── public streaming API ────────────────────────────────────────────────────

    async def astream(
        self,
        user_id: str,
        messages: list[dict[str, Any]],
        thread_id: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Stream data-stream events for the frontend chat UI.

        The root graph does not resume hidden state from LangGraph checkpoints.
        Callers pass the canonical message history for the active thread.
        """
        thread = _resolve_thread(user_id, thread_id)

        from shared.agent_context import clear_agent_context, set_thread_context, set_user_context

        set_user_context(user_id)
        set_thread_context(thread)

        tools = await self._get_user_tools(user_id)
        graph = self._graph_cache.get_or_create(self._system_prompt, tools)
        event_handler = EventStreamHandler(tools)

        try:
            langchain_messages = await self._build_message_list(user_id, messages, thread)

            async for event_dict in self._run_graph_stream(
                graph,
                thread,
                user_id,
                event_handler,
                langchain_messages,
            ):
                yield event_dict

            yield {"type": ChatEventType.DONE}
        finally:
            clear_agent_context()

    # ── internal helpers ─────────────────────────────────────────────────────────

    async def _get_user_tools(self, user_id: str) -> list[Any]:
        """Delegate tool scoping to ToolScoper (lazily created per user)."""
        if user_id not in self._tool_scopers:
            self._tool_scopers[user_id] = ToolScoper(self)
        return await self._tool_scopers[user_id].get_user_tools(user_id)

    async def _build_message_list(
        self,
        user_id: str,
        messages: list[dict[str, Any]],
        thread: str,
    ) -> list[BaseMessage]:
        """Build LangChain message list from canonical thread history."""
        langchain_messages: list[BaseMessage] = []

        # Add date/time context as first system message
        user = await User.find_one(User.id == PydanticObjectId(user_id))
        if user:
            tz_ctx = get_user_timezone_context(user)
            current_date, current_time = tz_ctx.get_date_time_tuple()
            langchain_messages.append(
                SystemMessage(content=f"Current date: {current_date}, current time: {current_time}.")
            )

        # Add installed-app catalog context
        installed_app_ids = await _load_installed_app_ids(user_id)
        langchain_messages.append(
            SystemMessage(content=build_available_apps_context(installed_app_ids))
        )

        # Parse the canonical thread history supplied by the caller
        parser = MessageParser()
        for msg in messages:
            parsed = await parser.parse(msg)
            if parsed.langchain_message:
                langchain_messages.append(parsed.langchain_message)

        if parser.warnings:
            logger.warning(
                "Input sanitization warnings for user %s: %s",
                user_id,
                ", ".join(parser.warnings),
            )

        return langchain_messages

    async def _run_graph_stream(
        self,
        graph: Any,
        thread: str,
        user_id: str,
        event_handler: EventStreamHandler,
        langchain_messages: list[BaseMessage],
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Run graph and yield stream events.

        Invalid tool-call history is surfaced directly instead of being retried
        against hidden checkpoint state.
        """
        from core.config import settings

        config = {
            "configurable": {
                "thread_id": thread,
                "user_id": user_id,
            },
            "recursion_limit": 50,
        }

        event_stream = graph.astream_events(
            {"messages": langchain_messages},
            config=config,
            version="v2",
        )
        event_iterator = event_stream.__aiter__()

        while True:
            try:
                event = await asyncio.wait_for(
                    anext(event_iterator),
                    timeout=settings.llm_stream_idle_timeout_seconds,
                )
            except StopAsyncIteration:
                return
            except ValueError as exc:
                if "tool_calls" in str(exc) and "ToolMessage" in str(exc):
                    logger.error("INVALID_CHAT_HISTORY  thread=%s  exc=%s", thread, exc)
                    raise RuntimeError(
                        "Incoming chat history is malformed: a tool call is missing "
                        "its matching tool result."
                    ) from exc
                raise
            except TimeoutError:
                logger.error(
                    "LLM_TIMEOUT  thread=%s  timeout_s=%d",
                    thread,
                    settings.llm_stream_idle_timeout_seconds,
                )
                raise RuntimeError("The language model timed out. Please try again.")

            stream_event = event_handler.handle(event)
            if stream_event:
                yield stream_event.to_dict()


# ─── MessageParser ─────────────────────────────────────────────────────────────


class MessageParser:
    """Parse frontend messages into LangChain message format with sanitization."""

    def __init__(self) -> None:
        self.warnings: list[str] = []

    async def parse(self, msg: dict[str, Any]) -> ParsedMessage:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        msg_id = msg.get("id")

        if role == "user":
            return await self._parse_user_message(content, msg_id)
        elif role == "assistant":
            return self._parse_assistant_message(content, msg_id, msg.get("tool_calls", []))
        elif role in ("tool", "data"):
            return self._parse_tool_message(content, msg_id)
        else:
            return ParsedMessage()

    async def _parse_user_message(self, content: Any, msg_id: str | None) -> ParsedMessage:
        from core.utils.sanitizer import sanitize_user_content_async

        if isinstance(content, list):
            text_parts = []
            for p in content:
                if isinstance(p, dict) and p.get("type") == "text":
                    sanitized, _ = await sanitize_user_content_async(p.get("text", ""))
                    text_parts.append(sanitized)
            content_str = " ".join(text_parts)
        else:
            content_str, warnings = await sanitize_user_content_async(str(content))
            self.warnings.extend(warnings)

        return ParsedMessage(
            langchain_message=HumanMessage(content=content_str, id=msg_id),
            user_content=content_str,
            warnings=self.warnings,
        )

    def _parse_assistant_message(
        self, content: Any, msg_id: str | None, tool_calls: list[dict]
    ) -> ParsedMessage:
        content_str = (
            " ".join(
                p.get("text", "")
                for p in content
                if isinstance(p, dict) and p.get("type") == "text"
            )
            if isinstance(content, list)
            else str(content)
        )

        lc_tool_calls = self._extract_tool_calls(tool_calls)

        if isinstance(content, list):
            for p in content:
                if isinstance(p, dict) and p.get("type") in ("tool-call", "tool_call"):
                    raw_args = p.get("args") or p.get("arguments") or p.get("input") or {}
                    lc_tool_calls.append(
                        {
                            "name": p.get("toolName") or p.get("name"),
                            "args": raw_args,
                            "id": p.get("toolCallId") or p.get("id"),
                            "type": ChatEventType.TOOL_CALL,
                        }
                    )

        return ParsedMessage(
            langchain_message=AIMessage(
                content=content_str,
                tool_calls=lc_tool_calls,
                id=msg_id,
            )
        )

    def _extract_tool_calls(self, tool_calls: list[dict]) -> list[dict]:
        lc_tool_calls = []
        for tc in tool_calls:
            fn = tc.get("function", tc)
            args_str = fn.get("arguments") or tc.get("args") or tc.get("input") or {}
            args = _extract_args(args_str)

            lc_tool_calls.append(
                {
                    "name": fn.get("name") or tc.get("toolName") or tc.get("name"),
                    "args": args,
                    "id": tc.get("id") or tc.get("toolCallId"),
                    "type": ChatEventType.TOOL_CALL,
                }
            )
        return lc_tool_calls

    def _parse_tool_message(self, content: Any, msg_id: str | None) -> ParsedMessage:
        if isinstance(content, list):
            for p in content:
                if isinstance(p, dict) and p.get("type") in ("tool-result", "tool_result"):
                    output = p.get("output")
                    result_value = p.get("result")
                    if result_value is None and isinstance(output, dict):
                        result_value = output.get("value")

                    return ParsedMessage(
                        langchain_message=ToolMessage(
                            content=json.dumps(result_value, ensure_ascii=False)
                            if isinstance(result_value, (dict, list))
                            else str(result_value or ""),
                            tool_call_id=p.get("toolCallId", ""),
                            name=p.get("toolName", ""),
                            id=msg_id,
                        )
                    )

        content_str = str(content) if not isinstance(content, list) else ""
        if not content_str:
            return ParsedMessage(langchain_message=None)

        tool_call_id = content.get("tool_call_id", "") if isinstance(content, dict) else ""
        if not tool_call_id:
            return ParsedMessage(langchain_message=None)

        return ParsedMessage(
            langchain_message=ToolMessage(
                content=content_str,
                tool_call_id=tool_call_id,
                id=msg_id,
            )
        )


# ─── Helpers ───────────────────────────────────────────────────────────────────


def _resolve_thread(user_id: str, thread_id: str | None) -> str:
    """Resolve and validate thread ID, enforcing user isolation."""
    if thread_id:
        if thread_id.startswith(f"user:{user_id}"):
            return thread_id
        return f"user:{user_id}:{thread_id}"
    return f"user:{user_id}"


async def _load_installed_app_ids(user_id: str) -> set[str]:
    """Load installed app IDs, failing gracefully on DB/network errors."""
    try:
        return set(await list_installed_app_ids(user_id))
    except (ConnectionError, TimeoutError):
        logger.warning(
            "RootAgent: DB unavailable while loading installed apps for user_id=%s, "
            "defaulting to empty set",
            user_id,
            exc_info=True,
        )
        return set()
    except Exception:
        # Programming error — also degrade gracefully
        logger.error(
            "RootAgent: unexpected error loading installed apps for user_id=%s, "
            "defaulting to empty set",
            user_id,
            exc_info=True,
        )
        return set()


# ─── Module-level base tools builder (used by refresh()) ──────────────────────


def _build_base_tools() -> list[Any]:
    return [
        _build_platform_info_tool(),
        _build_install_app_tool(),
        _build_uninstall_app_tool(),
    ]


# ─── Singleton ─────────────────────────────────────────────────────────────────

root_agent = RootAgent()

# Compatibility alias for monkeypatch-based tests and legacy imports.
list_installed_app_ids = _list_installed_app_ids
