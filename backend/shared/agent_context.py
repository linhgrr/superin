"""Shared agent execution context utilities.

Use ContextVar instead of module-level mutable dicts so user/thread context
stays isolated per async request and nested tool invocation.
"""

from __future__ import annotations

from contextvars import ContextVar

_user_context: ContextVar[str] = ContextVar("agent_user_id", default="")
_thread_context: ContextVar[str] = ContextVar("agent_thread_id", default="")


def set_user_context(user_id: str) -> None:
    """Set the current request user id."""
    _user_context.set(user_id)


def get_user_context() -> str:
    """Get the current request user id, or an empty string when unset."""
    return _user_context.get()


def clear_user_context() -> None:
    """Clear the current request user id."""
    _user_context.set("")


def set_thread_context(thread_id: str) -> None:
    """Set the current request thread id."""
    _thread_context.set(thread_id)


def get_thread_context() -> str:
    """Get the current request thread id, or an empty string when unset."""
    return _thread_context.get()


def clear_thread_context() -> None:
    """Clear the current request thread id."""
    _thread_context.set("")


def clear_agent_context() -> None:
    """Clear all request-scoped agent context."""
    clear_user_context()
    clear_thread_context()
