"""Canonical thread history helpers for ChatGPT-like server-owned chat state."""

from __future__ import annotations

from beanie import PydanticObjectId

from core.constants import CHAT_THREADS_PAGE_SIZE, THREAD_PREVIEW_MAX_LENGTH
from core.models import ConversationMessage, ThreadMeta
from core.utils.timezone import utc_now


def normalize_thread_id(user_id: str, thread_id: str | None) -> str:
    """Return a user-scoped thread id."""
    if thread_id:
        if thread_id.startswith(f"user:{user_id}"):
            return thread_id
        return f"user:{user_id}:{thread_id}"
    return f"user:{user_id}"


async def list_thread_messages(
    user_id: str, thread_id: str, *, limit: int = 200
) -> list[ConversationMessage]:
    """Return canonical persisted messages for a thread in chronological order."""
    return await ConversationMessage.find(
        ConversationMessage.user_id == PydanticObjectId(user_id),
        ConversationMessage.thread_id == thread_id,
    ).sort("created_at").limit(limit).to_list()


async def get_message_by_client_id(
    user_id: str,
    thread_id: str,
    client_message_id: str | None,
) -> ConversationMessage | None:
    """Look up a message by client-generated id for idempotent retries."""
    if not client_message_id:
        return None
    return await ConversationMessage.find_one(
        ConversationMessage.user_id == PydanticObjectId(user_id),
        ConversationMessage.thread_id == thread_id,
        ConversationMessage.client_message_id == client_message_id,
    )


async def append_thread_message(
    *,
    user_id: str,
    thread_id: str,
    role: str,
    content: str,
    client_message_id: str | None = None,
) -> ConversationMessage:
    """Persist a canonical thread message."""
    message = ConversationMessage(
        user_id=PydanticObjectId(user_id),
        thread_id=thread_id,
        role=role,
        content=content,
        client_message_id=client_message_id,
    )
    await message.insert()
    return message


async def upsert_thread_meta(
    user_id: str,
    canonical_thread_id: str,
    *,
    title: str | None = None,
    preview: str | None = None,
    increment_count: int = 0,
) -> ThreadMeta:
    """Create or update ThreadMeta. Call only after messages are confirmed persisted."""
    existing = await ThreadMeta.find_one(
        ThreadMeta.user_id == PydanticObjectId(user_id),
        ThreadMeta.thread_id == canonical_thread_id,
    )
    if existing:
        update_fields: dict[str, object] = {"updated_at": utc_now()}
        if title is not None:
            update_fields["title"] = title
        if preview is not None:
            update_fields["preview"] = preview[:THREAD_PREVIEW_MAX_LENGTH]
        if increment_count:
            update_fields["message_count"] = existing.message_count + increment_count
        await existing.set(update_fields)
        return existing
    else:
        meta = ThreadMeta(
            user_id=PydanticObjectId(user_id),
            thread_id=canonical_thread_id,
            title=title or "New conversation",
            preview=preview[:THREAD_PREVIEW_MAX_LENGTH] if preview else "",
            message_count=0,
        )
        await meta.insert()
        return meta


async def list_user_threads(user_id: str, limit: int = CHAT_THREADS_PAGE_SIZE) -> list[ThreadMeta]:
    """Return thread metadata list for a user, most-recently-updated first."""
    return await ThreadMeta.find(
        ThreadMeta.user_id == PydanticObjectId(user_id),
    ).sort("-updated_at").limit(limit).to_list()
