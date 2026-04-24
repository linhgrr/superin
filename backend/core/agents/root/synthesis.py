"""Synthesis helpers for the root graph."""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from langchain_core.messages import BaseMessage
from loguru import logger

from shared.llm import get_llm

from .context import extract_question
from .fallback_response import build_direct_prompt
from .merged_response import build_merged_prompt
from .response_context import build_execution_context_block, format_memory_block
from .schemas import RootGraphEvent

if TYPE_CHECKING:
    from langgraph.store.base import BaseStore


async def _recall_memory_block(
    store: BaseStore | None,
    user_id: str,
    question: str,
) -> str:
    if store is None:
        return ""

    from .memory import recall_memories_for_context

    memory_section = await recall_memories_for_context(store, user_id, query=question)
    return format_memory_block(memory_section)


async def synthesize(
    messages: list[BaseMessage],
    writer: Callable[[RootGraphEvent], None],
    user_id: str,
    store: BaseStore | None = None,
    *,
    user_tz: str = "UTC",
    installed_app_ids: list[str] | None = None,
    merged_context: str = "",
) -> str:
    """Unified synthesizer for both app-result mode and direct mode."""
    question = extract_question(messages)
    execution_context_block, _ = build_execution_context_block(user_tz)
    memory_block = await _recall_memory_block(store, user_id, question)

    if merged_context:
        prompt_for_stream: str | list[BaseMessage] = build_merged_prompt(
            messages=messages,
            merged_context=merged_context,
            execution_context_block=execution_context_block,
            memory_block=memory_block,
        )
    else:
        if not question:
            return "Hello! How can I help you today?"

        prompt_for_stream = build_direct_prompt(
            messages=messages,
            execution_context_block=execution_context_block,
            memory_block=memory_block,
            installed_app_ids=installed_app_ids,
        )

    tokens: list[str] = []
    try:
        async for chunk in get_llm().astream(prompt_for_stream):
            content = getattr(chunk, "content", "") or ""
            if content:
                tokens.append(content)
                writer({"type": "token", "content": content})
    except Exception as exc:
        logger.error("synthesize failed: {}", exc)
        if not tokens:
            fallback = (
                "I ran into a response-generation error, but I can still continue from the "
                "results already gathered. Please try again if you need a fuller summary."
                if merged_context
                else "I ran into a response-generation error. Please try again."
            )
            tokens.append(fallback)
            writer({"type": "token", "content": fallback})

    return "".join(tokens)
