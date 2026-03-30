"""Shared agent context utilities.

Thread-local user context for LangGraph tools. Each tool receives user_id
by reading from this shared dict — the agent sets it before invoking tools.
"""

from __future__ import annotations

# Thread-local storage: maps thread-id → user_id
_user_context: dict[str, str] = {}


def set_user_context(user_id: str) -> None:
    """Set the current user_id for this thread/request."""
    _user_context["current"] = user_id


def get_user_context() -> str:
    """Get the current user_id for this thread/request. Returns '' if not set."""
    return _user_context.get("current", "")


def clear_user_context() -> None:
    """Clear the current user context. Call at end of request."""
    _user_context.pop("current", None)
