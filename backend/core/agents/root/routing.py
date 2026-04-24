"""Routing and classification helpers for the root graph."""

from __future__ import annotations

from collections.abc import Sequence

from langchain_core.messages import BaseMessage, SystemMessage
from loguru import logger

from core.models import PendingQuestion
from shared.llm import get_llm

from .context import (
    build_dispatch_catalog,
    build_history_context,
    extract_question,
)
from .prompts import build_root_dispatch_prompt
from .schemas import AppDecision, RoutingDecision


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


async def route_and_craft(
    messages: Sequence[BaseMessage],
    installed_app_ids: list[str],
    *,
    pending_question: PendingQuestion | None = None,
) -> RoutingDecision:
    """Decide which worker agents to dispatch and craft one subtask per worker."""
    question = extract_question(messages)
    if not question:
        return RoutingDecision()

    history_context = build_history_context(messages)
    catalog = build_dispatch_catalog(installed_app_ids)

    system_prompt = build_root_dispatch_prompt(catalog)
    if pending_question is not None:
        system_prompt += (
            "\n\n<resume_context>\n"
            f"- The previous assistant turn was waiting for clarification in round {pending_question.round}.\n"
            f"- Apps already in scope: {', '.join(pending_question.app_ids_in_scope) or '(none)'}.\n"
            f"- Missing information being clarified: {', '.join(pending_question.missing_information) or '(none)'}.\n"
            "- Treat the latest user message as a continuation of that clarification, not a cold restart.\n"
            "</resume_context>"
        )

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
