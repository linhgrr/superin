"""Routing and classification helpers for the root graph."""

from __future__ import annotations

from langchain_core.messages import BaseMessage, SystemMessage
from loguru import logger

from shared.llm import get_llm

from .context import (
    build_available_catalog,
    build_history_context,
    build_routing_catalog,
    extract_question,
)
from .schemas import AppDecision, PlatformDecision, RoutingDecision


async def detect_platform_request(
    messages: list[BaseMessage],
    installed_app_ids: list[str],
) -> PlatformDecision:
    """Detect requests that should be handled by root platform tools."""
    question = extract_question(messages)
    if not question:
        return PlatformDecision()

    history_context = build_history_context(messages)
    installed_catalog = build_routing_catalog(installed_app_ids)
    available_catalog = build_available_catalog(installed_app_ids)

    system_prompt = (
        "You classify whether the user's latest request should be handled by platform-level tools.\n"
        "Return `platform` only for requests about:\n"
        "- installing, uninstalling, enabling, disabling, or browsing apps\n"
        "- asking which apps are installed or available\n"
        "- explicit long-term memory operations like remember/save this about me, what do you remember, forget this memory\n"
        "Return `none` for domain work that should go to installed app agents.\n\n"
        f"<installed_apps>\n{installed_catalog}\n</installed_apps>\n\n"
        f"<available_apps>\n{available_catalog}\n</available_apps>\n\n"
        "Rules:\n"
        "- If the user is asking to DO work inside an installed app (schedule event, add task, budget, etc.), return none.\n"
        "- If the user is managing the platform itself or explicit memory, return platform.\n"
        "- Use recent history to resolve short follow-ups."
    )

    try:
        structured_llm = get_llm().with_structured_output(PlatformDecision)
        response: PlatformDecision = await structured_llm.ainvoke(
            [SystemMessage(content=system_prompt), *history_context],
        )
    except Exception as exc:
        logger.warning("detect_platform_request  llm_error={}  defaulting to none", exc)
        return PlatformDecision()

    return response


async def route_and_craft(
    messages: list[BaseMessage],
    installed_app_ids: list[str],
) -> RoutingDecision:
    """Decide which installed apps to query and craft one subtask per app."""
    if not installed_app_ids:
        return RoutingDecision()

    question = extract_question(messages)
    if not question:
        return RoutingDecision()

    history_context = build_history_context(messages)
    catalog = build_routing_catalog(installed_app_ids)

    system_prompt = (
        "You are a routing supervisor for a multi-app platform.\n"
        "For the user's request below, decide which installed apps are needed\n"
        "AND craft a precise, domain-specific subtask for EACH selected app.\n\n"
        f"Installed apps:\n{catalog}\n\n"
        "Rules:\n"
        "- Only return apps that are genuinely needed to fulfill the request.\n"
        "- For EACH selected app, craft a subtask that:\n"
        "  * Is phrased as a standalone question/instruction the child agent can act on directly\n"
        "  * Contains enough context so the child does NOT need to re-interpret the original user request\n"
        "  * Is specific to that app's domain (e.g. finance -> budget + amount; todo -> task details)\n"
        "- Return an empty list if no installed app is relevant.\n"
        "- Use conversation history to resolve short follow-ups ('thêm cái nữa' -> same app as previous turn)."
    )

    try:
        structured_llm = get_llm().with_structured_output(RoutingDecision)
        response: RoutingDecision = await structured_llm.ainvoke(
            [SystemMessage(content=system_prompt), *history_context],
        )
    except Exception as exc:
        logger.warning("route_and_craft  llm_error={}  defaulting to direct synthesis", exc)
        return RoutingDecision()

    valid_decisions: list[AppDecision] = []
    for decision in response.app_decisions:
        if decision.app_id in installed_app_ids:
            valid_decisions.append(decision)
        else:
            logger.info("route_and_craft  dropped_uninstalled app_id={}", decision.app_id)

    logger.debug(
        "route_and_craft  question={}  decisions={}",
        question[:80],
        [(d.app_id, d.subtask[:60]) for d in valid_decisions],
    )
    return RoutingDecision(app_decisions=valid_decisions)
