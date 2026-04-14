from fastapi import HTTPException

from core.chat.routes import _extract_latest_user_message
from core.chat.service import normalize_thread_id


def test_normalize_thread_id_prefixes_user_scope() -> None:
    assert normalize_thread_id("user-1", "thread-abc") == "user:user-1:thread-abc"
    assert normalize_thread_id("user-1", "user:user-1:thread-abc") == "user:user-1:thread-abc"
    assert normalize_thread_id("user-1", None) == "user:user-1"


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
