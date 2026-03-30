"""Habit plugin LangGraph tools (LLM-facing).

Naming convention: every tool MUST be named {app_id}_{action}.
Enforced by verify_plugins() at startup.
"""

from langchain_core.tools import tool

from .service import habit_service
from shared.agent_context import get_user_context


# ─── Tools ────────────────────────────────────────────────────────────────────

# TODO: rename and implement each tool.
# All tools MUST follow the {app_id}_{action} naming convention.

@tool
def habit_list(limit: int = 20) -> list[dict]:
    """List all habits for the current user."""
    user_id = get_user_context()
    return habit_service.list(user_id, limit=limit)


@tool
def habit_create(# TODO: add params) -> dict:
    """Create a new habit."""
    user_id = get_user_context()
    return habit_service.create(user_id, # TODO: pass params)


@tool
def habit_delete(id_: str) -> dict:
    """Delete a habit by ID."""
    user_id = get_user_context()
    return habit_service.delete(id_, user_id)
