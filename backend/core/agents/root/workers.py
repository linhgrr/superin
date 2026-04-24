"""Plug-n-play worker registry for the root orchestration graph."""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable

from langchain_core.runnables.config import RunnableConfig
from loguru import logger

from core.agents.base_app import BaseAppAgent
from core.registry import PLUGIN_REGISTRY

from .platform_agent import platform_agent
from .schemas import WorkerOutcome

WorkerRunner = Callable[[str, str, str, RunnableConfig], Awaitable[WorkerOutcome]]
WORKER_REGISTRY: dict[str, WorkerRunner] = {}

# ─────────────────────────────────────────────────────────────────────────────
# Shared worker body
# ─────────────────────────────────────────────────────────────────────────────

async def _run_app_delegate(
    subtask: str,
    user_id: str,
    thread_id: str,
    app_id: str,
    agent: BaseAppAgent,
    config: RunnableConfig,
) -> WorkerOutcome:
    """Execute BaseAppAgent.delegate() with timing and error shaping."""
    start = time.monotonic()
    try:
        result = await agent.delegate(
            subtask=subtask,
            thread_id=thread_id,
            user_id=user_id,
            config=config,
        )
        elapsed = time.monotonic() - start
        logger.info(
            "PARALLEL_WORKER_DONE  app={}  user={}  status={}  elapsed={:.2f}s",
            app_id,
            user_id,
            result["status"],
            elapsed,
        )
        return result
    except Exception as exc:  # noqa: PERF203
        elapsed = time.monotonic() - start
        logger.error(
            "PARALLEL_WORKER_ERROR  app={}  user={}  error={}  elapsed={:.2f}s",
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
            "subtask": subtask,
            "tool_results": [],
            "error": str(exc),
            "answer_state": "blocked",
            "evidence_summary": "",
            "missing_information": [],
            "followup_useful": False,
            "followup_hint": "",
            "capability_limit": "",
            "stop_reason": "internal_error",
            "contained_mutation": False,
            "retryable": False,
            "failure_kind": "worker_error",
        }


def refresh_workers() -> None:
    """Clear registry and re-register workers for ALL current PLUGIN_REGISTRY apps.

    This is called on every plugin discovery pass (including startup) so that
    newly added plugins get workers and the graph singleton picks them up.
    """
    global WORKER_REGISTRY

    # Clear existing state so previously-removed plugins are dropped
    WORKER_REGISTRY.clear()

    def register_worker(app_id: str, agent: BaseAppAgent) -> None:
        async def app_worker(
            subtask: str,
            user_id: str,
            thread_id: str,
            config: RunnableConfig,
            _app_id: str = app_id,
            _agent: BaseAppAgent = agent,
        ) -> WorkerOutcome:
            return await _run_app_delegate(subtask, user_id, thread_id, _app_id, _agent, config)

        WORKER_REGISTRY[app_id] = app_worker
        logger.info("Registered root worker for app={}", app_id)

    register_worker("platform", platform_agent)

    for app_id, plugin in PLUGIN_REGISTRY.items():
        agent: BaseAppAgent = plugin["agent"]
        register_worker(app_id, agent)


def get_worker_runner(app_id: str) -> WorkerRunner | None:
    """Return the worker runner for a given app_id, or None if not registered."""
    return WORKER_REGISTRY.get(app_id)
