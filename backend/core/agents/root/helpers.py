"""Helper functions for the parallel root graph."""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from loguru import logger

from shared.llm import get_llm

from .schemas import RoutingDecision

if TYPE_CHECKING:
    from langgraph.store.base import BaseStore


def extract_question(messages: list[BaseMessage]) -> str:
    """Extract the latest user question from the message list."""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return msg.text().strip()
    return ""


async def decide_target_apps(
    messages: list[BaseMessage],
    installed_app_ids: list[str],
) -> tuple[list[str], str]:
    """Decide which apps to query based on the user message.

    Returns (target_app_ids, question).  question is the extracted user text
    so callers don't need to call extract_question again.
    """
    if not installed_app_ids:
        return ([], "")

    question = extract_question(messages)
    if not question:
        return ([], "")

    apps_catalog = ", ".join(f"`{aid}`" for aid in installed_app_ids)
    system_prompt = (
        "You are a routing assistant. Given a user message, decide which installed "
        "apps are relevant to answer or fulfill the request.\n"
        f"Installed apps: {apps_catalog}\n"
        "Return a JSON array of app_ids to query. "
        "Return an empty array [] if no app is relevant. "
        "Be specific — only include apps that are actually needed for this request."
    )

    try:
        structured_llm = get_llm().with_structured_output(RoutingDecision)
        response = await structured_llm.ainvoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"User message: {question}"),
            ]
        )
        # Validate app IDs are actually installed
        valid = [a for a in response.app_ids if a in installed_app_ids]
        logger.debug(
            "decide_target_apps  question={}  decided={}  valid={}",
            question[:60],
            response.app_ids,
            valid,
        )
        return (valid, question)
    except Exception as exc:
        logger.warning("decide_target_apps failed, defaulting to []: %s", exc)
        return ([], "")


def merge_app_results(results: list[dict[str, Any]]) -> str:
    """Format app results into a merged context string for the synthesizer."""
    if not results:
        return ""

    parts = []
    for r in results:
        app_name = r.get("app", "?")
        status = r.get("status", "?")
        message = r.get("message", "")
        tool_results = r.get("tool_results", [])

        section = f"[{app_name}] (status: {status})\n{message}"
        if tool_results:
            section += "\n---"
            for tr in tool_results:
                tr_ok = tr.get("ok", False)
                tr_name = tr.get("tool_name", "?")
                tr_err = tr.get("error")
                if tr_ok:
                    section += f"\n  - {tr_name}: OK"
                else:
                    err_msg = tr_err.get("message") if isinstance(tr_err, dict) else str(tr_err)
                    section += f"\n  - {tr_name}: ERROR — {err_msg}"

        parts.append(section)

    return "\n\n".join(parts)


async def synthesize(
    messages: list[BaseMessage],
    writer: Callable[[Any], None],
    user_id: str,
    store: BaseStore | None = None,
    *,
    merged_context: str = "",
) -> str:
    """Unified synthesizer — handles both app-result and direct synthesis modes.

    When merged_context is non-empty, the LLM draws from app results (app mode).
    When merged_context is empty, it responds directly to the user's message.
    """
    memory_section = ""
    if store is not None:
        from .memory import recall_memories_for_context

        memory_section = await recall_memories_for_context(store, user_id)

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

        history_lines = []
        for msg in messages:
            if isinstance(msg, HumanMessage):
                text = msg.text().strip()
                if text:
                    history_lines.append(f"User: {text}")

        history = "\n".join(history_lines[-10:])
        full_prompt = (
            f"{system_prompt}\n\n"
            f"<conversation_history>\n{history}\n</conversation_history>\n\n"
            f"{merged_section}"
            f"{memory_block}"
        )
        prompt_for_stream: str | list = full_prompt
    else:
        question = extract_question(messages)
        if not question:
            return "Hello! How can I help you today?"
        system_prompt = (
            "You are Rin-chan, an AI assistant in the Superin platform.\n"
            "Respond helpfully and conversationally to the user's message.\n"
            "If the user needs app-specific features, suggest relevant apps from the catalog."
        )
        prompt_for_stream = [
            SystemMessage(content=f"{system_prompt}{memory_block}\n\nUser: {question}"),
            HumanMessage(content=question),
        ]

    tokens: list[str] = []
    try:
        async for chunk in get_llm().astream(prompt_for_stream):
            content = getattr(chunk, "content", "") or ""
            if content:
                tokens.append(content)
                writer({"type": "token", "content": content})
    except Exception as exc:
        logger.error("synthesize failed: %s", exc)
        tokens.append(f"[Synthesis error: {exc}]")

    return "".join(tokens)


# ── Convenience wrappers ────────────────────────────────────────────────────────


async def synthesize_with_streaming(
    messages: list[BaseMessage],
    merged_context: str,
    writer: Callable[[Any], None],
    user_id: str,
    store: BaseStore | None = None,
) -> str:
    """Synthesize a final answer from merged app results, streaming tokens to frontend."""
    return await synthesize(
        messages, writer, user_id, store, merged_context=merged_context
    )


async def direct_synthesize(
    messages: list[BaseMessage],
    writer: Callable[[Any], None],
    user_id: str,
    store: BaseStore | None = None,
) -> str:
    """Synthesize a direct answer when no app delegation is needed."""
    return await synthesize(messages, writer, user_id, store)
