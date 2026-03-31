"""
Tools used by the orchestrator agent.
"""

from langchain_core.tools import BaseTool, tool

from shared.interfaces import AgentProtocol

def _build_ask_tool(app_id: str, agent: AgentProtocol, agent_description: str) -> BaseTool:
    """
    Wrap an AppAgent as a tool: ask_{app_id}(question, thread_id).
    The tool's description (from @tool) is used by the LLM to decide when to delegate.

    Pass the tool name as the first positional arg so the tool is named ask_{app_id}.
    """

    @tool(f"ask_{app_id}", description=agent_description)
    async def ask_app(question: str, thread_id: str) -> str:
        return await agent.delegate(question, thread_id)

    return ask_app
