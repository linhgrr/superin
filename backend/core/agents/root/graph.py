"""
Parallel root agent using LangGraph v2 @entrypoint + @task API.

Architecture:
  @entrypoint root_agent
      │
      ├── detect_platform_request(messages, installed_apps)
      ├── route_and_craft(messages, installed_apps)
      │       ↓
      └── direct await of @task partials in a for loop
              ↓
          Each @task executes BaseAppAgent.delegate() in parallel.
              ↓
          Results collected → merged → synthesized → returned.

Memory:
  - Short-term: conversation history loaded from MongoDB per-request
  - Long-term: store (MongoDBStore) → injected `store` param for user memories
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_core.messages import BaseMessage
from loguru import logger

from .context import extract_question
from .routing import detect_platform_request, route_and_craft
from .schemas import AppDecision, ParallelGraphInput, ParallelGraphOutput
from .synthesis import merge_app_results, synthesize
from .workers import get_task, refresh_workers

if TYPE_CHECKING:
    from langgraph.store.base import BaseStore

# ─────────────────────────────────────────────────────────────────────────────
# @entrypoint root agent
# ─────────────────────────────────────────────────────────────────────────────


def _build_entrypoint(store: BaseStore) -> Any:
    """Build the @entrypoint root agent with the given long-term memory store."""
    from langgraph.func import entrypoint
    from langgraph.types import StreamWriter

    # No checkpointer: short-term conversation history lives in MongoDB
    # (loaded per-request via RootAgent._build_message_list) and long-term
    # memories are in the BaseStore. MemorySaver would be a redundant layer and
    # its state is lost on restart anyway.

    @entrypoint(store=store)
    async def root_agent(
        input_data: ParallelGraphInput,
        *,
        writer: StreamWriter,
    ) -> ParallelGraphOutput:
        """Main parallel orchestrator — fan-out to multiple app workers in parallel."""
        messages: list[BaseMessage] = input_data["messages"]
        user_id: str = input_data["user_id"]
        thread_id: str = input_data["thread_id"]
        installed_app_ids: list[str] = input_data["installed_app_ids"]

        logger.info(
            "PARALLEL_ROOT_START  user={}  thread={}  installed={}",
            user_id,
            thread_id,
            installed_app_ids,
        )

        # ── Step 1: Classify request + build app subtasks ────────────────────
        platform_decision = await detect_platform_request(messages, installed_app_ids)
        if platform_decision.route == "platform":
            decisions = [
                AppDecision(
                    app_id="platform",
                    subtask=extract_question(messages),
                )
            ]
        else:
            routing_decision = await route_and_craft(messages, installed_app_ids)
            decisions = routing_decision.app_decisions

        if not decisions:
            logger.info("PARALLEL_ROOT_NO_APPS  user={}  → direct synthesize", user_id)
            final_answer = await synthesize(
                messages=messages,
                writer=writer,
                user_id=user_id,
                store=store,
                installed_app_ids=installed_app_ids,
            )
            writer({"type": "done", "content": final_answer})
            return ParallelGraphOutput(
                app_results=[],
                app_errors=[],
                merged_context="",
                final_answer=final_answer,
            )

        logger.info(
            "PARALLEL_ROOT_DISPATCH  user={}  target_apps={}  total={}",
            user_id,
            [decision.app_id for decision in decisions],
            len(decisions),
        )

        # ── Step 2: Fan-out — invoke @task workers in parallel ───────────────
        futures: list[tuple[str, Any]] = []
        for decision in decisions:
            app_id = decision.app_id
            task_fn = get_task(app_id)
            if task_fn is None:
                logger.warning(
                    "PARALLEL_ROOT_SKIP  app_id={} not in TASK_REGISTRY (not discovered?)",
                    app_id,
                )
                continue

            # @task returns a functools.partial — call it directly to get the future.
            # Do NOT use .invoke() — that attribute doesn't exist on partial.
            future = task_fn(
                subtask=decision.subtask,
                user_id=user_id,
                thread_id=thread_id,
            )
            futures.append((app_id, future))

        if not futures:
            logger.warning("PARALLEL_ROOT_NO_FUTURES  user={}  no valid tasks", user_id)
            final_answer = await synthesize(
                messages=messages,
                writer=writer,
                user_id=user_id,
                store=store,
                installed_app_ids=installed_app_ids,
            )
            writer({"type": "done", "content": final_answer})
            return ParallelGraphOutput(
                app_results=[],
                app_errors=[],
                merged_context="",
                final_answer=final_answer,
            )

        # ── Step 3: Collect results from workers ───────────────────────────────
        # All @task futures have already been submitted above (L112-117).
        # Awaiting each in order does NOT block parallelism — LangGraph submits
        # tasks to its executor on call; `await` just waits for the result.
        app_results: list[dict] = []
        app_errors: list[dict] = []

        for app_id, future in futures:
            result: dict[str, Any]
            try:
                result = await future
            except Exception as exc:  # noqa: PERF203
                logger.error("PARALLEL_WORKER_UNHANDLED  app={}  error={}", app_id, exc)
                result = {
                    "app": app_id,
                    "status": "failed",
                    "ok": False,
                    "message": (
                        f"The {app_id} assistant hit an unexpected error. Please try again."
                    ),
                    "question": "",
                    "tool_results": [],
                    "error": str(exc),
                }

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

        # ── Step 4: Merge all results ────────────────────────────────────────
        merged = merge_app_results(app_results)
        writer({"type": "merged_context", "content": merged[:500]})

        # ── Step 5: Synthesize final answer with streaming tokens ─────────────
        final_answer = await synthesize(
            messages=messages,
            writer=writer,
            user_id=user_id,
            store=store,
            installed_app_ids=installed_app_ids,
            merged_context=merged,
        )

        logger.info(
            "PARALLEL_ROOT_DONE  user={}  results={}  errors={}  answer_len={}",
            user_id,
            len(app_results),
            len(app_errors),
            len(final_answer),
        )

        writer({"type": "done", "content": final_answer})

        return ParallelGraphOutput(
            app_results=app_results,
            app_errors=app_errors,
            merged_context=merged,
            final_answer=final_answer,
        )

    return root_agent


# Lazy singleton — compiled graph
_root_agent_graph: Any = None


def get_root_agent_graph() -> Any:
    """Get or create the singleton @entrypoint compiled graph with long-term memory store."""
    global _root_agent_graph
    if _root_agent_graph is None:
        from core.db import get_store
        _root_agent_graph = _build_entrypoint(get_store())
    return _root_agent_graph


def refresh_graph() -> None:
    """Invalidate the cached graph (call after plugin discovery changes)."""
    global _root_agent_graph
    _root_agent_graph = None
    refresh_workers()  # also refresh task registry
