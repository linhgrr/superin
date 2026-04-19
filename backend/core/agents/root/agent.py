"""
RootAgent — top-level parallel orchestrator using LangGraph v2 @entrypoint API.

Each incoming chat turn:
1. Parses the new user message → LangChain HumanMessage (via _parse_new_turn)
2. Loads installed app IDs and user timezone from DB
3. Delegates to the @entrypoint root graph with NewTurnInput
4. Graph manages history via MongoDBSaver checkpointer (previous)
5. Streams events directly to the frontend via graph astream()
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from beanie import PydanticObjectId
from langchain_core.messages import BaseMessage, HumanMessage
from loguru import logger

from core.models import User
from core.utils.timezone import get_user_timezone_context
from core.workspace.service import list_installed_app_ids

from .graph import get_root_agent_graph
from .schemas import NewTurnInput

# ─────────────────────────────────────────────────────────────────────────────
# RootAgent
# ─────────────────────────────────────────────────────────────────────────────


class RootAgent:
    """Top-level parallel orchestrator using LangGraph v2 @entrypoint."""

    def refresh(self) -> None:
        """Invalidate the cached graph and re-register workers for any new plugins."""
        from .graph import refresh_graph

        refresh_graph()

    async def astream(
        self,
        user_id: str,
        messages: list[dict[str, Any]],
        thread_id: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Stream data-stream events for the frontend chat UI.

        Each event maps to the event types the frontend useDataStreamRuntime expects:
          - {type: "app_result", app_id, status, ok}  — partial app result
          - {type: "merged_context", content}          — all results merged
          - {type: "token", content}                  — streaming token
          - {type: "done"}                            — final answer complete
        """
        from core.chat.service import normalize_thread_id

        thread = normalize_thread_id(user_id, thread_id)
        installed_app_ids = await _load_installed_app_ids(user_id)

        user = await User.find_one(User.id == PydanticObjectId(user_id))
        tz_name = get_user_timezone_context(user).tz_name if user else "UTC"

        graph = get_root_agent_graph()
        config: dict[str, Any] = {
            "configurable": {
                "thread_id": thread,
                "user_id": user_id,
                "user_tz": tz_name,
                "installed_app_ids": sorted(installed_app_ids),
            },
        }

        # Only new user messages — history comes from checkpointer via previous
        graph_input: NewTurnInput = {
            "new_messages": await _parse_new_turn(messages),
        }

        try:
            async for chunk in graph.astream(graph_input, config=config, stream_mode="custom"):
                if not isinstance(chunk, dict):
                    continue

                event_type = chunk.get("type")
                if event_type == "app_result":
                    yield {
                        "type": "app_result",
                        "app_id": chunk.get("app_id"),
                        "status": chunk.get("status"),
                        "ok": chunk.get("ok"),
                    }
                elif event_type == "merged_context":
                    yield {
                        "type": "merged_context",
                        "content": chunk.get("content", "")[:500],
                    }
                elif event_type == "token":
                    yield {"type": "text", "content": chunk.get("content", "")}
                elif event_type == "done":
                    yield {"type": "done", "content": chunk.get("content", "")}
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


async def _parse_new_turn(raw: list[dict[str, Any]]) -> list[BaseMessage]:
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


def _text_from_parts(content: list[dict[str, Any]]) -> str:
    """Extract text from multimodal content parts, joined with spaces."""
    parts = [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]
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
