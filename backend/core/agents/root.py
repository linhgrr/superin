"""
RootAgent — LangGraph agent that routes user messages to the correct app plugin.

Plugin discovery is fully automatic:
  - PLUGIN_REGISTRY is scanned at startup
  - System prompt is auto-generated from all registered manifests
  - LLM handles routing — tools have descriptions, LLM picks the right one
  - No hardcoded app names, no keyword extraction

Adding a new app (e.g. "calendar") ONLY requires:
  1. Create backend/apps/calendar/ with manifest + agent + routes
  2. That's it — everything else auto-registers
"""

from typing import Any, AsyncGenerator

from langgraph.graph import StateGraph, END, MessagesState
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import BaseTool

from core.registry import PLUGIN_REGISTRY
from core.models import UserAppInstallation
from shared.llm import get_llm
from beanie import PydanticObjectId


# ─── System Prompt Builder ────────────────────────────────────────────────────────

def build_system_prompt() -> str:
    """Build the system prompt from all registered app manifests."""
    plugins = list(PLUGIN_REGISTRY.values())
    if not plugins:
        return (
            "You are Shin, a helpful AI assistant in a SuperApp platform. "
            "Respond directly to the user."
        )

    lines = ["You are Shin, a helpful AI assistant in a SuperApp platform."]
    lines.append("The user has access to the following apps:")
    for plugin in plugins:
        m = plugin["manifest"]
        if m.agent_description:
            lines.append(f"- {m.name}: {m.agent_description}")

    lines.append("Use the appropriate tools to help the user.")
    lines.append("If the request doesn't match any tool, respond directly.")
    lines.append("Be concise, friendly, and helpful.")
    return "\n".join(lines)


# ─── RootAgent ─────────────────────────────────────────────────────────────────

class RootAgent:
    """
    The root LangGraph agent — auto-discovers all registered app plugins.

    Routing is handled by the LLM itself via tool descriptions.
    No rule-based routing — the LLM picks the right tool
    based on its description and the user's message.
    """

    def __init__(self) -> None:
        self._system_prompt: str = ""

    def refresh(self) -> None:
        """Rebuild system prompt. Called after plugin discovery."""
        self._system_prompt = build_system_prompt()

    def _build_graph(self, all_tools: list[BaseTool]) -> StateGraph:
        """
        Build a ReAct tool-calling graph using create_react_agent.

        The LLM sees all available tools (with their descriptions from the manifest)
        and decides which to call. No manual routing logic needed.
        """
        from langgraph.prebuilt import create_react_agent

        llm = get_llm()
        return create_react_agent(
            model=llm,
            tools=all_tools,
            state_modifier=self._system_prompt or None,
        )

    async def astream(
        self,
        user_id: str,
        messages: list[dict[str, Any]],
        incoming_tools: list[dict[str, Any]] | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Stream data-stream events for assistant-ui.

        Yields:
          - {"type": "text", "content": str}
          - {"type": "tool_call", "toolName": str, "toolCallId": str, "args": dict}
          - {"type": "tool_result", "toolCallId": str, "result": Any}
          - {"type": "done"}
        """
        # 1. Get user's installed apps
        installations = await UserAppInstallation.find(
            UserAppInstallation.user_id == PydanticObjectId(user_id),
            UserAppInstallation.status == "active",
        ).to_list()
        user_app_ids = [inst.app_id for inst in installations]

        # 2. Collect all tools from installed plugins
        all_tools: list[BaseTool] = []
        for app_id in user_app_ids:
            plugin = PLUGIN_REGISTRY.get(app_id)
            if plugin:
                all_tools.extend(plugin["agent"].tools())

        # 3. Build graph with this user's tools
        graph = self._build_graph(all_tools)

        # 4. Build LangChain messages
        langchain_messages: list = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if isinstance(content, list):
                text_parts = [p["text"] for p in content if isinstance(p, dict) and p.get("type") == "text"]
                content = " ".join(text_parts)
            if role == "user":
                langchain_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                langchain_messages.append(AIMessage(content=content))

        # 5. Run graph — LLM decides which tool(s) to call
        async with graph.astream_events(
            {"messages": langchain_messages},
            config={"recursion_limit": 50},
        ) as stream:
            async for _namespace, event_type, chunk in stream:
                if event_type == "on_chat_model_stream":
                    if chunk.content:
                        yield {"type": "text", "content": str(chunk.content)}
                elif event_type == "on_tool_start":
                    yield {
                        "type": "tool_call",
                        "toolName": getattr(chunk, "name", "unknown"),
                        "toolCallId": getattr(chunk, "id", ""),
                        "args": getattr(chunk, "input", {}),
                    }
                elif event_type == "on_tool_end":
                    yield {
                        "type": "tool_result",
                        "toolCallId": getattr(chunk, "id", ""),
                        "result": getattr(chunk, "output", {}),
                    }

        yield {"type": "done"}


# Singleton
root_agent = RootAgent()
