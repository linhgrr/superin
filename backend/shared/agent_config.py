"""Helpers to extract per-request context from LangGraph/LangChain `RunnableConfig`.

Tools and child agents **must** receive context (user_id, thread_id, etc.) through
`RunnableConfig` instead of the legacy `ContextVar` shim. LangGraph and LangChain
auto-propagate `config` across the entire runnable tree, including parallel
branches, so this is safe for concurrent requests in a single process.

Usage inside a `@tool`::

    from langchain_core.runnables import RunnableConfig
    from shared.agent_config import require_user_id

    @tool("foo_do_something")
    async def foo_do_something(x: str, config: RunnableConfig) -> dict:
        user_id = require_user_id(config)
        ...

`config: RunnableConfig` is recognised by LangChain as an injected argument; it
is hidden from the LLM-facing tool schema and populated automatically at
invocation time.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from langchain_core.runnables import RunnableConfig


def _configurable(config: RunnableConfig | None) -> dict[str, Any]:
    if not config:
        return {}
    return config.get("configurable") or {}


def get_user_id(config: RunnableConfig | None) -> str:
    """Read `configurable.user_id` from config, returning '' if absent."""
    value = _configurable(config).get("user_id")
    return str(value) if value else ""


def get_thread_id(config: RunnableConfig | None) -> str:
    """Read `configurable.thread_id` from config, returning '' if absent."""
    value = _configurable(config).get("thread_id")
    return str(value) if value else ""


def require_user_id(config: RunnableConfig | None) -> str:
    """Read user_id from config; raise if it is missing/empty.

    Tools should call this when they cannot operate without a user identity —
    the raised ``RuntimeError`` is caught by ``safe_tool_call`` and surfaced
    as a structured tool_error rather than crashing the agent.
    """
    user_id = get_user_id(config)
    if not user_id:
        raise RuntimeError(
            "Tool invoked without user_id in RunnableConfig['configurable']. "
            "Ensure the parent agent forwards `config` when calling graph.ainvoke()."
        )
    return user_id
