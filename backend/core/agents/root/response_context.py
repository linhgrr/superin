"""Shared context builders for root response synthesis."""

from __future__ import annotations

from collections.abc import Sequence

from langchain_core.messages import BaseMessage, HumanMessage

from core.utils.timezone import get_local_now_for_timezone

from .context import build_history_context, message_to_text


def build_execution_context_block(user_tz: str) -> tuple[str, str]:
    """Return execution context text plus the normalized timezone label."""
    normalized_tz, now_local = get_local_now_for_timezone(user_tz)

    block = (
        "<execution_context>\n"
        f"- User timezone: {normalized_tz}\n"
        f"- Current local datetime: {now_local.isoformat()}\n"
        "- If the user asks for the current time, date, day, or other 'right now' temporal facts, answer from this execution context directly.\n"
        "- Do not claim you lack access to the current time when it is provided in the execution context.\n"
        "</execution_context>"
    )
    return block, normalized_tz


def build_conversation_history_block(messages: Sequence[BaseMessage], *, limit: int = 10) -> str:
    """Format recent history for synthesis prompts."""
    lines: list[str] = []
    for message in build_history_context(messages, limit=limit):
        text = message_to_text(message)
        if not text:
            continue

        if isinstance(message, HumanMessage):
            lines.append(f"User: {text}")
        else:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines[-limit:])


def format_memory_block(memory_section: str) -> str:
    """Wrap recalled memory text for prompt inclusion."""
    if not memory_section:
        return ""

    return f"\n<user_memories>\n{memory_section}\n</user_memories>"
