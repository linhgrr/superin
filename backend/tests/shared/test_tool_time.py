from datetime import UTC, date, datetime, time
from types import SimpleNamespace
from typing import Any, cast
from zoneinfo import ZoneInfo

import pytest

from core.models import User
from shared.tool_results import run_time_aware_tool_with_runtime
from shared.tool_time import (
    ToolTimeContext,
    normalize_temporal_payload,
    normalize_temporal_value,
)
from tests.tool_runtime import build_app_tool_runtime


def _time_context() -> ToolTimeContext:
    user = cast(User, SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"}))
    now_utc_value = datetime(2026, 4, 19, 2, 30, tzinfo=UTC)
    return ToolTimeContext(
        user_id="507f1f77bcf86cd799439011",
        user=user,
        timezone="Asia/Ho_Chi_Minh",
        now_utc=now_utc_value,
        now_local=datetime(2026, 4, 19, 9, 30, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh")),
    )


def test_normalize_local_datetime_uses_user_timezone() -> None:
    context = _time_context()

    normalized = normalize_temporal_value(
        "2026-04-19T09:00:00",
        "local_datetime",
        context,
    )

    assert normalized == datetime(2026, 4, 19, 2, 0, tzinfo=UTC)


def test_normalize_instant_requires_explicit_offset() -> None:
    context = _time_context()

    with pytest.raises(ValueError, match="UTC offset or Z suffix"):
        normalize_temporal_value("2026-04-19T09:00:00", "instant", context)


def test_normalize_temporal_payload_supports_local_date_and_time() -> None:
    context = _time_context()

    normalized = normalize_temporal_payload(
        {"due_date": "2026-04-20", "due_time": "14:30:00"},
        {"due_date": "local_date", "due_time": "local_time"},
        context,
    )

    assert normalized["due_date"] == date(2026, 4, 20)
    assert normalized["due_time"] == time(14, 30)


@pytest.mark.asyncio
async def test_run_time_aware_tool_with_runtime_normalizes_before_operation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = cast(User, SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"}))

    async def fake_get(_user_id: str) -> User:
        return user

    monkeypatch.setattr(User, "get", fake_get)

    observed: dict[str, Any] = {}

    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        time_context: ToolTimeContext,
    ) -> dict[str, str]:
        observed["user_id"] = user_id
        observed["temporal"] = temporal
        observed["timezone"] = time_context.timezone
        return {
            "start": temporal["start"].isoformat(),
            "timezone": time_context.timezone,
        }

    result = await run_time_aware_tool_with_runtime(
        build_app_tool_runtime("507f1f77bcf86cd799439011"),
        payload={"start": "2026-04-19T09:00:00"},
        temporal_fields={"start": "local_datetime"},
        operation=operation,
    )

    assert observed["user_id"] == "507f1f77bcf86cd799439011"
    assert observed["timezone"] == "Asia/Ho_Chi_Minh"
    assert observed["temporal"]["start"] == datetime(2026, 4, 19, 2, 0, tzinfo=UTC)
    assert result == {
        "start": "2026-04-19T02:00:00+00:00",
        "timezone": "Asia/Ho_Chi_Minh",
    }
