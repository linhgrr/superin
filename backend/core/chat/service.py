"""Canonical thread history helpers for ChatGPT-like server-owned chat state."""

from __future__ import annotations

from beanie import PydanticObjectId

from core.models import ConversationMessage


def normalize_thread_id(user_id: str, thread_id: str | None) -> str:
    """Return a user-scoped thread id."""
    if thread_id:
        if thread_id.startswith(f"user:{user_id}"):
            return thread_id
        return f"user:{user_id}:{thread_id}"
    return f"user:{user_id}"


async def list_thread_messages(user_id: str, thread_id: str, *, limit: int = 200) -> list[ConversationMessage]:
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
