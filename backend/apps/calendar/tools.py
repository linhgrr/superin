"""Calendar plugin LangGraph tools (LLM-facing).

Naming convention: every tool MUST be named {app_id}_{action}.
Enforced by verify_plugins() at startup.
"""

from langchain_core.tools import tool

from .service import calendar_service
from shared.agent_context import get_user_context


# ─── Tools ────────────────────────────────────────────────────────────────────

# TODO: rename and implement each tool.
# All tools MUST follow the {app_id}_{action} naming convention.

@tool
def calendar_list(limit: int = 20) -> list[dict]:
    """List all calendars for the current user."""
    user_id = get_user_context()
    return calendar_service.list(user_id, limit=limit)


@tool
def calendar_create(# TODO: add params) -> dict:
    """Create a new calendar."""
    user_id = get_user_context()
    return calendar_service.create(user_id, # TODO: pass params)


@tool
def calendar_delete(id_: str) -> dict:
    """Delete a calendar by ID."""
    user_id = get_user_context()
    return calendar_service.delete(id_, user_id)
