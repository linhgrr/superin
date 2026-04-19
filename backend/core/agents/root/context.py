"""Shared context builders for root-agent routing and synthesis."""

from __future__ import annotations

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from loguru import logger


def extract_question(messages: list[BaseMessage]) -> str:
    """Extract the latest user question from the message list."""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return msg.text.strip()
    return ""


def build_history_context(messages: list[BaseMessage], limit: int = 6) -> list[BaseMessage]:
    """Build recent user/assistant history for prompts that need conversation context."""
    recent: list[BaseMessage] = []
    for msg in reversed(messages):
        if len(recent) >= limit:
            break
        if isinstance(msg, (HumanMessage, AIMessage)):
            recent.append(msg)
    return list(reversed(recent))


def build_routing_catalog(installed_app_ids: list[str]) -> str:
    """Build a routing catalog string using each installed app's description."""
    from core.registry import PLUGIN_REGISTRY

    lines: list[str] = []
    for aid in installed_app_ids:
        plugin = PLUGIN_REGISTRY.get(aid)
        if plugin is None:
            logger.warning("routing_catalog  app_id={} not in PLUGIN_REGISTRY — skipped", aid)
            continue
        manifest = plugin.get("manifest")
        lines.append(f"- `{aid}`: {manifest.agent_description}")
    return "\n".join(lines) if lines else "(no apps installed)"


def build_available_catalog(installed_app_ids: list[str]) -> str:
    """Build a catalog string for apps available in the system but not installed."""
    from core.registry import PLUGIN_REGISTRY

    installed = set(installed_app_ids)
    lines: list[str] = []
    for app_id, plugin in sorted(PLUGIN_REGISTRY.items()):
        if app_id in installed:
            continue
        manifest = plugin.get("manifest")
        lines.append(f"- `{app_id}`: {manifest.agent_description}")
    return "\n".join(lines) if lines else "(no additional apps available)"
