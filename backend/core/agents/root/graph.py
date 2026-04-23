"""Parallel root agent built on StateGraph + Send."""

from __future__ import annotations

import asyncio
from collections import Counter
from collections.abc import Sequence
from typing import TYPE_CHECKING, Any, Literal, TypeAlias

from langchain_core.messages import AIMessage, BaseMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.config import get_config, get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.runtime import Runtime
from langgraph.types import Send
from loguru import logger

from core.config import settings

from .merged_response import merge_app_results
from .routing import plan_followups, route_and_craft
from .runtime_context import RootGraphContext
from .schemas import (
    NewTurnInput,
    RootGraphState,
    RootState,
    ThinkingStatus,
    WorkerDispatch,
    WorkerOutcome,
)
from .synthesis import synthesize
from .workers import get_worker_runner, refresh_workers

if TYPE_CHECKING:
    from langgraph.store.base import BaseStore


_TURN_TIMEOUT_SECONDS = 120.0
RootCompiledGraph: TypeAlias = CompiledStateGraph[
    RootGraphState,
    RootGraphContext,
    NewTurnInput,
    RootState,
]


def _build_final_ai_message(answer: str, runtime: Runtime[RootGraphContext]) -> AIMessage:
    """Persist the assistant reply under the same id used during streaming."""
    return AIMessage(
        content=answer,
        id=runtime.context.assistant_message_id,
    )


async def _synthesize_answer(
    messages: list[BaseMessage],
    runtime: Runtime[RootGraphContext],
    *,
    merged_context: str,
) -> str:
    writer = get_stream_writer()
    return await synthesize(
        messages=messages,
        writer=writer,
        user_id=runtime.context.user_id,
        store=runtime.store,
        user_tz=runtime.context.user_tz,
        installed_app_ids=runtime.context.installed_app_ids,
        merged_context=merged_context,
    )


def _failed_worker_dict(app_id_: str, subtask: str, err: str) -> WorkerOutcome:
    return {
        "app": app_id_,
        "status": "failed",
        "ok": False,
        "message": f"The {app_id_} assistant hit an unexpected error. Please try again.",
        "subtask": subtask,
        "tool_results": [],
        "error": err,
        "retryable": False,
        "failure_kind": "worker_error",
    }


def _humanize_worker_name(app_id: str) -> str:
    if app_id == "platform":
        return "workspace"
    return app_id.replace("_", " ").replace("-", " ").strip().title()


def _emit_thinking(step_id: str, label: str, status: ThinkingStatus) -> None:
    get_stream_writer()(
        {
            "type": "thinking",
            "step_id": step_id,
            "label": label,
            "status": status,
        }
    )


def _build_synthesis_context(worker_outcomes: list[WorkerOutcome]) -> str:
    """Build synthesis context from all worker outcomes, including failures."""
    return merge_app_results(worker_outcomes)


def _count_failed_outcomes(worker_outcomes: list[WorkerOutcome]) -> int:
    """Count worker outcomes that ended in failure."""
    return sum(1 for outcome in worker_outcomes if outcome["status"] == "failed")


def _normalize_subtask(subtask: str) -> str:
    return " ".join(subtask.lower().split())


def _dispatch_fingerprint(app_id: str, subtask: str) -> str:
    return f"{app_id}::{_normalize_subtask(subtask)}"


def _known_dispatch_fingerprints(worker_outcomes: list[WorkerOutcome]) -> set[str]:
    return {
        _dispatch_fingerprint(outcome["app"], outcome["subtask"])
        for outcome in worker_outcomes
    }


def _count_app_attempts(worker_outcomes: list[WorkerOutcome]) -> Counter[str]:
    attempts: Counter[str] = Counter()
    for outcome in worker_outcomes:
        attempts[outcome["app"]] += 1
    return attempts


def _blocked_followup_apps(worker_outcomes: list[WorkerOutcome]) -> set[str]:
    blocked_apps: set[str] = set()
    for outcome in worker_outcomes:
        if outcome["status"] == "awaiting_confirmation":
            blocked_apps.add(outcome["app"])
            continue
        if outcome["status"] == "failed" and not outcome.get("retryable", False):
            blocked_apps.add(outcome["app"])
            continue
        if outcome.get("capability_limit") and not outcome.get("followup_useful", False):
            blocked_apps.add(outcome["app"])
    return blocked_apps


def _round_has_followup_signal(current_round_outcomes: list[WorkerOutcome]) -> bool:
    for outcome in current_round_outcomes:
        if outcome["status"] == "failed" and outcome.get("retryable", False):
            return True
        if outcome["status"] == "partial":
            return True
        if outcome.get("followup_useful", False):
            return True
    return False


def _filter_followup_dispatches(
    dispatches: list[WorkerDispatch],
    worker_outcomes: list[WorkerOutcome],
) -> list[WorkerDispatch]:
    seen_fingerprints = _known_dispatch_fingerprints(worker_outcomes)
    attempt_counts = _count_app_attempts(worker_outcomes)
    blocked_apps = _blocked_followup_apps(worker_outcomes)

    filtered: list[WorkerDispatch] = []
    for dispatch in dispatches:
        app_id = dispatch["app_id"]
        subtask = dispatch["subtask"]
        fingerprint = _dispatch_fingerprint(app_id, subtask)

        if fingerprint in seen_fingerprints:
            logger.info(
                "PARALLEL_ROOT_FOLLOWUP_DROP  app={}  reason=duplicate_subtask",
                app_id,
            )
            continue

        if app_id in blocked_apps:
            logger.info(
                "PARALLEL_ROOT_FOLLOWUP_DROP  app={}  reason=blocked_app",
                app_id,
            )
            continue

        if attempt_counts[app_id] >= settings.root_agent_max_app_attempts_per_turn:
            logger.info(
                "PARALLEL_ROOT_FOLLOWUP_DROP  app={}  reason=attempt_cap  attempts={}  cap={}",
                app_id,
                attempt_counts[app_id],
                settings.root_agent_max_app_attempts_per_turn,
            )
            continue

        filtered.append(dispatch)

    return filtered


def _build_worker_sends(state: RootGraphState) -> list[Send]:
    sends: list[Send] = []
    for dispatch in state.get("dispatches", []):
        if get_worker_runner(dispatch["app_id"]) is None:
            logger.warning(
                "PARALLEL_ROOT_SKIP  app_id={} not in worker registry",
                dispatch["app_id"],
            )
            continue

        sends.append(Send("run_worker", {"dispatch": dispatch}))
    return sends


def _log_turn_start(state: RootGraphState, runtime: Runtime[RootGraphContext]) -> None:
    prior_count = len(state.get("messages", []))
    new_count = len(state.get("new_messages", []))
    logger.info(
        "PARALLEL_ROOT_START  user={}  thread={}  installed={}  prior={}  new={}  combined={}",
        runtime.context.user_id,
        runtime.context.thread_id,
        runtime.context.installed_app_ids,
        prior_count,
        new_count,
        prior_count + new_count,
    )


async def _load_turn_context(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    _log_turn_start(state, runtime)
    _emit_thinking("routing", "Understanding your request", "active")
    return {
        "messages": state.get("new_messages", []),
        "dispatches": [],
        "worker_outcomes": [],
        "current_round_outcomes": [],
        "merged_context": "",
        "dispatch_round": 0,
    }


async def _plan_dispatch(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    messages = state.get("messages", [])
    try:
        decision = await route_and_craft(messages, runtime.context.installed_app_ids)
    except Exception as exc:
        logger.warning(
            "PARALLEL_ROOT_ROUTING_FAILED  user={}  error={}  -> direct synthesize",
            runtime.context.user_id,
            exc,
        )
        return {
            "dispatches": [],
            "current_round_outcomes": [],
        }

    dispatches: list[WorkerDispatch] = [
        {
            "app_id": item.app_id,
            "subtask": item.subtask,
        }
        for item in decision.app_decisions
    ]

    if dispatches:
        _emit_thinking(
            "routing",
            f"Found {len(dispatches)} workspace source{'s' if len(dispatches) != 1 else ''} to check",
            "done",
        )
        logger.info(
            "PARALLEL_ROOT_DISPATCH  user={}  decisions={}",
            runtime.context.user_id,
            [(item["app_id"], item["subtask"][:60]) for item in dispatches],
        )
    else:
        _emit_thinking("routing", "No app lookup needed for this reply", "done")
        logger.info(
            "PARALLEL_ROOT_NO_APPS  user={}  -> direct synthesize",
            runtime.context.user_id,
        )

    return {
        "dispatches": dispatches,
        "current_round_outcomes": [],
        "dispatch_round": 1 if dispatches else 0,
    }


def _dispatch_initial_workers(
    state: RootGraphState,
) -> Sequence[Send] | Literal["synthesize_direct"]:
    sends = _build_worker_sends(state)
    if sends:
        return sends

    return "synthesize_direct"


def _dispatch_followup_workers(
    state: RootGraphState,
) -> Sequence[Send] | Literal["synthesize_final"]:
    sends = _build_worker_sends(state)
    if sends:
        return sends

    return "synthesize_final"


async def _run_worker(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    dispatch = state["dispatch"]
    app_id = dispatch["app_id"]
    subtask = dispatch["subtask"]
    runner = get_worker_runner(app_id)
    config = get_config()
    worker_name = _humanize_worker_name(app_id)

    _emit_thinking(f"worker:{app_id}", f"Checking {worker_name}", "active")

    if runner is None:
        outcome = _failed_worker_dict(app_id, subtask, "Worker not registered")
    else:
        try:
            async with runtime.context.worker_semaphore:
                outcome = await asyncio.wait_for(
                    runner(
                        subtask,
                        runtime.context.user_id,
                        runtime.context.thread_id,
                        config,
                    ),
                    timeout=_TURN_TIMEOUT_SECONDS,
                )
        except TimeoutError:
            logger.error(
                "PARALLEL_ROOT_TIMEOUT  user={}  app={}  exceeded {}s",
                runtime.context.user_id,
                app_id,
                _TURN_TIMEOUT_SECONDS,
            )
            outcome = _failed_worker_dict(
                app_id,
                subtask,
                f"Turn timed out after {_TURN_TIMEOUT_SECONDS}s",
            )
            outcome["failure_kind"] = "root_timeout"
        except Exception as exc:
            logger.error("worker_failed  app={}  error={}", app_id, exc)
            outcome = _failed_worker_dict(app_id, subtask, str(exc))

    if outcome["status"] == "failed":
        _emit_thinking(f"worker:{app_id}", f"Finished {worker_name} with an issue", "done")
    else:
        _emit_thinking(f"worker:{app_id}", f"Finished checking {worker_name}", "done")

    return {
        "worker_outcomes": [outcome],
        "current_round_outcomes": [outcome],
    }


async def _merge_results(state: RootGraphState) -> RootGraphState:
    merged = _build_synthesis_context(state.get("worker_outcomes", []))
    return {"merged_context": merged}


async def _plan_followups(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    current_round_outcomes = state.get("current_round_outcomes", [])
    worker_outcomes = state.get("worker_outcomes", [])
    dispatch_round = state.get("dispatch_round", 0)
    max_rounds = settings.root_agent_max_dispatch_rounds

    _emit_thinking("followup", "Evaluating whether another lookup is needed", "active")

    if not current_round_outcomes:
        _emit_thinking("followup", "No further lookup needed", "done")
        return {"dispatches": [], "current_round_outcomes": []}

    if not _round_has_followup_signal(current_round_outcomes):
        logger.info(
            "PARALLEL_ROOT_FOLLOWUP_STOP  user={}  round={}  reason=no_followup_signal",
            runtime.context.user_id,
            dispatch_round,
        )
        _emit_thinking("followup", "Current app results are already sufficient", "done")
        return {"dispatches": [], "current_round_outcomes": []}

    if dispatch_round >= max_rounds:
        logger.info(
            "PARALLEL_ROOT_FOLLOWUP_STOP  user={}  round={}  reason=max_rounds",
            runtime.context.user_id,
            dispatch_round,
        )
        _emit_thinking("followup", "Reached the lookup limit for this turn", "done")
        return {"dispatches": [], "current_round_outcomes": []}

    blocked_apps = _blocked_followup_apps(worker_outcomes)
    try:
        decision = await plan_followups(
            state.get("messages", []),
            runtime.context.installed_app_ids,
            current_round_outcomes=current_round_outcomes,
            all_worker_outcomes=worker_outcomes,
            blocked_app_ids=blocked_apps,
            dispatch_round=dispatch_round,
            max_rounds=max_rounds,
        )
    except Exception as exc:
        logger.warning(
            "PARALLEL_ROOT_FOLLOWUP_FAILED  user={}  round={}  error={}  -> synthesize",
            runtime.context.user_id,
            dispatch_round,
            exc,
        )
        _emit_thinking("followup", "Continuing with the current results", "done")
        return {"dispatches": [], "current_round_outcomes": []}

    if decision.action != "redispatch":
        logger.info(
            "PARALLEL_ROOT_FOLLOWUP_STOP  user={}  round={}  reason=planner_stop",
            runtime.context.user_id,
            dispatch_round,
        )
        _emit_thinking("followup", "Enough context gathered", "done")
        return {"dispatches": [], "current_round_outcomes": []}

    proposed_dispatches: list[WorkerDispatch] = [
        {
            "app_id": item.app_id,
            "subtask": item.subtask,
        }
        for item in decision.app_decisions
    ]
    dispatches = _filter_followup_dispatches(proposed_dispatches, worker_outcomes)
    if not dispatches:
        logger.info(
            "PARALLEL_ROOT_FOLLOWUP_STOP  user={}  round={}  reason=no_valid_followups",
            runtime.context.user_id,
            dispatch_round,
        )
        _emit_thinking("followup", "Enough context gathered", "done")
        return {"dispatches": [], "current_round_outcomes": []}

    logger.info(
        "PARALLEL_ROOT_REDISPATCH  user={}  round={}  decisions={}",
        runtime.context.user_id,
        dispatch_round + 1,
        [(item["app_id"], item["subtask"][:60]) for item in dispatches],
    )
    _emit_thinking(
        "followup",
        f"Doing {len(dispatches)} more targeted lookup{'s' if len(dispatches) != 1 else ''}",
        "done",
    )
    return {
        "dispatches": dispatches,
        "current_round_outcomes": [],
        "dispatch_round": dispatch_round + 1,
    }


async def _synthesize_direct(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    _emit_thinking("synthesis", "Drafting the reply", "active")
    answer = await _synthesize_answer(
        state.get("messages", []),
        runtime,
        merged_context="",
    )
    get_stream_writer()({"type": "done", "content": answer})
    return {
        "messages": [_build_final_ai_message(answer, runtime)],
        "new_messages": [],
    }


async def _synthesize_final(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    worker_outcomes = state.get("worker_outcomes", [])
    _emit_thinking("synthesis", "Combining the results into one reply", "active")
    answer = await _synthesize_answer(
        state.get("messages", []),
        runtime,
        merged_context=state.get("merged_context", ""),
    )

    logger.info(
        "PARALLEL_ROOT_DONE  user={}  results={}  errors={}  answer_len={}  next_state_messages={}",
        runtime.context.user_id,
        len(worker_outcomes) - _count_failed_outcomes(worker_outcomes),
        _count_failed_outcomes(worker_outcomes),
        len(answer),
        len(state.get("messages", [])) + 1,
    )

    get_stream_writer()({"type": "done", "content": answer})
    return {
        "messages": [_build_final_ai_message(answer, runtime)],
        "new_messages": [],
    }


def _build_graph(
    store: BaseStore,
    checkpointer: BaseCheckpointSaver[Any],
) -> RootCompiledGraph:
    builder = StateGraph(
        state_schema=RootGraphState,
        context_schema=RootGraphContext,
        input_schema=NewTurnInput,
        output_schema=RootState,
    )
    builder.add_node("load_turn_context", _load_turn_context)
    builder.add_node("plan_dispatch", _plan_dispatch)
    builder.add_node("run_worker", _run_worker)
    builder.add_node("merge_results", _merge_results)
    builder.add_node("plan_followups", _plan_followups)
    builder.add_node("synthesize_direct", _synthesize_direct)
    builder.add_node("synthesize_final", _synthesize_final)
    builder.add_edge(START, "load_turn_context")
    builder.add_edge("load_turn_context", "plan_dispatch")
    builder.add_conditional_edges("plan_dispatch", _dispatch_initial_workers)
    builder.add_edge("run_worker", "merge_results")
    builder.add_edge("merge_results", "plan_followups")
    builder.add_conditional_edges("plan_followups", _dispatch_followup_workers)
    builder.add_edge("synthesize_direct", END)
    builder.add_edge("synthesize_final", END)
    return builder.compile(
        checkpointer=checkpointer,
        store=store,
        name="root_agent",
    )


# Lazy singleton — compiled graph
_root_agent_graph: RootCompiledGraph | None = None


def get_root_agent_graph() -> RootCompiledGraph:
    """Get or create the singleton compiled root StateGraph."""
    global _root_agent_graph
    if _root_agent_graph is None:
        from core.db import get_checkpointer, get_store

        refresh_workers()
        _root_agent_graph = _build_graph(get_store(), get_checkpointer())
    return _root_agent_graph


def refresh_graph() -> None:
    """Invalidate the cached graph (call after plugin discovery changes)."""
    global _root_agent_graph
    _root_agent_graph = None
    refresh_workers()
