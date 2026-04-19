"""
Parallel root agent using LangGraph v2 @entrypoint + @task API.

Root graph responsibilities:
1. Read prior thread state from the LangGraph checkpointer.
2. Classify whether the turn is a platform request or domain request.
3. Run either the platform agent or routed domain agents.
4. Synthesize the final answer and append it back into checkpoint state.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage, BaseMessage
from langgraph.func import task
from langgraph.types import RetryPolicy
from loguru import logger

from .context import extract_question
from .routing import detect_platform_request, route_and_craft
from .schemas import NewTurnInput, PlatformDecision, RootState
from .synthesis import merge_app_results, synthesize
from .workers import get_task, refresh_workers

if TYPE_CHECKING:
    from collections.abc import Callable

    from langchain_core.runnables import RunnableConfig
    from langgraph.store.base import BaseStore
    from langgraph.types import StreamWriter

    from .schemas import RoutingDecision


# ─── Concurrency limits ─────────────────────────────────────────────────────────

# Maximum number of child agents that run in parallel per turn.
_PARALLELISM_LIMIT = 3

# Overall timeout for the entire agent turn (routing + all workers + synthesis).
# Prevents a single stuck turn from consuming resources indefinitely.
_TURN_TIMEOUT_SECONDS = 120.0


# ─────────────────────────────────────────────────────────────────────────────
# LLM tasks — wrap routing/synthesize so they get tracing + retry + checkpoint
# ─────────────────────────────────────────────────────────────────────────────

# Retry transient LLM failures (network, rate-limit) but not programming bugs.
# default_retry_on already filters retryable errors; bump attempts for routing.
_ROUTING_RETRY = RetryPolicy(max_attempts=2, initial_interval=0.5, backoff_factor=2.0)


@task(retry_policy=_ROUTING_RETRY)
async def route_and_craft_task(
    messages: list[BaseMessage],
    installed_app_ids: list[str],
) -> RoutingDecision:
    """Traceable wrapper around route_and_craft with transient-error retry."""
    return await route_and_craft(messages, installed_app_ids)


@task(retry_policy=_ROUTING_RETRY)
async def detect_platform_request_task(
    messages: list[BaseMessage],
    installed_app_ids: list[str],
) -> PlatformDecision:
    """Traceable wrapper around platform-request detection."""
    return await detect_platform_request(messages, installed_app_ids)


@task
async def synthesize_task(
    messages: list[BaseMessage],
    writer: Callable[[Any], None],
    user_id: str,
    store: BaseStore | None,
    user_tz: str,
    installed_app_ids: list[str] | None = None,
    merged_context: str = "",
) -> str:
    """Traceable wrapper around synthesize.

    No retry: synthesize streams tokens to the client via writer — replaying
    would emit duplicate tokens. Retries are the caller's responsibility if
    they're tolerable at the UX level.
    """
    return await synthesize(
        messages=messages,
        writer=writer,
        user_id=user_id,
        store=store,
        user_tz=user_tz,
        installed_app_ids=installed_app_ids,
        merged_context=merged_context,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _failed_worker_dict(app_id_: str, subtask: str, err: str) -> dict[str, Any]:
    return {
        "app": app_id_,
        "status": "failed",
        "ok": False,
        "message": f"The {app_id_} assistant hit an unexpected error. Please try again.",
        "subtask": subtask,
        "tool_results": [],
        "error": err,
    }


async def _run_limited_worker(
    task_fn: Any,
    semaphore: asyncio.Semaphore,
    *,
    subtask: str,
    user_id: str,
    thread_id: str,
) -> dict[str, Any]:
    """Execute a child worker under the shared concurrency semaphore."""
    async with semaphore:
        return await task_fn(
            subtask=subtask,
            user_id=user_id,
            thread_id=thread_id,
        )


# ─────────────────────────────────────────────────────────────────────────────
# @entrypoint root agent
# ─────────────────────────────────────────────────────────────────────────────


def _build_entrypoint(store: BaseStore, checkpointer: Any) -> Any:
    """Build the @entrypoint root agent with checkpointer + long-term memory store."""
    from langgraph.func import entrypoint

    @entrypoint(store=store, checkpointer=checkpointer)
    async def root_agent(
        input_data: NewTurnInput,
        *,
        previous: RootState | None,
        writer: StreamWriter,
        config: RunnableConfig,
    ) -> RootState:
        """Supervisor-pattern orchestrator: decides which apps are needed AND
        crafts domain-specific subtasks for each child agent, then synthesizes
        a unified response.
        """
        cfg = config["configurable"]
        user_id: str = cfg["user_id"]
        thread_id: str = cfg["thread_id"]
        user_tz: str = cfg.get("user_tz", "UTC")
        installed_app_ids: list[str] = cfg.get("installed_app_ids", [])

        prior: list[BaseMessage] = (previous or {}).get("messages", [])
        new_msgs: list[BaseMessage] = input_data["new_messages"]
        messages: list[BaseMessage] = prior + new_msgs
        turn_semaphore = asyncio.Semaphore(_PARALLELISM_LIMIT)

        logger.info(
            "PARALLEL_ROOT_START  user={}  thread={}  installed={}  prior={}  new={}  combined={}",
            user_id,
            thread_id,
            installed_app_ids,
            len(prior),
            len(new_msgs),
            len(messages),
        )

        # ── Step 1: Platform route or app routing ───────────────────────────
        platform_decision = await detect_platform_request_task(messages, installed_app_ids)
        if platform_decision.route == "platform":
            logger.info("PARALLEL_ROOT_PLATFORM  user={}  reason={}", user_id, platform_decision.reason)
            platform_task = get_task("platform")
            if platform_task is not None:
                result = await _run_limited_worker(
                    platform_task,
                    turn_semaphore,
                    subtask=extract_question(messages),
                    user_id=user_id,
                    thread_id=thread_id,
                )
                writer({
                    "type": "app_result",
                    "app_id": "platform",
                    "status": result.get("status", "unknown"),
                    "ok": result.get("ok", False),
                })
                merged = merge_app_results([result])
                writer({"type": "merged_context", "content": merged[:500]})
                final_answer = await synthesize_task(
                    messages=messages,
                    writer=writer,
                    user_id=user_id,
                    store=store,
                    user_tz=user_tz,
                    installed_app_ids=installed_app_ids,
                    merged_context=merged,
                )
                writer({"type": "done", "content": final_answer})
                return {"messages": messages + [AIMessage(content=final_answer)]}

        # ── Step 2: Routing + Subtask Crafting ──────────────────────────────
        decision: RoutingDecision = await route_and_craft_task(
            messages, installed_app_ids
        )

        if not decision.app_decisions:
            logger.info("PARALLEL_ROOT_NO_APPS  user={}  → direct synthesize", user_id)
            final_answer = await synthesize_task(
                messages=messages,
                writer=writer,
                user_id=user_id,
                store=store,
                user_tz=user_tz,
                installed_app_ids=installed_app_ids,
            )
            writer({"type": "done", "content": final_answer})
            return {"messages": messages + [AIMessage(content=final_answer)]}

        logger.info(
            "PARALLEL_ROOT_DISPATCH  user={}  decisions={}",
            user_id,
            [(d.app_id, d.subtask[:60]) for d in decision.app_decisions],
        )

        # ── Step 3: Fan-out — invoke @task workers in parallel ──────────────
        futures: list[tuple[str, str, Any]] = []  # (app_id, subtask, future)

        for app_decision in decision.app_decisions:
            task_fn = get_task(app_decision.app_id)
            if task_fn is None:
                logger.warning(
                    "PARALLEL_ROOT_SKIP  app_id={} not in TASK_REGISTRY (not discovered?)",
                    app_decision.app_id,
                )
                continue

            future = _run_limited_worker(
                task_fn,
                turn_semaphore,
                subtask=app_decision.subtask,
                user_id=user_id,
                thread_id=thread_id,
            )
            futures.append((app_decision.app_id, app_decision.subtask, future))

        if not futures:
            logger.warning("PARALLEL_ROOT_NO_FUTURES  user={}  no valid tasks", user_id)
            final_answer = await synthesize_task(
                messages=messages,
                writer=writer,
                user_id=user_id,
                store=store,
                user_tz=user_tz,
                installed_app_ids=installed_app_ids,
            )
            writer({"type": "done", "content": final_answer})
            return {"messages": messages + [AIMessage(content=final_answer)]}

        # ── Step 4: Collect results (parallel gather with overall turn timeout) ───
        app_results: list[dict] = []
        app_errors: list[dict] = []

        try:
            async with asyncio.timeout(_TURN_TIMEOUT_SECONDS):
                results_or_exc = await asyncio.gather(
                    *(future for _, _, future in futures),
                    return_exceptions=True,
                )

                for (app_id, subtask, _), result in zip(futures, results_or_exc):
                    if isinstance(result, Exception):
                        logger.error("worker_failed  app={}  error={}", app_id, result)
                        result = _failed_worker_dict(app_id, subtask, str(result))

                    if result.get("status") == "failed":
                        app_errors.append(result)
                    else:
                        app_results.append(result)

                    writer({
                        "type": "app_result",
                        "app_id": app_id,
                        "status": result.get("status", "unknown"),
                        "ok": result.get("ok", False),
                    })

        except TimeoutError:
            logger.error(
                "PARALLEL_ROOT_TIMEOUT  user={}  exceeded {}s",
                user_id,
                _TURN_TIMEOUT_SECONDS,
            )
            for app_id, subtask, _ in futures:
                app_errors.append(
                    _failed_worker_dict(
                        app_id, subtask,
                        f"Turn timed out after {_TURN_TIMEOUT_SECONDS}s",
                    )
                )

        # ── Step 5: Merge all results ───────────────────────────────────────
        merged = merge_app_results(app_results)
        writer({"type": "merged_context", "content": merged[:500]})

        # ── Step 6: Synthesize final answer ───────────────────────────────────
        final_answer = await synthesize_task(
            messages=messages,
            writer=writer,
            user_id=user_id,
            store=store,
            user_tz=user_tz,
            installed_app_ids=installed_app_ids,
            merged_context=merged,
        )

        logger.info(
            "PARALLEL_ROOT_DONE  user={}  results={}  errors={}  "
            "answer_len={}  next_state_messages={}",
            user_id,
            len(app_results),
            len(app_errors),
            len(final_answer),
            len(messages) + 1,
        )

        writer({"type": "done", "content": final_answer})

        return {"messages": messages + [AIMessage(content=final_answer)]}

    return root_agent


# Lazy singleton — compiled graph
_root_agent_graph: Any = None


def get_root_agent_graph() -> Any:
    """Get or create the singleton @entrypoint compiled graph with checkpointer + store."""
    global _root_agent_graph
    if _root_agent_graph is None:
        from core.db import get_checkpointer, get_store

        _root_agent_graph = _build_entrypoint(get_store(), get_checkpointer())
    return _root_agent_graph


def refresh_graph() -> None:
    """Invalidate the cached graph (call after plugin discovery changes)."""
    global _root_agent_graph
    _root_agent_graph = None
    refresh_workers()  # also refresh task registry
