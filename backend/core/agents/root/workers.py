"""
Plug-n-play parallel app workers using LangGraph v2 @task decorator.

Each @task function is a closure over its app_id. Workers are registered
dynamically from PLUGIN_REGISTRY at discovery time (startup), so new apps
automatically get parallel execution support without code changes.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

from langchain_core.runnables.config import RunnableConfig
from loguru import logger

from core.agents.base_app import BaseAppAgent
from core.registry import PLUGIN_REGISTRY

if TYPE_CHECKING:
    from langgraph.func import _TaskFunction

# Module-level task registry: app_id → @task decorated function
TASK_REGISTRY: dict[str, _TaskFunction] = {}

# ─────────────────────────────────────────────────────────────────────────────
# Shared worker body
# ─────────────────────────────────────────────────────────────────────────────




async def _run_app_delegate(
    question: str,
    user_id: str,
    thread_id: str,
    app_id: str,
    agent: BaseAppAgent,
    config: RunnableConfig,
) -> dict[str, Any]:
    """Execute BaseAppAgent.delegate() with timing and error shaping."""
    start = time.monotonic()
    try:
        result = await agent.delegate(
            question=question,
            thread_id=thread_id,
            user_id=user_id,
            config=config,
        )
        elapsed = time.monotonic() - start
        logger.info(
            "PARALLEL_WORKER_DONE  app=%s  user=%s  status=%s  elapsed=%.2fs",
            app_id,
            user_id,
            result.get("status", "?"),
            elapsed,
        )
        return result
    except Exception as exc:  # noqa: PERF203
        elapsed = time.monotonic() - start
        logger.error(
            "PARALLEL_WORKER_ERROR  app=%s  user=%s  error=%s  elapsed=%.2fs",
            app_id,
            user_id,
            exc,
            elapsed,
        )
        return {
            "app": app_id,
            "status": "failed",
            "ok": False,
            "message": (
                f"The {app_id} assistant hit an internal error while handling that request. "
                "Please try again."
            ),
            "question": question,
            "tool_results": [],
            "error": str(exc),
        }


# ─────────────────────────────────────────────────────────────────────────────
# Worker registration
# ─────────────────────────────────────────────────────────────────────────────

# Defer langgraph import to avoid side effects before app discovery
_langgraph_task: Any = None


def _get_task_decorator():
    global _langgraph_task
    if _langgraph_task is None:
        from langgraph.func import task as _t
        _langgraph_task = _t
    return _langgraph_task


_registered_app_ids: set[str] = set()


def refresh_workers() -> None:
    """Re-scan PLUGIN_REGISTRY and register workers for newly added apps.

    Existing workers are kept as-is.
    """
    task = _get_task_decorator()
    global _registered_app_ids

    for app_id, plugin in PLUGIN_REGISTRY.items():
        if app_id in _registered_app_ids:
            continue

        agent: BaseAppAgent = plugin["agent"]

        @task
        async def app_worker(
            question: str,
            user_id: str,
            thread_id: str,
            config: RunnableConfig,
            _app_id: str = app_id,
            _agent: BaseAppAgent = agent,
        ) -> dict[str, Any]:
            return await _run_app_delegate(question, user_id, thread_id, _app_id, _agent, config)

        TASK_REGISTRY[app_id] = app_worker
        _registered_app_ids.add(app_id)
        logger.info("Registered parallel worker for app=%s", app_id)


def get_task_registry() -> dict[str, _TaskFunction]:
    """Return the current task registry."""
    return TASK_REGISTRY


def get_task(app_id: str) -> _TaskFunction | None:
    """Return the @task worker for a given app_id, or None if not registered."""
    return TASK_REGISTRY.get(app_id)
