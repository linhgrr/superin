"""
RootAgent implementation.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import OrderedDict
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any

from beanie import PydanticObjectId
from fastapi.encoders import jsonable_encoder
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool, tool
from langgraph.prebuilt import create_react_agent

from core.config import settings
from core.input_sanitizer import sanitize_for_memory_async, sanitize_user_content_async
from core.models import ConversationMessage, User, get_user_local_time
from core.registry import PLUGIN_REGISTRY
from core.workspace import list_installed_app_ids
from shared.agent_context import clear_agent_context, set_thread_context, set_user_context
from shared.llm import get_llm

from .prompts import build_system_prompt
from .tools import _build_ask_tool

logger = logging.getLogger(__name__)

# Limit how many historical messages to load from DB per thread.
# Prevents OOM and context window overflow for long-running threads.
MAX_HISTORY_MESSAGES = 50

# Cap on the number of compiled LangGraph instances retained per RootAgent.
# Uses LRU eviction — least recently used graph is dropped when the cap is hit.
MAX_CACHED_GRAPHS = 32


def _normalize_tool_output(output: Any) -> Any:
    """Normalize tool output to JSON-serializable format."""
    if isinstance(output, ToolMessage):
        content = output.content
        if isinstance(content, str):
            try:
                return json.loads(content)
            except Exception:
                return content
        return jsonable_encoder(content)

    if hasattr(output, "content"):
        content = getattr(output, "content")
        if isinstance(content, str):
            try:
                return json.loads(content)
            except Exception:
                return content
        return jsonable_encoder(content)

    return jsonable_encoder(output)


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


@dataclass
class ParsedMessage:
    """Result of parsing a frontend message into LangChain format."""
    langchain_message: BaseMessage | None = None
    user_content: str = ""
    warnings: list[str] = field(default_factory=list)


class MessageParser:
    """Parse frontend messages into LangChain message format with sanitization."""

    def __init__(self):
        self.warnings: list[str] = []

    async def parse(self, msg: dict[str, Any]) -> ParsedMessage:
        """Parse a single frontend message into LangChain format."""
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

    async def _parse_user_message(
        self, content: Any, msg_id: str | None
    ) -> ParsedMessage:
        """Parse user message with sanitization."""
        if isinstance(content, list):
            text_parts = []
            for p in content:
                if isinstance(p, dict) and p.get("type") == "text":
                    text = p.get("text", "")
                    sanitized, _ = await sanitize_user_content_async(text)
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
        """Parse assistant message with tool calls."""
        content_str = " ".join(
            p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"
        ) if isinstance(content, list) else str(content)

        # Parse tool calls from message parts or explicit tool_calls field
        lc_tool_calls = self._extract_tool_calls(tool_calls)

        # Also check content array for tool-call parts
        if isinstance(content, list):
            for p in content:
                if isinstance(p, dict) and p.get("type") in ("tool-call", "tool_call"):
                    raw_args = p.get("args") or p.get("arguments") or p.get("input") or {}
                    lc_tool_calls.append({
                        "name": p.get("toolName") or p.get("name"),
                        "args": raw_args,
                        "id": p.get("toolCallId") or p.get("id"),
                        "type": "tool_call",
                    })

        return ParsedMessage(
            langchain_message=AIMessage(
                content=content_str,
                tool_calls=lc_tool_calls,
                id=msg_id,
            )
        )

    def _extract_tool_calls(self, tool_calls: list[dict]) -> list[dict]:
        """Extract LangChain format tool calls from frontend format."""
        lc_tool_calls = []
        for tc in tool_calls:
            fn = tc.get("function", tc)  # Support both formats
            args_str = fn.get("arguments") or tc.get("args") or tc.get("input") or {}
            args = _extract_args(args_str)

            lc_tool_calls.append({
                "name": fn.get("name") or tc.get("toolName") or tc.get("name"),
                "args": args,
                "id": tc.get("id") or tc.get("toolCallId"),
                "type": "tool_call",
            })
        return lc_tool_calls

    def _parse_tool_message(self, content: Any, msg_id: str | None) -> ParsedMessage:
        """Parse tool result message."""
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

        # Fallback for string content
        content_str = str(content) if not isinstance(content, list) else ""
        return ParsedMessage(
            langchain_message=ToolMessage(
                content=content_str,
                tool_call_id=content.get("tool_call_id", "") if isinstance(content, dict) else "",
                id=msg_id,
            ) if content_str else None
        )


@dataclass
class StreamEvent:
    """Stream event for frontend consumption."""
    type: str
    content: str | None = None
    tool_name: str | None = None
    tool_call_id: str | None = None
    args: dict | None = None
    result: Any = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dict for JSON serialization."""
        data: dict[str, Any] = {"type": self.type}
        if self.content is not None:
            data["content"] = self.content
        if self.tool_name is not None:
            data["toolName"] = self.tool_name
        if self.tool_call_id is not None:
            data["toolCallId"] = self.tool_call_id
        if self.args is not None:
            data["args"] = self.args
        if self.result is not None:
            data["result"] = self.result
        return data


class EventStreamHandler:
    """Handle LangGraph stream events and convert to frontend format."""

    def __init__(self, tools: list[BaseTool]):
        self.visible_tool_names = {t.name for t in tools}
        self.active_delegations: set[str] = set()
        self.assistant_buffer = ""

    def handle(self, event: dict[str, Any]) -> StreamEvent | None:
        """Process a single LangGraph event and return stream event if applicable."""
        event_type = event.get("event", "")
        data = event.get("data", {})
        run_id = event.get("run_id", "")
        tool_name = event.get("name", "unknown")

        if event_type == "on_chat_model_stream":
            return self._handle_chat_stream(run_id, data)
        elif event_type == "on_tool_start":
            return self._handle_tool_start(run_id, tool_name, data)
        elif event_type == "on_tool_end":
            return self._handle_tool_end(run_id, tool_name, data)
        elif event_type == "on_tool_error":
            return self._handle_tool_error(run_id, tool_name, data)
        return None

    def _handle_chat_stream(self, run_id: str, data: dict) -> StreamEvent | None:
        """Handle chat model streaming chunks."""
        if self.active_delegations:
            return None
        chunk = data.get("chunk")
        content = getattr(chunk, "content", "") or ""
        if content:
            self.assistant_buffer += str(content)
            return StreamEvent(type="token", content=str(content))
        return None

    def _handle_tool_start(self, run_id: str, tool_name: str, data: dict) -> StreamEvent | None:
        """Handle tool execution start."""
        if tool_name not in self.visible_tool_names:
            return None
        if self.active_delegations and run_id not in self.active_delegations:
            return None
        if tool_name.startswith("ask_"):
            self.active_delegations.add(run_id)

        inp = data.get("input", {})
        return StreamEvent(
            type="tool_call",
            tool_name=tool_name,
            tool_call_id=run_id,
            args=jsonable_encoder(inp) if isinstance(inp, dict) else {},
        )

    def _handle_tool_end(self, run_id: str, tool_name: str, data: dict) -> StreamEvent | None:
        """Handle tool execution completion."""
        if tool_name not in self.visible_tool_names:
            return None
        if self.active_delegations and run_id not in self.active_delegations:
            return None

        self.active_delegations.discard(run_id)
        return StreamEvent(
            type="tool_result",
            tool_call_id=run_id,
            result=_normalize_tool_output(data.get("output", {})),
        )

    def _handle_tool_error(self, run_id: str, tool_name: str, data: dict) -> StreamEvent | None:
        """Handle tool execution error."""
        if tool_name not in self.visible_tool_names:
            return None
        if self.active_delegations and run_id not in self.active_delegations:
            return None

        self.active_delegations.discard(run_id)
        return StreamEvent(
            type="tool_result",
            tool_call_id=run_id,
            result={
                "ok": False,
                "error": {
                    "message": str(data.get("error", "Tool execution failed")),
                    "code": "tool_error",
                    "retryable": True,
                },
            },
        )


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
        # LRU-bounded graph cache keyed by sorted tool names.
        self._graphs: OrderedDict[tuple[str, ...], Any] = OrderedDict()

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

    @staticmethod
    def _build_platform_info_tool() -> BaseTool:
        @tool("get_platform_info", description="Get basic information about the Superin platform")
        async def get_platform_info() -> str:
            return "Superin is an AI platform with an app store. Users can install apps to add capabilities."

        return get_platform_info

    async def _get_user_tools(self, user_id: str) -> list[BaseTool]:
        """Get tools available to the user based on installed apps."""
        try:
            installed_app_ids = set(await list_installed_app_ids(user_id))
        except Exception:
            # Fail closed: if installed-app scoping cannot be resolved, never
            # expose ask_* tools outside the verified installation set.
            logger.warning(
                "Failed to load installed apps for tool scoping, "
                "falling back to platform info only",
                exc_info=True,
            )
            return [self._build_platform_info_tool()]

        tools = [
            t for app_id, t in self._all_ask_tools.items()
            if app_id in installed_app_ids
        ]

        # Provide fallback tool if no apps installed
        if not tools:
            tools.append(self._build_platform_info_tool())

        return tools

    def _get_graph(self, tools: list[BaseTool]) -> Any:
        """Get or create LangGraph for given tools (LRU cache, max MAX_CACHED_GRAPHS)."""
        tool_names = tuple(sorted(t.name for t in tools))
        if tool_names in self._graphs:
            # Move to end (most-recently-used)
            self._graphs.move_to_end(tool_names)
            return self._graphs[tool_names]

        graph = create_react_agent(
            model=get_llm(),
            tools=tools,
            prompt=self._system_prompt or None,
        )
        self._graphs[tool_names] = graph

        # Evict oldest (least-recently-used) entry if over limit
        if len(self._graphs) > MAX_CACHED_GRAPHS:
            self._graphs.popitem(last=False)

        return graph

    async def _load_history(self, thread_id: str) -> list[ConversationMessage]:
        """Load the most recent message history from MongoDB for a thread.

        Capped to MAX_HISTORY_MESSAGES to prevent OOM and context overflow.
        Messages are returned in chronological order (oldest-first).
        """
        return await ConversationMessage.find(
            {"thread_id": thread_id},
        ).sort("-created_at").limit(MAX_HISTORY_MESSAGES).to_list()

    async def _save_messages(
        self,
        user_id: str,
        thread_id: str,
        user_content: str,
        assistant_content: str,
    ) -> None:
        """Persist user + assistant messages to MongoDB after streaming completes.

        Content is sanitized before storage to prevent ASI06: Memory Poisoning.
        """
        sanitized_user = await sanitize_for_memory_async(user_content)
        sanitized_assistant = await sanitize_for_memory_async(assistant_content)

        if sanitized_user:
            await ConversationMessage(
                user_id=PydanticObjectId(user_id),
                thread_id=thread_id,
                role="user",
                content=sanitized_user,
            ).insert()
        if sanitized_assistant:
            await ConversationMessage(
                user_id=PydanticObjectId(user_id),
                thread_id=thread_id,
                role="assistant",
                content=sanitized_assistant,
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
        thread = thread_id or f"user:{user_id}"
        set_user_context(user_id)
        set_thread_context(thread)

        tools = await self._get_user_tools(user_id)
        graph = self._get_graph(tools)
        event_handler = EventStreamHandler(tools)

        try:
            langchain_messages = await self._build_message_list(
                user_id, messages, thread, skip_db_load
            )

            # Extract the last user message for persistence
            last_user_content = ""
            for msg in reversed(messages):
                if msg.get("role") == "user":
                    content = msg.get("content", "")
                    if isinstance(content, list):
                        last_user_content = " ".join(
                            p.get("text", "") for p in content
                            if isinstance(p, dict) and p.get("type") == "text"
                        )
                    else:
                        last_user_content = str(content)
                    break

            # Run graph and yield stream events
            async for event_dict in self._run_graph_stream(
                graph, thread, event_handler, langchain_messages
            ):
                yield event_dict

            # Persist to MongoDB (fire-and-forget, don't block the stream end)
            pending_save = asyncio.create_task(
                self._save_messages(user_id, thread, last_user_content, event_handler.assistant_buffer)
            )

            yield {"type": "done"}

            # Ensure the DB write completes before the response closes
            try:
                await pending_save
            except Exception:
                logger.exception("Failed to persist conversation messages")
        finally:
            clear_agent_context()

    async def _build_message_list(
        self,
        user_id: str,
        messages: list[dict[str, Any]],
        thread: str,
        skip_db_load: bool,
    ) -> list[BaseMessage]:
        """Build LangChain message list from frontend messages and history."""
        langchain_messages: list[BaseMessage] = []

        # Add user context as first system message (for date/time awareness)
        user = await User.find_one(User.id == PydanticObjectId(user_id))
        current_date, current_time = get_user_local_time(user) if user else ("", "")
        if current_date:
            langchain_messages.append(
                SystemMessage(content=f"Current date: {current_date}, current time: {current_time}.")
            )

        # Load history from DB if not skipping
        if not skip_db_load:
            history = await self._load_history(thread)
            # _load_history returns newest-first (for efficient LIMIT),
            # reverse to chronological order for the LLM.
            for msg in reversed(history):
                langchain_messages.append(
                    HumanMessage(content=msg.content) if msg.role == "user" else AIMessage(content=msg.content)
                )

        # Parse frontend messages
        parser = MessageParser()
        for msg in messages:
            parsed = await parser.parse(msg)
            if parsed.langchain_message:
                langchain_messages.append(parsed.langchain_message)

        # Log any sanitization warnings
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
        event_handler: EventStreamHandler,
        langchain_messages: list[BaseMessage],
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Run graph and yield stream events."""
        config = {
            "configurable": {"thread_id": thread},
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
            except TimeoutError as exc:
                logger.error(
                    "LLM stream idle timeout after %.1fs for thread %s",
                    settings.llm_stream_idle_timeout_seconds,
                    thread,
                )
                raise RuntimeError(
                    "The language model timed out while streaming a response."
                ) from exc

            stream_event = event_handler.handle(event)
            if stream_event:
                yield stream_event.to_dict()


# Singleton
root_agent = RootAgent()
