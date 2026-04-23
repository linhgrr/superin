"""Shared context builders for root-agent routing and synthesis."""

from __future__ import annotations

from collections.abc import Sequence

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from loguru import logger


def message_to_text(message: BaseMessage) -> str:
    """Extract plain text from a LangChain message content payload."""
    content = message.content
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        text_parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                text_parts.append(part)
            elif isinstance(part, dict):
                text = part.get("text")
                if isinstance(text, str):
                    text_parts.append(text)
        return " ".join(part.strip() for part in text_parts if part.strip())
    return ""


def extract_question(messages: Sequence[BaseMessage]) -> str:
    """Extract the latest user question from the message list."""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return message_to_text(msg)
    return ""


def build_history_context(messages: Sequence[BaseMessage], limit: int = 6) -> list[BaseMessage]:
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
        if manifest is None:
            logger.warning("routing_catalog  app_id={} missing manifest — skipped", aid)
            continue
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
        if manifest is None:
            logger.warning("available_catalog  app_id={} missing manifest — skipped", app_id)
            continue
        lines.append(f"- `{app_id}`: {manifest.agent_description}")
    return "\n".join(lines) if lines else "(no additional apps available)"


def build_dispatch_catalog(installed_app_ids: list[str]) -> str:
    """Build the full worker catalog the root dispatcher can target this turn."""
    installed_catalog = build_routing_catalog(installed_app_ids)
    available_catalog = build_available_catalog(installed_app_ids)
    return (
        "<always_available_workers>\n"
        "- `platform`: install/uninstall apps, inspect installed/available apps, handle long-term memory actions, and proactively store durable user context worth remembering.\n"
        "</always_available_workers>\n\n"
        f"<installed_app_workers>\n{installed_catalog}\n</installed_app_workers>\n\n"
        f"<not_installed_apps>\n{available_catalog}\n</not_installed_apps>"
    )
