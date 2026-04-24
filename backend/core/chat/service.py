"""Thread metadata helpers for LangGraph-backed chat state."""

from __future__ import annotations

from datetime import timedelta

from beanie import PydanticObjectId

from core.config import settings
from core.constants import CHAT_THREADS_PAGE_SIZE, THREAD_PREVIEW_MAX_LENGTH
from core.models import PendingQuestion, ThreadMeta
from core.utils.timezone import utc_now

_UNSET = object()


def normalize_thread_id(_user_id: str, thread_id: str | None) -> str:
    """Return the frontend-owned thread id after validating it."""
    if thread_id is None:
        raise ValueError("thread_id is required")

    normalized = thread_id.strip()
    if not normalized:
        raise ValueError("thread_id must be a non-empty string")

    return normalized


async def get_thread_meta(
    user_id: str,
    thread_id: str,
) -> ThreadMeta | None:
    """Look up one thread metadata row for a user."""
    return await ThreadMeta.find_one(
        ThreadMeta.user_id == PydanticObjectId(user_id),
        ThreadMeta.thread_id == thread_id,
    )


async def upsert_thread_meta(
    user_id: str,
    thread_id: str,
    *,
    title: str | None = None,
    preview: str | None = None,
    message_count: int | None = None,
    status: str | None = None,
    pending_question: PendingQuestion | None | object = _UNSET,
) -> ThreadMeta:
    """Create or update ThreadMeta from LangGraph thread state."""
    existing = await get_thread_meta(user_id, thread_id)
    if existing:
        update_fields: dict[str, object] = {"updated_at": utc_now()}
        if title is not None:
            update_fields["title"] = title
        if preview is not None:
            update_fields["preview"] = preview[:THREAD_PREVIEW_MAX_LENGTH]
        if message_count is not None:
            update_fields["message_count"] = message_count
        if status is not None:
            update_fields["status"] = status
        if pending_question is not _UNSET:
            update_fields["pending_question"] = pending_question
        await existing.set(update_fields)
        return existing

    meta = ThreadMeta(
        user_id=PydanticObjectId(user_id),
        thread_id=thread_id,
        status=status or "regular",
        title=title or "New conversation",
        preview=preview[:THREAD_PREVIEW_MAX_LENGTH] if preview else "",
        message_count=max(message_count or 0, 0),
        pending_question=None if pending_question is _UNSET else pending_question,
    )
    await meta.insert()
    return meta


async def set_thread_pending_question(
    user_id: str,
    thread_id: str,
    pending_question: PendingQuestion | None,
) -> ThreadMeta | None:
    """Persist or clear the pending clarification state for a thread."""
    thread = await get_thread_meta(user_id, thread_id)
    if thread is None:
        return None

    await thread.set({
        "pending_question": pending_question,
        "updated_at": utc_now(),
    })
    return thread


async def get_live_pending_question(
    user_id: str,
    thread_id: str,
) -> PendingQuestion | None:
    """Return a non-stale pending question, clearing it if it expired."""
    thread = await get_thread_meta(user_id, thread_id)
    if thread is None or thread.pending_question is None:
        return None

    ttl_deadline = utc_now() - timedelta(minutes=settings.pending_question_ttl_minutes)
    if thread.pending_question.asked_at_utc < ttl_deadline:
        await set_thread_pending_question(user_id, thread_id, None)
        return None

    return thread.pending_question


async def list_user_threads(
    user_id: str,
    *,
    include_archived: bool = True,
    limit: int = CHAT_THREADS_PAGE_SIZE,
) -> list[ThreadMeta]:
    """Return thread metadata list for a user, most-recently-updated first."""
    filters = [ThreadMeta.user_id == PydanticObjectId(user_id)]
    if not include_archived:
        filters.append(ThreadMeta.status == "regular")

    return await ThreadMeta.find(*filters).sort("-updated_at").limit(limit).to_list()


async def rename_thread(
    user_id: str,
    thread_id: str,
    title: str,
) -> ThreadMeta | None:
    """Rename one thread. Returns None if thread does not exist."""
    thread = await get_thread_meta(user_id, thread_id)
    if thread is None:
        return None

    await thread.set({
        "title": title.strip() or "New conversation",
        "updated_at": utc_now(),
    })
    return thread


async def set_thread_status(
    user_id: str,
    thread_id: str,
    *,
    status: str,
) -> ThreadMeta | None:
    """Set the visibility status for one thread."""
    thread = await get_thread_meta(user_id, thread_id)
    if thread is None:
        return None

    await thread.set({
        "status": status,
        "updated_at": utc_now(),
    })
    return thread


async def delete_thread_meta(
    user_id: str,
    thread_id: str,
) -> ThreadMeta | None:
    """Delete the thread metadata row and return the deleted document."""
    thread = await get_thread_meta(user_id, thread_id)
    if thread is None:
        return None

    await thread.delete()
    return thread
