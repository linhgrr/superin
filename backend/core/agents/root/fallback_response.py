"""Helpers for root fallback responses when no worker is dispatched."""

from __future__ import annotations

from langchain_core.messages import BaseMessage, SystemMessage

from .context import build_available_catalog, build_history_context, build_routing_catalog
from .prompts import build_root_direct_synthesis_prompt


def build_direct_prompt(
    messages: list[BaseMessage],
    execution_context_block: str,
    memory_block: str,
    installed_app_ids: list[str] | None,
) -> list[BaseMessage]:
    """Build fallback prompt payload for in-scope direct responses."""
    installed_catalog = build_routing_catalog(installed_app_ids or [])
    available_catalog = build_available_catalog(installed_app_ids or [])
    system_prompt = build_root_direct_synthesis_prompt(
        installed_catalog,
        available_catalog,
    )
    return [
        SystemMessage(content=f"{system_prompt}\n\n{execution_context_block}{memory_block}"),
        *build_history_context(messages, limit=10),
    ]
