"""
RootAgent — top-level parallel orchestrator using LangGraph v2 @entrypoint API.

Each incoming chat turn:
1. Parses frontend messages → LangChain messages (MessageParser, kept intact)
2. Loads installed app IDs for the user
3. Delegates to the @entrypoint root graph which fans out to @task workers in parallel
4. Streams events directly to the frontend via graph astream()

No more create_react_agent, EventStreamHandler, ToolScoper, or GraphCache.
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Any

from beanie import PydanticObjectId
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from loguru import logger

from core.models import User
from core.utils.timezone import get_user_timezone_context
from core.workspace.service import list_installed_app_ids as _list_installed_app_ids

from .graph import get_root_agent_graph
from .schemas import ParallelGraphInput

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
    Top-level parallel orchestrator using LangGraph v2 @entrypoint.

    Wires frontend message history → @entrypoint root graph → parallel app workers.
    """

    def __init__(self) -> None:
        # No-op: graph is a lazy singleton built in graph.py
        pass

    def refresh(self) -> None:
        """Invalidate the cached graph and re-register workers for any new plugins."""
        from .graph import refresh_graph

        refresh_graph()

    async def astream(
        self,
        user_id: str,
        messages: list[dict[str, Any]],
        thread_id: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Stream data-stream events for the frontend chat UI.

        Each event maps to the event types the frontend useDataStreamRuntime expects:
          - {type: "app_result", app_id, status, ok}  — partial app result
          - {type: "merged_context", content}          — all results merged
          - {type: "token", content}                  — streaming token
          - {type: "done"}                            — final answer complete
        """
        thread = _resolve_thread(user_id, thread_id)
        langchain_messages = await self._build_message_list(user_id, messages)
        installed_app_ids = await _load_installed_app_ids(user_id)

        graph_input: ParallelGraphInput = {
            "messages": langchain_messages,
            "user_id": user_id,
            "thread_id": thread,
            "installed_app_ids": list(installed_app_ids),
        }

        graph = get_root_agent_graph()
        config = {
            "configurable": {
                "user_id": user_id,
                "thread_id": thread,
            },
        }

        # Use stream_mode="custom" so writer() calls inside @entrypoint
        # emit dicts directly (not wrapped in node-key dicts).
        async for chunk in graph.astream(graph_input, config=config, stream_mode="custom"):
            # chunk is a dict from writer({"type": "...", ...})
            if not isinstance(chunk, dict):
                continue

            event_type = chunk.get("type")
            if event_type == "app_result":
                yield {
                    "type": "app_result",
                    "app_id": chunk.get("app_id"),
                    "status": chunk.get("status"),
                    "ok": chunk.get("ok"),
                }
            elif event_type == "merged_context":
                yield {
                    "type": "merged_context",
                    "content": chunk.get("content", "")[:500],
                }
            elif event_type == "token":
                yield {"type": "text", "content": chunk.get("content", "")}
            elif event_type == "done":
                yield {"type": "done", "content": chunk.get("content", "")}

        # Terminal done is emitted by the graph itself via writer()

    async def _build_message_list(
        self,
        user_id: str,
        messages: list[dict[str, Any]],
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
                            "type": "tool_call",
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
                    "type": "tool_call",
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


def _extract_args(args_str: Any) -> dict:
    """Extract arguments from various formats (str, dict, or other)."""
    if isinstance(args_str, dict):
        return args_str
    if isinstance(args_str, str):
        try:
            return json.loads(args_str)
        except json.JSONDecodeError as exc:
            logger.warning(
                "tool_call args are not valid JSON, falling back to empty dict",
                extra={"preview": args_str[:200], "error": str(exc)},
            )
            return {}
    logger.warning("tool_call args of unexpected type %s, using {}", type(args_str).__name__)
    return {}


def _resolve_thread(user_id: str, thread_id: str | None) -> str:
    """Resolve and validate thread ID, enforcing user isolation."""
    # Canonical implementation lives in core.chat.service.normalize_thread_id
    from core.chat.service import normalize_thread_id as _normalize

    return _normalize(user_id, thread_id)


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
        logger.error(
            "RootAgent: unexpected error loading installed apps for user_id=%s, "
            "defaulting to empty set",
            user_id,
            exc_info=True,
        )
        return set()


# ─── Singleton ─────────────────────────────────────────────────────────────────

root_agent = RootAgent()

# Compatibility alias for legacy imports.
list_installed_app_ids = _list_installed_app_ids
