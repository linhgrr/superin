from datetime import UTC, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from apps.calendar.routes.widgets import get_month_view_widget_data
from apps.calendar.schemas import MonthViewWidgetConfig


class _FixedTimezoneContext:
    tz = ZoneInfo("Asia/Ho_Chi_Minh")

    def now_local(self) -> datetime:
        return datetime(2026, 4, 15, 9, 0, tzinfo=self.tz)

    def month_range(self, month_offset: int = 0) -> tuple[datetime, datetime]:
        assert month_offset == 0
        return (
            datetime(2026, 4, 1, 0, 0, tzinfo=UTC),
            datetime(2026, 4, 30, 23, 59, 59, tzinfo=UTC),
        )

    def utc_to_local(self, dt: datetime) -> datetime:
        return dt.astimezone(self.tz)


async def test_month_view_widget_groups_events_by_user_local_day(monkeypatch) -> None:
    async def fake_get(user_id: str):
        assert user_id == "user-1"
        return SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"})

    async def fake_list_events(*_args, **_kwargs):
        return [
            {"title": "Morning sync", "type": "event", "start_datetime": "2026-04-01T02:00:00Z"},
            {"title": "Late call", "type": "event", "start_datetime": "2026-04-01T18:30:00Z"},
        ]

    async def fake_list_calendars(user_id: str):
        assert user_id == "user-1"
        return []

    monkeypatch.setattr("apps.calendar.routes.widgets.User.get", fake_get)
    monkeypatch.setattr(
        "apps.calendar.routes.widgets.get_user_timezone_context",
        lambda _user: _FixedTimezoneContext(),
    )
    monkeypatch.setattr("apps.calendar.routes.widgets.calendar_service.list_events", fake_list_events)
    monkeypatch.setattr("apps.calendar.routes.widgets.calendar_service.list_calendars", fake_list_calendars)

    result = await get_month_view_widget_data(
        "user-1",
        MonthViewWidgetConfig(default_calendar=None, show_time_blocked_tasks=True),
    )

    day_1 = next(day for day in result.days if day.day == 1)
    day_2 = next(day for day in result.days if day.day == 2)

    assert day_1.event_count == 1
    assert day_1.event_titles == ["Morning sync"]
    assert day_2.event_count == 1
    assert day_2.event_titles == ["Late call"]
