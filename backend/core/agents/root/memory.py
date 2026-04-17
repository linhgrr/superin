"""Memory helpers — wraps LangGraph BaseStore for Superin's user memory needs.

Architecture:
  - Short-term: AsyncMongoDBSaver checkpointer (core/db.py) manages per-thread
    conversation history. RootAgent._build_message_list() is DEPRECATED and will
    be removed after the checkpointer rollout is complete.
  - Long-term: MongoDBStore (via get_store()) → store.aput/asearch/aget
    Provides persistent user memories across all threads and sessions.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from loguru import logger

if TYPE_CHECKING:
    from langgraph.store.base import BaseStore


def _namespace(user_id: str, category: str) -> tuple[str, ...]:
    """Build a store namespace tuple: (user_id, "memories", category)."""
    return (user_id, "memories", category)


async def save_memory(
    store: BaseStore,
    user_id: str,
    content: str,
    category: str = "general",
    key: str | None = None,
) -> str:
    """
    Save a memory entry for a user.

    Args:
        store: LangGraph BaseStore (MongoDBStore in production)
        user_id: User identifier
        content: Memory content to save
        category: Memory category (e.g. "preferences", "personal", "work", "goals")
        key: Optional explicit key; auto-generated if omitted

    Returns:
        The key under which the memory was saved.
    """
    from uuid import uuid4

    from core.utils.sanitizer import sanitize_for_memory_async

    ns = _namespace(user_id, category)
    key = key or f"mem_{uuid4().hex[:8]}"
    sanitized = await sanitize_for_memory_async(content)

    await store.aput(
        ns,
        key,
        {
            "content": sanitized,
            "category": category,
        },
    )
    logger.debug("save_memory  user={}  key={}  category={}", user_id, key, category)
    return key


async def recall_memories(
    store: BaseStore,
    user_id: str,
    category: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """
    Recall memories for a user.

    Args:
        store: LangGraph BaseStore
        user_id: User identifier
        category: Optional category filter; None means all categories
        limit: Max number of results (default 20)
        offset: Pagination offset

    Returns:
        List of memory dicts with 'key', 'content', 'category', 'saved_at'.
    """
    ns: tuple[str, ...] = _namespace(user_id, category) if category else (user_id, "memories")
    items = await store.asearch(ns, limit=limit, offset=offset)
    return [
        {"key": item.key, **({"content": item.value} if not isinstance(item.value, dict) else item.value)}
        for item in items
    ]


async def delete_memory(store: BaseStore, user_id: str, key: str, category: str = "general") -> None:
    """Delete a specific memory by key and category."""
    ns = _namespace(user_id, category)
    await store.adelete(ns, key)
    logger.debug("delete_memory  user={}  key={}  category={}", user_id, key, category)


async def recall_memories_for_context(
    store: BaseStore,
    user_id: str,
    limit: int = 5,
) -> str:
    """
    Recall relevant memories for a user and format as a string for LLM context.

    Returns:
        Formatted memory string like "[memory/category] content" or "" if none.
    """
    try:
        memories = await recall_memories(store, user_id, limit=limit)
    except Exception as exc:
        logger.warning("recall_memories_for_context failed: %s", exc)
        return ""

    if not memories:
        return ""

    lines = []
    for m in memories:
        content = m.get("content", "")
        category = m.get("category", "?")
        if content:
            lines.append(f"[memory/{category}] {content}")

    return "\n".join(lines)
