"""Synthesis helpers for the root graph."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from zoneinfo import ZoneInfo

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from loguru import logger

from shared.llm import get_llm

from .context import (
    build_available_catalog,
    build_history_context,
    build_routing_catalog,
    extract_question,
)

if TYPE_CHECKING:
    from langgraph.store.base import BaseStore


def merge_app_results(results: list[dict[str, Any]]) -> str:
    """Format app results into a merged context string for the synthesizer."""
    if not results:
        return ""

    parts = []
    for result in results:
        app_name = result.get("app", "?")
        status = result.get("status", "?")
        subtask = result.get("subtask", "")
        message = result.get("message", "")
        tool_results = result.get("tool_results", [])

        section = f"[{app_name}] (task: {subtask[:80]})\n[status: {status}]\n{message}"
        if tool_results:
            section += "\n---"
            for tool_result in tool_results:
                if tool_result.get("ok", False):
                    section += f"\n  - {tool_result.get('tool_name', '?')}: OK"
                else:
                    error = tool_result.get("error")
                    error_message = error.get("message") if isinstance(error, dict) else str(error)
                    section += f"\n  - {tool_result.get('tool_name', '?')}: ERROR — {error_message}"

        parts.append(section)

    return "\n\n".join(parts)


async def synthesize(
    messages: list[BaseMessage],
    writer: Callable[[Any], None],
    user_id: str,
    store: BaseStore | None = None,
    *,
    user_tz: str = "UTC",
    installed_app_ids: list[str] | None = None,
    merged_context: str = "",
) -> str:
    """Unified synthesizer for both app-result mode and direct mode."""
    question = extract_question(messages)
    try:
        now_local = datetime.now(UTC).astimezone(ZoneInfo(user_tz))
    except Exception:
        user_tz = "UTC"
        now_local = datetime.now(UTC)

    execution_context_block = (
        "<execution_context>\n"
        f"- User timezone: {user_tz}\n"
        f"- Current local datetime: {now_local.isoformat()}\n"
        "- If the user asks for the current time, date, day, or other 'right now' temporal facts, answer from this execution context directly.\n"
        "- Do not claim you lack access to the current time when it is provided in the execution context.\n"
        "</execution_context>"
    )
    memory_section = ""
    if store is not None:
        from .memory import recall_memories_for_context

        memory_section = await recall_memories_for_context(store, user_id, query=question)

    memory_block = f"\n<user_memories>\n{memory_section}\n</user_memories>" if memory_section else ""

    if merged_context:
        system_prompt = (
            "You are Rin-chan, an AI assistant in the Superin platform.\n"
            "You have access to results from one or more app agents.\n"
            "Synthesize a clear, helpful response that:\n"
            "1. Draws from the app results provided below\n"
            "2. Is conversational and friendly\n"
            "3. Highlights key information from each app's response\n"
            "4. Does NOT mention that you 'received results from tools' or similar phrases\n"
            "5. If multiple apps provided results, acknowledge and combine them naturally"
        )
        merged_section = f"<app_results>\n{merged_context}\n</app_results>"

        history_lines: list[str] = []
        for message in build_history_context(messages, limit=10):
            text = message.text.strip()
            if not text:
                continue

            if isinstance(message, HumanMessage):
                history_lines.append(f"User: {text}")
            else:
                history_lines.append(f"Assistant: {text}")

        history = "\n".join(history_lines[-10:])
        prompt_for_stream: str | list[BaseMessage] = (
            f"{system_prompt}\n\n"
            f"{execution_context_block}\n\n"
            f"<conversation_history>\n{history}\n</conversation_history>\n\n"
            f"{merged_section}"
            f"{memory_block}"
        )
    else:
        if not question:
            return "Hello! How can I help you today?"

        installed_catalog = build_routing_catalog(installed_app_ids or [])
        available_catalog = build_available_catalog(installed_app_ids or [])
        system_prompt = (
            "You are Rin-chan, an AI assistant in the Superin platform.\n"
            "Respond helpfully and conversationally to the user's message.\n"
            "Use the recent conversation history to resolve follow-up questions and references.\n"
            "You are given execution context that includes the user's timezone and current local datetime.\n"
            "If the user asks what time/date/day it is right now, answer directly from that execution context.\n"
            "Do not say that you cannot access the current time when the execution context provides it.\n"
            "You know which apps are already installed for this user and which apps are available in the system.\n"
            "If the request maps to an installed app, guide the user using that installed app.\n"
            "If the request maps to an available but not-installed app, say clearly that it is not installed yet\n"
            "and suggest installing it by exact app name/id.\n"
            "Do not invent apps or capabilities.\n\n"
            f"<installed_apps>\n{installed_catalog}\n</installed_apps>\n\n"
            f"<available_apps>\n{available_catalog}\n</available_apps>"
        )
        prompt_for_stream = [
            SystemMessage(content=f"{system_prompt}\n\n{execution_context_block}{memory_block}"),
            *build_history_context(messages, limit=10),
        ]

    tokens: list[str] = []
    try:
        async for chunk in get_llm().astream(prompt_for_stream):
            content = getattr(chunk, "content", "") or ""
            if content:
                tokens.append(content)
                writer({"type": "token", "content": content})
    except Exception as exc:
        logger.error("synthesize failed: {}", exc)
        tokens.append(f"[Synthesis error: {exc}]")

    return "".join(tokens)
