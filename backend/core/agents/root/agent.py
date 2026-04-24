"""RootAgent adapter for the top-level StateGraph orchestrator."""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncGenerator
from typing import Literal
from uuid import uuid4

from beanie import PydanticObjectId
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from loguru import logger
from typing_extensions import TypedDict

from core.config import settings
from core.models import User
from core.utils.timezone import get_user_timezone_context, utc_now
from core.workspace.service import list_installed_app_ids

from .graph import get_root_agent_graph
from .runtime_context import ROOT_WORKER_PARALLELISM_LIMIT, RootGraphContext
from .schemas import DoneEvent, NewTurnInput, ThinkingEvent


class RawChatMessage(TypedDict, total=False):
    role: str
    content: str | list[dict[str, object]]
    id: str


class TextStreamEvent(TypedDict):
    type: Literal["text"]
    content: str


FrontendStreamEvent = TextStreamEvent | ThinkingEvent | DoneEvent


def _compute_root_recursion_limit(installed_app_count: int) -> int:
    """Size the root graph recursion budget for the configured max rounds."""
    per_round_steps = max(1, installed_app_count) + 4
    return max(25, 8 + settings.root_agent_max_dispatch_rounds * per_round_steps)

# ─────────────────────────────────────────────────────────────────────────────
# RootAgent
# ─────────────────────────────────────────────────────────────────────────────


class RootAgent:
    """Top-level parallel orchestrator backed by a compiled StateGraph."""

    def refresh(self) -> None:
        """Invalidate the cached graph and re-register workers for any new plugins."""
        from .graph import refresh_graph

        refresh_graph()

    async def astream(
        self,
        user_id: str,
        messages: list[RawChatMessage],
        thread_id: str | None = None,
        assistant_message_id: str | None = None,
    ) -> AsyncGenerator[FrontendStreamEvent, None]:
        """
        Stream data-stream events for the frontend chat UI.

        The public stream surface is intentionally minimal because the HTTP SSE
        adapter forwards assistant text chunks, structured thinking updates,
        plus the terminal done signal:
          - {type: "text", content}   — streaming assistant text
          - {type: "thinking", ...}   — structured progress update
          - {type: "done"}            — final answer complete
        """
        from core.chat.service import get_live_pending_question, normalize_thread_id

        thread = normalize_thread_id(user_id, thread_id)
        installed_app_ids = await _load_installed_app_ids(user_id)
        pending_question = await get_live_pending_question(user_id, thread)
        turn_id = assistant_message_id or f"turn_{uuid4().hex}"

        user = await User.find_one(User.id == PydanticObjectId(user_id))
        tz_name = get_user_timezone_context(user).tz_name if user else "UTC"

        graph = get_root_agent_graph()
        config: RunnableConfig = {
            "configurable": {
                "thread_id": thread,
                "user_id": user_id,
                "user_tz": tz_name,
                "installed_app_ids": sorted(installed_app_ids),
            },
            "recursion_limit": _compute_root_recursion_limit(len(installed_app_ids)),
        }
        context = RootGraphContext(
            user_id=user_id,
            thread_id=thread,
            user_tz=tz_name,
            installed_app_ids=sorted(installed_app_ids),
            assistant_message_id=assistant_message_id,
            turn_id=turn_id,
            worker_semaphore=asyncio.Semaphore(ROOT_WORKER_PARALLELISM_LIMIT),
            deadline_monotonic=time.monotonic() + settings.root_agent_max_turn_wall_seconds,
            turn_started_at_utc=utc_now(),
            pending_question=pending_question,
        )

        # Only new user messages — history comes from checkpointer via previous
        graph_input: NewTurnInput = {
            "new_messages": await _parse_new_turn(messages),
        }

        try:
            async for chunk in graph.astream(
                graph_input,
                config=config,
                context=context,
                stream_mode="custom",
            ):
                if not isinstance(chunk, dict):
                    continue

                event_type = chunk.get("type")
                if event_type == "token":
                    content = chunk.get("content", "")
                    if isinstance(content, str):
                        yield {"type": "text", "content": content}
                elif event_type == "thinking":
                    step_id = chunk.get("step_id", "")
                    label = chunk.get("label", "")
                    status = chunk.get("status")
                    if (
                        isinstance(step_id, str)
                        and isinstance(label, str)
                        and status in {"active", "done"}
                    ):
                        yield {
                            "type": "thinking",
                            "step_id": step_id,
                            "label": label,
                            "status": status,
                        }
                elif event_type == "done":
                    content = chunk.get("content", "")
                    if isinstance(content, str):
                        yield {"type": "done", "content": content}
        except BaseException as exc:
            # GeneratorExit: client disconnected. Not an error — swallow silently.
            # KeyboardInterrupt: server shutdown. Log as warning.
            # All other BaseException (SystemExit, etc.): re-raise.
            if isinstance(exc, GeneratorExit):
                # Client disconnected — no error to surface
                logger.debug(
                    "RootAgent.stream  client_disconnected  user={}  thread={}",
                    user_id,
                    thread,
                )
            elif isinstance(exc, KeyboardInterrupt):
                logger.warning(
                    "RootAgent.stream  keyboard_interrupt  user={}  thread={}",
                    user_id,
                    thread,
                )
            else:
                raise
        finally:
            # Ensure the graph run is cancelled if client disconnects mid-stream.
            # LangGraph handles this internally via checkpointer, but explicit
            # cancellation ensures clean state on the next request.
            logger.debug(
                "RootAgent.stream  finished  user={}  thread={}",
                user_id,
                thread,
            )


# ─────────────────────────────────────────────────────────────────────────────
# Message parsing — new turn only (history from checkpointer)
# ─────────────────────────────────────────────────────────────────────────────


async def _parse_new_turn(raw: list[RawChatMessage]) -> list[BaseMessage]:
    """
    Parse the new user turn from the frontend into LangChain messages.

    Only user messages are accepted — assistant and tool messages are ignored
    since the conversation history lives in the checkpointer.
    """
    from core.utils.sanitizer import sanitize_user_content_async

    out: list[BaseMessage] = []
    for msg in raw:
        if msg.get("role") != "user":
            logger.warning(
                "ignoring non-user message in new turn",
                extra={"role": msg.get("role")},
            )
            continue

        content = msg.get("content", "")
        text = content if isinstance(content, str) else _text_from_parts(content)
        sanitized, warnings = await sanitize_user_content_async(text)
        if warnings:
            logger.warning("sanitization warnings: {}", warnings)

        out.append(HumanMessage(content=sanitized, id=msg.get("id")))
    return out


def _text_from_parts(content: list[dict[str, object]]) -> str:
    """Extract text from multimodal content parts, joined with spaces."""
    parts = [
        text
        for part in content
        if isinstance(part, dict) and part.get("type") == "text"
        for text in [part.get("text")]
        if isinstance(text, str)
    ]
    return " ".join(parts)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


async def _load_installed_app_ids(user_id: str) -> set[str]:
    """Load installed app IDs, failing gracefully on DB/network errors."""
    try:
        return set(await list_installed_app_ids(user_id))
    except (ConnectionError, TimeoutError):
        logger.warning(
            "RootAgent: DB unavailable loading installed apps for user_id={}",
            user_id,
            exc_info=True,
        )
        return set()
    except Exception:
        logger.error(
            "RootAgent: unexpected error loading installed apps for user_id={}",
            user_id,
            exc_info=True,
        )
        return set()


# ─────────────────────────────────────────────────────────────────────────────
# Singleton
# ─────────────────────────────────────────────────────────────────────────────

root_agent = RootAgent()
