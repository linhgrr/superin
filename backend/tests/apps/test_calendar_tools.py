from datetime import UTC, date, datetime
from types import SimpleNamespace
from typing import Any, cast

import pytest

from apps.calendar.tools import events as event_tools
from apps.calendar.tools import recurring as recurring_tools
from core.models import User
from tests.tool_runtime import build_app_tool_runtime


@pytest.mark.asyncio
async def test_calendar_make_recurring_uses_local_date_semantics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"})

    async def fake_get(_user_id: str) -> User:
        return cast(User, user)

    observed: dict[str, Any] = {}

    async def fake_create_recurring_rule(
        user_id: str,
        event_template_id: str,
        frequency: str,
        interval: int,
        days_of_week: list[int] | None,
        end_date: date | None,
        max_occurrences: int | None,
    ) -> dict[str, str]:
        observed["user_id"] = user_id
        observed["event_template_id"] = event_template_id
        observed["end_date"] = end_date
        return {"id": "rule-1"}

    monkeypatch.setattr(User, "get", fake_get)
    monkeypatch.setattr(recurring_tools.calendar_service, "create_recurring_rule", fake_create_recurring_rule)

    result = await recurring_tools.calendar_make_recurring.ainvoke(
        {
            "event_id": "event-1",
            "frequency": "weekly",
            "end_date": "2026-04-30",
            "runtime": build_app_tool_runtime("507f1f77bcf86cd799439011"),
        },
    )

    assert result == {"id": "rule-1"}
    assert observed["user_id"] == "507f1f77bcf86cd799439011"
    assert observed["event_template_id"] == "event-1"
    assert observed["end_date"] == date(2026, 4, 30)


@pytest.mark.asyncio
async def test_calendar_find_events_combines_query_with_time_and_calendar_filters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"})

    async def fake_get(_user_id: str) -> User:
        return cast(User, user)

    observed: dict[str, Any] = {}

    async def fake_search_events(
        user_id: str,
        query: str,
        start: datetime | None = None,
        end: datetime | None = None,
        calendar_id: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, object]]:
        observed["user_id"] = user_id
        observed["query"] = query
        observed["start"] = start
        observed["end"] = end
        observed["calendar_id"] = calendar_id
        observed["limit"] = limit
        return []

    monkeypatch.setattr(User, "get", fake_get)
    monkeypatch.setattr(event_tools.calendar_service, "search_events", fake_search_events)

    result = await event_tools.calendar_find_events.ainvoke(
        {
            "query": "john",
            "start": "2026-04-23T09:00:00",
            "end": "2026-04-23T18:00:00",
            "calendar_id": "cal-1",
            "limit": 5,
            "runtime": build_app_tool_runtime("507f1f77bcf86cd799439011"),
        },
    )

    assert result == []
    assert observed["user_id"] == "507f1f77bcf86cd799439011"
    assert observed["query"] == "john"
    assert observed["start"] == datetime(2026, 4, 23, 2, 0, tzinfo=UTC)
    assert observed["end"] == datetime(2026, 4, 23, 11, 0, tzinfo=UTC)
    assert observed["calendar_id"] == "cal-1"
    assert observed["limit"] == 5
