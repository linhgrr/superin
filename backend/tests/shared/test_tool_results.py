import pytest

from core.utils.timezone import convert_utc_strings_to_local
from shared.tool_errors import ForbiddenError
from shared.tool_results import safe_tool_call, tool_success


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


@pytest.mark.asyncio
async def test_safe_tool_call_maps_tool_user_error_to_structured_error() -> None:
    async def operation():
        raise ForbiddenError("App 'calendar' requires a paid subscription.")

    result = await safe_tool_call(operation, action="installing app calendar", localize=False)

    assert result == {
        "ok": False,
        "error": {
            "message": "App 'calendar' requires a paid subscription.",
            "code": "forbidden",
            "retryable": False,
        },
    }


@pytest.mark.asyncio
async def test_safe_tool_call_keeps_permission_error_as_legacy_fallback() -> None:
    async def operation():
        raise PermissionError("App 'calendar' requires a paid subscription.")

    result = await safe_tool_call(operation, action="installing app calendar", localize=False)

    assert result == {
        "ok": False,
        "error": {
            "message": "App 'calendar' requires a paid subscription.",
            "code": "forbidden",
            "retryable": False,
        },
    }
