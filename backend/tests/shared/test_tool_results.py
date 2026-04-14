from core.utils.timezone import convert_utc_strings_to_local
from shared.tool_results import tool_success


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
