"""Routing and classification helpers for the root graph."""

from __future__ import annotations

from collections.abc import Sequence

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from loguru import logger

from shared.llm import get_llm

from .context import (
    build_dispatch_catalog,
    build_history_context,
    extract_question,
)
from .merged_response import merge_app_results
from .prompts import build_root_dispatch_prompt, build_root_followup_prompt
from .schemas import AppDecision, FollowupDecision, RoutingDecision, WorkerOutcome


def _normalize_decisions(
    decisions: Sequence[AppDecision],
    installed_app_ids: list[str],
    *,
    log_prefix: str,
) -> list[AppDecision]:
    valid_decisions: list[AppDecision] = []
    seen_app_ids: set[str] = set()

    for decision in decisions:
        if not (decision.app_id == "platform" or decision.app_id in installed_app_ids):
            logger.info("{}  dropped_uninstalled app_id={}", log_prefix, decision.app_id)
            continue

        if decision.app_id in seen_app_ids:
            logger.info("{}  dropped_duplicate app_id={}", log_prefix, decision.app_id)
            continue

        seen_app_ids.add(decision.app_id)
        valid_decisions.append(decision)

    return valid_decisions


def _format_followup_context(
    *,
    question: str,
    dispatch_round: int,
    max_rounds: int,
    current_round_outcomes: list[WorkerOutcome],
    all_worker_outcomes: list[WorkerOutcome],
    blocked_app_ids: set[str],
) -> str:
    latest_round_block = merge_app_results(current_round_outcomes) or "(no worker outcomes)"
    all_outcomes_block = merge_app_results(all_worker_outcomes) or "(no worker outcomes)"
    blocked_apps = ", ".join(sorted(blocked_app_ids)) if blocked_app_ids else "(none)"
    structured_lines: list[str] = []
    for outcome in current_round_outcomes:
        structured_lines.append(

                f"- app={outcome['app']} status={outcome['status']} "
                f"followup_useful={outcome.get('followup_useful', False)} "
                f"capability_limit={outcome.get('capability_limit', '') or 'none'} "
                f"followup_hint={outcome.get('followup_hint', '') or '(none)'}"

        )
    structured_block = "\n".join(structured_lines) if structured_lines else "(none)"

    return (
        f"Original user request:\n{question}\n\n"
        f"Current dispatch round: {dispatch_round} of {max_rounds}\n"
        f"Apps blocked for further retries this turn: {blocked_apps}\n\n"
        f"Structured worker signals:\n{structured_block}\n\n"
        f"Latest round outcomes:\n{latest_round_block}\n\n"
        f"All worker outcomes so far:\n{all_outcomes_block}"
    )


async def route_and_craft(
    messages: Sequence[BaseMessage],
    installed_app_ids: list[str],
) -> RoutingDecision:
    """Decide which worker agents to dispatch and craft one subtask per worker."""
    question = extract_question(messages)
    if not question:
        return RoutingDecision()

    history_context = build_history_context(messages)
    catalog = build_dispatch_catalog(installed_app_ids)

    system_prompt = build_root_dispatch_prompt(catalog)

    structured_llm = get_llm().with_structured_output(
        RoutingDecision,
        method="function_calling",
    )
    normalized_response: RoutingDecision = await structured_llm.ainvoke(
        [SystemMessage(content=system_prompt), *history_context],
    )

    valid_decisions = _normalize_decisions(
        normalized_response.app_decisions,
        installed_app_ids,
        log_prefix="route_and_craft",
    )

    logger.debug(
        "route_and_craft  question={}  decisions={}",
        question[:80],
        [(d.app_id, d.subtask[:60]) for d in valid_decisions],
    )
    return RoutingDecision(app_decisions=valid_decisions)


async def plan_followups(
    messages: Sequence[BaseMessage],
    installed_app_ids: list[str],
    *,
    current_round_outcomes: list[WorkerOutcome],
    all_worker_outcomes: list[WorkerOutcome],
    blocked_app_ids: set[str],
    dispatch_round: int,
    max_rounds: int,
) -> FollowupDecision:
    """Decide whether another worker round is warranted."""
    question = extract_question(messages)
    if not question or not current_round_outcomes:
        return FollowupDecision(action="synthesize")

    history_context = build_history_context(messages)
    catalog = build_dispatch_catalog(installed_app_ids)
    system_prompt = build_root_followup_prompt(catalog)
    followup_context = _format_followup_context(
        question=question,
        dispatch_round=dispatch_round,
        max_rounds=max_rounds,
        current_round_outcomes=current_round_outcomes,
        all_worker_outcomes=all_worker_outcomes,
        blocked_app_ids=blocked_app_ids,
    )

    structured_llm = get_llm().with_structured_output(
        FollowupDecision,
        method="function_calling",
    )
    response: FollowupDecision = await structured_llm.ainvoke(
        [
            SystemMessage(content=system_prompt),
            *history_context,
            HumanMessage(content=followup_context),
        ],
    )

    if response.action != "redispatch":
        logger.debug(
            "plan_followups  round={}  action=synthesize  rationale={}",
            dispatch_round,
            response.rationale[:120],
        )
        return FollowupDecision(action="synthesize", rationale=response.rationale)

    valid_decisions = _normalize_decisions(
        response.app_decisions,
        installed_app_ids,
        log_prefix="plan_followups",
    )
    logger.debug(
        "plan_followups  round={}  action=redispatch  rationale={}  decisions={}",
        dispatch_round,
        response.rationale[:120],
        [(d.app_id, d.subtask[:60]) for d in valid_decisions],
    )
    if not valid_decisions:
        return FollowupDecision(action="synthesize", rationale=response.rationale)

    return FollowupDecision(
        action="redispatch",
        rationale=response.rationale,
        app_decisions=valid_decisions,
    )
