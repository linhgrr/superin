"""Parallel root agent built on StateGraph + Send."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Sequence
from typing import TYPE_CHECKING, Any, Literal, TypeAlias

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.config import get_config, get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.runtime import Runtime
from langgraph.types import Send
from loguru import logger

from core.chat.service import set_thread_pending_question
from core.config import settings
from core.models import PendingQuestion

from .merged_response import merge_app_results
from .routing import route_and_craft
from .runtime_context import RootGraphContext
from .schemas import (
    NewTurnInput,
    RootGraphState,
    RootState,
    SupervisorDecision,
    SupervisorFollowup,
    ThinkingStatus,
    WorkerDispatch,
    WorkerOutcome,
)
from .synthesis import synthesize
from .workers import get_worker_runner, refresh_workers

if TYPE_CHECKING:
    from langgraph.store.base import BaseStore


RootCompiledGraph: TypeAlias = CompiledStateGraph[
    RootGraphState,
    RootGraphContext,
    NewTurnInput,
    RootState,
]


def normalize_subtask(value: str) -> str:
    return " ".join(value.lower().split())


def dispatch_fingerprint(app_id: str, subtask: str) -> str:
    return f"{app_id}::{normalize_subtask(subtask)}"


def evidence_fingerprint(outcome: WorkerOutcome) -> str:
    tool_results = outcome.get("tool_results", [])
    if tool_results:
        parts = []
        for result in tool_results:
            data = result.get("data")
            if isinstance(data, dict):
                shape = ",".join(sorted(data.keys()))
            elif isinstance(data, list):
                shape = f"list:{len(data)}"
            elif data is None:
                shape = "none"
            else:
                shape = type(data).__name__
            parts.append(f"{result.get('tool_name')}:{result.get('ok')}:{shape}")
        return "|".join(parts)
    return (
        f"{outcome.get('answer_state')}:{outcome.get('stop_reason')}:"
        f"{outcome.get('message', '')[:120]}"
    )


def _build_final_ai_message(answer: str, runtime: Runtime[RootGraphContext]) -> AIMessage:
    return AIMessage(content=answer, id=runtime.context.assistant_message_id)


async def _synthesize_answer(
    messages: list[BaseMessage],
    runtime: Runtime[RootGraphContext],
    *,
    merged_context: str,
) -> str:
    return await synthesize(
        messages=messages,
        writer=get_stream_writer(),
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


def _emit_done_once(state: RootGraphState, answer: str) -> bool:
    if state.get("done_emitted"):
        logger.error("ROOT_DONE_ALREADY_EMITTED")
        return True
    get_stream_writer()({"type": "done", "content": answer})
    return True


def _stream_text(answer: str) -> None:
    if answer:
        get_stream_writer()({"type": "token", "content": answer})


def _build_synthesis_context(worker_outcomes: list[WorkerOutcome]) -> str:
    return merge_app_results(worker_outcomes)


def _count_failed_outcomes(worker_outcomes: list[WorkerOutcome]) -> int:
    return sum(1 for outcome in worker_outcomes if outcome["status"] == "failed")


def _dispatches_from_followups(followups: Sequence[SupervisorFollowup]) -> list[WorkerDispatch]:
    return [{"app_id": item.app_id, "subtask": item.subtask} for item in followups]


def _build_worker_sends(state: RootGraphState) -> list[Send]:
    sends: list[Send] = []
    for dispatch in state.get("dispatches", []):
        if get_worker_runner(dispatch["app_id"]) is None:
            logger.warning("PARALLEL_ROOT_SKIP  app_id={} not in worker registry", dispatch["app_id"])
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


def _count_attempts_for_app(history: list[WorkerDispatch], app_id: str) -> int:
    return sum(1 for item in history if item["app_id"] == app_id)


def _remaining_turn_seconds(runtime: Runtime[RootGraphContext]) -> float:
    return max(0.0, runtime.context.deadline_monotonic - time.monotonic())


def _build_worker_config(
    *,
    config: RunnableConfig,
    runtime: Runtime[RootGraphContext],
    app_id: str,
    round_index: int,
    attempt_index: int,
) -> RunnableConfig:
    return {
        **config,
        "configurable": {
            **dict(config.get("configurable") or {}),
            "parent_thread_id": runtime.context.thread_id,
            "turn_id": runtime.context.turn_id,
            "round_index": round_index,
            "attempt_index": attempt_index,
            "app_id": app_id,
        },
        "metadata": {
            **dict(config.get("metadata") or {}),
            "turn_id": runtime.context.turn_id,
            "dispatch_round": round_index,
            "attempt_index": attempt_index,
            "app_id": app_id,
        },
        "run_name": f"worker:{app_id}:r{round_index}:a{attempt_index}",
    }


def _finish_decision(
    *,
    stop_reason: str,
    rationale: str,
) -> SupervisorDecision:
    return SupervisorDecision(
        action="finish",
        rationale=rationale,
        stop_reason=stop_reason,
    )


def _build_terminal_state(
    *,
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
    answer: str,
) -> RootGraphState:
    return {
        "messages": [_build_final_ai_message(answer, runtime)],
        "new_messages": [],
        "done_emitted": _emit_done_once(state, answer),
    }


def _round_has_useful_new_evidence(state: RootGraphState) -> bool:
    current_round = state.get("current_round_outcomes", [])
    if not current_round:
        return False

    all_outcomes = state.get("worker_outcomes", [])
    turn_start = state.get("turn_worker_start_index", 0)
    current_count = len(current_round)
    turn_outcomes = all_outcomes[turn_start:]
    previous_outcomes = turn_outcomes[:-current_count] if current_count <= len(turn_outcomes) else []
    previous_fingerprints = {evidence_fingerprint(outcome) for outcome in previous_outcomes}
    return any(evidence_fingerprint(outcome) not in previous_fingerprints for outcome in current_round)


def _build_pending_question(decision: SupervisorDecision, state: RootGraphState) -> PendingQuestion:
    app_ids = []
    for outcome in state.get("current_round_outcomes", []):
        if outcome["status"] == "awaiting_confirmation":
            app_ids.append(outcome["app"])
    return PendingQuestion(
        round=state.get("dispatch_round", 1),
        app_ids_in_scope=sorted(set(app_ids)),
        missing_information=decision.missing_information,
    )


def _build_user_question(outcomes: list[WorkerOutcome]) -> tuple[str, list[str]]:
    missing_information: list[str] = []
    for outcome in outcomes:
        if outcome["status"] != "awaiting_confirmation":
            continue
        missing_information.extend(outcome.get("missing_information", []))
        message = outcome.get("message", "").strip()
        if message:
            return message, missing_information

    if missing_information:
        joined = ", ".join(dict.fromkeys(item for item in missing_information if item))
        return f"I need a bit more information before I continue: {joined}.", missing_information

    return "I need a bit more information before I continue.", missing_information


def _build_followup_candidates(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> tuple[list[SupervisorFollowup], str]:
    history = state.get("dispatch_history", [])
    used_fingerprints = {item["fingerprint"] for item in history if item.get("fingerprint")}
    current_round = state.get("current_round_outcomes", [])
    total_workers = len(history)
    followups: list[SupervisorFollowup] = []

    if total_workers >= settings.root_agent_max_total_workers_per_turn:
        return [], "max_workers"
    if _remaining_turn_seconds(runtime) <= 0:
        return [], "time_budget"

    for outcome in current_round:
        if not outcome.get("followup_useful"):
            continue
        if outcome.get("contained_mutation"):
            continue
        if outcome.get("capability_limit"):
            continue

        followup_hint = outcome.get("followup_hint", "").strip()
        if not followup_hint:
            continue

        app_id = outcome["app"]
        if _count_attempts_for_app(history, app_id) >= settings.root_agent_max_app_attempts_per_turn:
            continue

        fingerprint = dispatch_fingerprint(app_id, followup_hint)
        if fingerprint in used_fingerprints:
            continue

        missing_question = ", ".join(outcome.get("missing_information", []))
        expected_new_evidence = outcome.get("evidence_summary", "") or outcome.get("message", "")
        followups.append(
            SupervisorFollowup(
                app_id=app_id,
                subtask=followup_hint,
                missing_question=missing_question,
                expected_new_evidence=expected_new_evidence[:200],
            )
        )

    if followups:
        return followups, "follow_up"
    return [], "invalid_followup"


async def _load_turn_context(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    _log_turn_start(state, runtime)
    _emit_thinking("routing", "Understanding your request", "active")
    return {
        "messages": state.get("new_messages", []),
        "dispatches": [],
        "current_round_outcomes": [],
        "merged_context": "",
        "dispatch_round": 0,
        "turn_worker_start_index": len(state.get("worker_outcomes", [])),
        "round_start_worker_index": len(state.get("worker_outcomes", [])),
        "dispatch_history": [],
        "started_at_monotonic": time.monotonic(),
        "done_emitted": False,
    }


async def _plan_dispatch(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    messages = state.get("messages", [])
    try:
        decision = await route_and_craft(
            messages,
            runtime.context.installed_app_ids,
            pending_question=runtime.context.pending_question,
        )
    except Exception as exc:
        logger.warning(
            "PARALLEL_ROOT_ROUTING_FAILED  user={}  error={}  -> direct synthesize",
            runtime.context.user_id,
            exc,
        )
        return {"dispatches": []}

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
    else:
        _emit_thinking("routing", "No app lookup needed for this reply", "done")

    logger.info(
        "PARALLEL_ROOT_DISPATCH  user={}  decisions={}",
        runtime.context.user_id,
        [(item["app_id"], item["subtask"][:60]) for item in dispatches],
    )
    return {"dispatches": dispatches}


async def _prepare_round(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    dispatches = state.get("dispatches", [])
    history = list(state.get("dispatch_history", []))
    round_index = state.get("dispatch_round", 0) + 1
    prepared: list[WorkerDispatch] = []

    for dispatch in dispatches:
        app_id = dispatch["app_id"]
        subtask = dispatch["subtask"]
        fingerprint = dispatch_fingerprint(app_id, subtask)
        attempt_index = _count_attempts_for_app(history, app_id) + 1
        prepared_dispatch: WorkerDispatch = {
            "app_id": app_id,
            "subtask": subtask,
            "round_index": round_index,
            "attempt_index": attempt_index,
            "fingerprint": fingerprint,
        }
        prepared.append(prepared_dispatch)
        history.append(prepared_dispatch)

    return {
        "dispatch_round": round_index,
        "dispatches": prepared,
        "dispatch_history": history,
        "current_round_outcomes": [],
        "round_start_worker_index": len(state.get("worker_outcomes", [])),
    }


def _route_dispatches(
    state: RootGraphState,
) -> Sequence[Send] | Literal["synthesize_direct", "synthesize_final"]:
    sends = _build_worker_sends(state)
    if sends:
        return sends
    if state.get("worker_outcomes"):
        return "synthesize_final"
    return "synthesize_direct"


async def _run_worker(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    dispatch = state["dispatch"]
    app_id = dispatch["app_id"]
    subtask = dispatch["subtask"]
    round_index = dispatch.get("round_index", state.get("dispatch_round", 1))
    attempt_index = dispatch.get("attempt_index", 1)
    runner = get_worker_runner(app_id)
    config = get_config()
    worker_config = _build_worker_config(
        config=config,
        runtime=runtime,
        app_id=app_id,
        round_index=round_index,
        attempt_index=attempt_index,
    )
    worker_name = _humanize_worker_name(app_id)
    step_id = f"worker:{app_id}:r{round_index}:a{attempt_index}"

    _emit_thinking(step_id, f"Checking {worker_name}", "active")

    if runner is None:
        outcome = _failed_worker_dict(app_id, subtask, "Worker not registered")
    else:
        remaining_turn_seconds = _remaining_turn_seconds(runtime)
        if remaining_turn_seconds <= 0:
            outcome = _failed_worker_dict(app_id, subtask, "Turn exceeded time budget")
            outcome["failure_kind"] = "time_budget"
            outcome["stop_reason"] = "time_budget"
            outcome["retryable"] = False
        else:
            timeout_seconds = min(settings.root_agent_per_worker_timeout_seconds, remaining_turn_seconds)
            try:
                async with runtime.context.worker_semaphore:
                    outcome = await asyncio.wait_for(
                        runner(
                            subtask,
                            runtime.context.user_id,
                            runtime.context.thread_id,
                            worker_config,
                        ),
                        timeout=timeout_seconds,
                    )
            except TimeoutError:
                logger.error(
                    "PARALLEL_ROOT_TIMEOUT  user={}  app={}  exceeded {:.2f}s",
                    runtime.context.user_id,
                    app_id,
                    timeout_seconds,
                )
                outcome = _failed_worker_dict(
                    app_id,
                    subtask,
                    f"Turn timed out after {timeout_seconds:.2f}s",
                )
                outcome["failure_kind"] = "time_budget"
                outcome["stop_reason"] = "time_budget"
            except Exception as exc:
                logger.error("worker_failed  app={}  error={}", app_id, exc)
                outcome = _failed_worker_dict(app_id, subtask, str(exc))

    if outcome["status"] == "failed":
        _emit_thinking(step_id, f"Finished {worker_name} with an issue", "done")
    else:
        _emit_thinking(step_id, f"Finished checking {worker_name}", "done")

    return {"worker_outcomes": [outcome]}


async def _merge_results(state: RootGraphState) -> RootGraphState:
    start_index = state.get("round_start_worker_index", 0)
    turn_start = state.get("turn_worker_start_index", 0)
    worker_outcomes = state.get("worker_outcomes", [])
    current_round_outcomes = worker_outcomes[start_index:]
    merged = _build_synthesis_context(worker_outcomes[turn_start:])
    return {
        "current_round_outcomes": current_round_outcomes,
        "merged_context": merged,
    }


async def _supervisor_decide(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    round_index = state.get("dispatch_round", 1)
    _emit_thinking(f"supervisor:r{round_index}", "Reviewing the gathered evidence", "active")

    current_round = state.get("current_round_outcomes", [])
    waiting_for_user = [outcome for outcome in current_round if outcome["status"] == "awaiting_confirmation"]
    if waiting_for_user:
        user_question, missing_information = _build_user_question(waiting_for_user)
        decision = SupervisorDecision(
            action="ask_user",
            rationale="A child agent needs specific user input before continuing.",
            stop_reason="needs_user_input",
            user_question=user_question,
            missing_information=missing_information,
        )
        _emit_thinking("ask_user", "Waiting for your answer", "done")
        _emit_thinking(f"supervisor:r{round_index}", "Need clarification from you", "done")
        return {"supervisor_decision": decision, "stop_reason": "needs_user_input"}

    if not _round_has_useful_new_evidence(state):
        decision = _finish_decision(
            stop_reason="no_new_evidence",
            rationale="Latest round did not add materially new evidence.",
        )
        _emit_thinking(f"supervisor:r{round_index}", "Stopping after no new evidence", "done")
        return {"supervisor_decision": decision, "stop_reason": "no_new_evidence"}

    if state.get("dispatch_round", 1) >= settings.root_agent_max_dispatch_rounds:
        decision = _finish_decision(
            stop_reason="max_rounds",
            rationale="Reached the max dispatch rounds for this turn.",
        )
        _emit_thinking(f"supervisor:r{round_index}", "Stopping at round limit", "done")
        return {"supervisor_decision": decision, "stop_reason": "max_rounds"}

    if _remaining_turn_seconds(runtime) <= 0:
        decision = _finish_decision(
            stop_reason="time_budget",
            rationale="Turn exceeded the wall-clock budget.",
        )
        _emit_thinking(f"supervisor:r{round_index}", "Stopping at time budget", "done")
        return {"supervisor_decision": decision, "stop_reason": "time_budget"}

    followups, reason = _build_followup_candidates(state, runtime)
    if followups:
        decision = SupervisorDecision(
            action="follow_up",
            rationale="A narrower follow-up could add new evidence.",
            stop_reason="follow_up",
            followups=followups,
        )
        _emit_thinking(f"supervisor:r{round_index}", "Running one more targeted check", "done")
        return {
            "supervisor_decision": decision,
            "dispatches": _dispatches_from_followups(followups),
            "stop_reason": "follow_up",
        }

    decision = _finish_decision(
        stop_reason=reason,
        rationale="No valid follow-up remained after deterministic guardrails.",
    )
    _emit_thinking(f"supervisor:r{round_index}", "Enough evidence to reply", "done")
    return {"supervisor_decision": decision, "stop_reason": reason}


def _route_after_supervisor(
    state: RootGraphState,
) -> Literal["prepare_followups", "synthesize_final", "synthesize_user_question"]:
    decision = state["supervisor_decision"]
    if decision.action == "follow_up":
        return "prepare_followups"
    if decision.action == "ask_user":
        return "synthesize_user_question"
    return "synthesize_final"


async def _prepare_followups(state: RootGraphState) -> RootGraphState:
    decision = state["supervisor_decision"]
    return {"dispatches": _dispatches_from_followups(decision.followups)}


async def _synthesize_direct(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    _emit_thinking("synthesis", "Drafting the reply", "active")
    answer = await _synthesize_answer(state.get("messages", []), runtime, merged_context="")
    await set_thread_pending_question(runtime.context.user_id, runtime.context.thread_id, None)
    return _build_terminal_state(state=state, runtime=runtime, answer=answer)


async def _synthesize_final(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    turn_start = state.get("turn_worker_start_index", 0)
    worker_outcomes = state.get("worker_outcomes", [])[turn_start:]
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

    await set_thread_pending_question(runtime.context.user_id, runtime.context.thread_id, None)
    return _build_terminal_state(state=state, runtime=runtime, answer=answer)


async def _synthesize_user_question(
    state: RootGraphState,
    runtime: Runtime[RootGraphContext],
) -> RootGraphState:
    decision = state["supervisor_decision"]
    answer = decision.user_question.strip() or "I need a bit more information before I continue."
    _stream_text(answer)
    await set_thread_pending_question(
        runtime.context.user_id,
        runtime.context.thread_id,
        _build_pending_question(decision, state),
    )
    return _build_terminal_state(state=state, runtime=runtime, answer=answer)


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
    builder.add_node("prepare_round", _prepare_round)
    builder.add_node("run_worker", _run_worker)
    builder.add_node("merge_results", _merge_results)
    builder.add_node("supervisor_decide", _supervisor_decide)
    builder.add_node("prepare_followups", _prepare_followups)
    builder.add_node("synthesize_direct", _synthesize_direct)
    builder.add_node("synthesize_final", _synthesize_final)
    builder.add_node("synthesize_user_question", _synthesize_user_question)

    builder.add_edge(START, "load_turn_context")
    builder.add_edge("load_turn_context", "plan_dispatch")
    builder.add_edge("plan_dispatch", "prepare_round")
    builder.add_conditional_edges("prepare_round", _route_dispatches)
    builder.add_edge("run_worker", "merge_results")
    builder.add_edge("merge_results", "supervisor_decide")
    builder.add_conditional_edges("supervisor_decide", _route_after_supervisor)
    builder.add_edge("prepare_followups", "prepare_round")
    builder.add_edge("synthesize_direct", END)
    builder.add_edge("synthesize_final", END)
    builder.add_edge("synthesize_user_question", END)

    return builder.compile(
        checkpointer=checkpointer,
        store=store,
        name="root_agent",
    )


_root_agent_graph: RootCompiledGraph | None = None


def get_root_agent_graph() -> RootCompiledGraph:
    global _root_agent_graph
    if _root_agent_graph is None:
        from core.db import get_checkpointer, get_store

        refresh_workers()
        _root_agent_graph = _build_graph(get_store(), get_checkpointer())
    return _root_agent_graph


def refresh_graph() -> None:
    global _root_agent_graph
    _root_agent_graph = None
    refresh_workers()
