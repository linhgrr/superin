"""
RootAgent — top-level LangGraph orchestrator.

Plugin discovery is fully automatic:
  - PLUGIN_REGISTRY is scanned at startup
  - Each installed AppAgent is wrapped as a tool: ask_{app_id}(question)
  - The root runtime injects thread context when delegating to a child agent
  - LLM decides which installed app agent to delegate to based on the user's request

Hierarchy:
    RootAgent (create_react_agent, top-level)
        └── Tool: ask_finance   ──→ FinanceAgent (child graph, app-scoped thread)
        └── Tool: ask_todo      ──→ TodoAgent    (child graph, app-scoped thread)

Message persistence:
  - ConversationMessage (core/models.py) stores full history in MongoDB.
  - RootAgent can load history for non-assistant-ui callers.
  - assistant-ui callers send full message history, so the chat route skips DB reload.
  - After streaming completes, new user/assistant turns are saved back to DB.
  - Each child AppAgent is a stateless LangGraph specialist invoked by the root agent.
"""

from .agent import RootAgent, root_agent
from .prompts import build_system_prompt
from .tools import _build_ask_tool

__all__ = ["RootAgent", "root_agent", "build_system_prompt", "_build_ask_tool"]
