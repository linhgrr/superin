from datetime import date
from types import SimpleNamespace

import pytest

from apps.calendar.tools import recurring as recurring_tools
from core.models import User


@pytest.mark.asyncio
async def test_calendar_make_recurring_uses_local_date_semantics(monkeypatch) -> None:
    user = SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"})

    async def fake_get(_user_id: str):
        return user

    observed: dict = {}

    async def fake_create_recurring_rule(
        user_id: str,
        event_template_id: str,
        frequency: str,
        interval: int,
        days_of_week: list[int] | None,
        end_date: date | None,
        max_occurrences: int | None,
    ) -> dict:
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
        },
        config={"configurable": {"user_id": "507f1f77bcf86cd799439011"}},
    )

    assert result["ok"] is True
    assert observed["user_id"] == "507f1f77bcf86cd799439011"
    assert observed["event_template_id"] == "event-1"
    assert observed["end_date"] == date(2026, 4, 30)
