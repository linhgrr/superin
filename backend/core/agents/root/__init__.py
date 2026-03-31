"""
RootAgent — top-level LangGraph orchestrator.

Plugin discovery is fully automatic:
  - PLUGIN_REGISTRY is scanned at startup
  - Each AppAgent is wrapped as a tool: ask_{app_id}(question, thread_id)
  - LLM decides which app agent to delegate to based on the user's request

Hierarchy:
    RootAgent (create_react_agent, top-level)
        └── Tool: ask_finance   ──→ FinanceAgent (subgraph, own history)
        └── Tool: ask_todo      ──→ TodoAgent    (subgraph, own history)
        └── Tool: ask_calendar ──→ CalendarAgent (subgraph, own history)

Message persistence:
  - ConversationMessage (core/models.py) stores full history in MongoDB.
  - RootAgent loads history from DB on every request → passes to graph.
  - After streaming completes, new messages are saved back to DB.
  - Each AppAgent subgraph has its own AsyncMongoDBSaver (in core/db.py).
"""

from .agent import RootAgent, root_agent
from .prompts import build_system_prompt
from .tools import _build_ask_tool

__all__ = ["RootAgent", "root_agent", "build_system_prompt", "_build_ask_tool"]
