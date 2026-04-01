"""
Tools used by the orchestrator agent.
"""

from typing import Any

from langchain_core.tools import BaseTool, tool

from core.agents.base_app import BaseAppAgent
from shared.agent_context import get_thread_context


def _build_ask_tool(app_id: str, agent: BaseAppAgent, agent_description: str) -> BaseTool:
    """
    Wrap an installed app agent as a tool the root agent can call.

    The LLM only supplies the domain question; thread context is injected by
    the runtime so models never need to fabricate internal execution ids.
    """

    @tool(f"ask_{app_id}", description=agent_description)
    async def ask_app(question: str) -> dict[str, Any]:
        thread_id = get_thread_context()
        if not thread_id:
            raise RuntimeError(f"Missing thread context for ask_{app_id}")
        return await agent.delegate(question, thread_id)

    return ask_app
