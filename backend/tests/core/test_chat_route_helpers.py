import asyncio
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from core.chat.routes import _extract_latest_user_message
from core.chat.service import get_live_pending_question, normalize_thread_id
from core.models import PendingQuestion
from core.utils.timezone import utc_now


def test_normalize_thread_id_preserves_frontend_thread_id() -> None:
    assert normalize_thread_id("user-1", "thread-abc") == "thread-abc"
    assert normalize_thread_id("user-1", "  thread-abc  ") == "thread-abc"


def test_normalize_thread_id_rejects_missing_or_empty_values() -> None:
    with pytest.raises(ValueError):
        normalize_thread_id("user-1", None)

    with pytest.raises(ValueError):
        normalize_thread_id("user-1", "   ")


def test_extract_latest_user_message_uses_last_non_empty_user_message() -> None:
    content, msg_id = _extract_latest_user_message(
        [
            {"id": "a1", "role": "user", "content": "older"},
            {"id": "a2", "role": "assistant", "content": "reply"},
            {
                "id": "a3",
                "role": "user",
                "content": [
                    {"type": "text", "text": "newest"},
                    {"type": "tool-call", "toolName": "ignored"},
                ],
            },
        ]
    )

    assert content == "newest"
    assert msg_id == "a3"


def test_extract_latest_user_message_rejects_missing_user_text() -> None:
    try:
        _extract_latest_user_message([{"role": "assistant", "content": "hi"}])
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "latest user message" in str(exc.detail)
        return

    raise AssertionError("Expected HTTPException for missing user message")


def test_get_live_pending_question_returns_fresh_pending_question(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pending = PendingQuestion(
        round=1,
        app_ids_in_scope=["todo"],
        missing_information=["task id"],
        asked_at_utc=utc_now(),
    )

    async def _fake_get_thread_meta(user_id: str, thread_id: str) -> object:
        return SimpleNamespace(pending_question=pending)

    async def _fake_set_thread_pending_question(
        user_id: str,
        thread_id: str,
        value: PendingQuestion | None,
    ) -> None:
        raise AssertionError("Fresh pending questions should not be cleared")

    monkeypatch.setattr("core.chat.service.get_thread_meta", _fake_get_thread_meta)
    monkeypatch.setattr(
        "core.chat.service.set_thread_pending_question",
        _fake_set_thread_pending_question,
    )

    result = asyncio.run(get_live_pending_question("user-1", "thread-1"))
    assert result == pending


def test_get_live_pending_question_clears_stale_pending_question(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pending = PendingQuestion(
        round=1,
        app_ids_in_scope=["todo"],
        missing_information=["task id"],
        asked_at_utc=utc_now() - timedelta(days=1),
    )
    cleared: list[PendingQuestion | None] = []

    async def _fake_get_thread_meta(user_id: str, thread_id: str) -> object:
        return SimpleNamespace(pending_question=pending)

    async def _fake_set_thread_pending_question(
        user_id: str,
        thread_id: str,
        value: PendingQuestion | None,
    ) -> None:
        cleared.append(value)

    monkeypatch.setattr("core.chat.service.get_thread_meta", _fake_get_thread_meta)
    monkeypatch.setattr(
        "core.chat.service.set_thread_pending_question",
        _fake_set_thread_pending_question,
    )

    result = asyncio.run(get_live_pending_question("user-1", "thread-1"))
    assert result is None
    assert cleared == [None]
