from types import SimpleNamespace
from typing import cast

import pytest

from core.models import User
from core.utils.timezone import convert_utc_strings_to_local
from shared.tool_results import (
    encode_tool_result,
    parse_tool_message_content,
    tool_error,
    tool_success,
    tool_success_async,
)


def test_convert_utc_strings_to_local_recurses_nested_payloads() -> None:
    payload = {
        "start_datetime": "2026-04-14T02:00:00Z",
        "items": [{"end_datetime": "2026-04-14T03:00:00+00:00"}],
        "plain": "hello",
    }

    converted = convert_utc_strings_to_local(payload, lambda dt: dt.strftime("%Y-%m-%d %H:%M"))

    assert converted["start_datetime"] == "2026-04-14 02:00"
    assert converted["items"][0]["end_datetime"] == "2026-04-14 03:00"
    assert converted["plain"] == "hello"


def test_tool_success_shape_is_preserved() -> None:
    result = tool_success({"ok": True})

    assert result["ok"] is True
    assert result["data"] == {"ok": True}


def test_encode_and_parse_tool_result_round_trip() -> None:
    result = tool_error("bad request", code="invalid_request")
    encoded = encode_tool_result(result)

    assert parse_tool_message_content(encoded) == result


@pytest.mark.asyncio
async def test_tool_success_async_localizes_for_user(monkeypatch: pytest.MonkeyPatch) -> None:
    user = cast(User, SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"}))

    async def fake_get(_user_id: str) -> User:
        return user

    monkeypatch.setattr(User, "get", fake_get)

    result = await tool_success_async(
        {"start_datetime": "2026-04-14T02:00:00Z"},
        user_id="507f1f77bcf86cd799439011",
    )

    assert result == {
        "ok": True,
        "data": {"start_datetime": "2026-04-14 09:00"},
    }
