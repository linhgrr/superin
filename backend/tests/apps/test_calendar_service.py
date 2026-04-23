from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from pymongo.errors import DuplicateKeyError

from apps.calendar.service import CalendarService


@asynccontextmanager
async def fake_calendar_transaction() -> AsyncIterator[str]:
    yield "session"


def make_calendar(
    calendar_id: str,
    *,
    name: str = "Personal",
    is_default: bool = False,
    color: str = "oklch(0.70 0.18 250)",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=calendar_id,
        name=name,
        color=color,
        is_visible=True,
        is_default=is_default,
        created_at=datetime.now(UTC),
    )


async def test_create_calendar_first_calendar_becomes_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = CalendarService()
    created: dict[str, object] = {}

    monkeypatch.setattr("apps.calendar.service.calendar_transaction", fake_calendar_transaction)

    async def fake_count_by_user(user_id: str, *, session: object | None = None) -> int:
        assert user_id == "user-1"
        assert session == "session"
        return 0

    async def fake_create(
        user_id: str,
        name: str,
        color: str | None,
        is_default: bool,
        *,
        session: object | None = None,
    ) -> object:
        created["args"] = (user_id, name, color, is_default)
        created["session"] = session
        return make_calendar("cal-1", name=name, is_default=is_default)

    monkeypatch.setattr(service.calendars, "count_by_user", fake_count_by_user)
    monkeypatch.setattr(service.calendars, "create", fake_create)

    result = await service.create_calendar("user-1", "Personal")

    assert result.is_default is True
    assert created == {
        "args": ("user-1", "Personal", None, True),
        "session": "session",
    }


async def test_create_calendar_maps_duplicate_key_to_value_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = CalendarService()

    monkeypatch.setattr("apps.calendar.service.calendar_transaction", fake_calendar_transaction)

    async def fake_count_by_user(*_args: object, **_kwargs: object) -> int:
        return 1

    async def fake_create(*_args: object, **_kwargs: object) -> object:
        raise DuplicateKeyError("duplicate calendar")

    monkeypatch.setattr(service.calendars, "count_by_user", fake_count_by_user)
    monkeypatch.setattr(service.calendars, "create", fake_create)

    with pytest.raises(ValueError, match="Calendar 'Work' already exists"):
        await service.create_calendar("user-1", "Work")


async def test_delete_calendar_promotes_replacement_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = CalendarService()
    default_calendar = make_calendar("cal-default", name="Personal", is_default=True)
    replacement = make_calendar("cal-work", name="Work", is_default=False)
    calls: list[tuple[Any, ...]] = []

    monkeypatch.setattr("apps.calendar.service.calendar_transaction", fake_calendar_transaction)

    async def fake_find_by_id(
        calendar_id: str,
        user_id: str,
        *,
        session: object | None = None,
    ) -> SimpleNamespace:
        assert calendar_id == "cal-default"
        assert user_id == "user-1"
        assert session == "session"
        return default_calendar

    async def fake_find_first_other(
        user_id: str,
        excluded_calendar_id: str,
        *,
        session: object | None = None,
    ) -> SimpleNamespace:
        assert user_id == "user-1"
        assert excluded_calendar_id == "cal-default"
        assert session == "session"
        return replacement

    async def fake_delete_by_calendar(
        calendar_id: str,
        *,
        session: object | None = None,
    ) -> int:
        calls.append(("delete_events", calendar_id, session))
        return 3

    async def fake_delete(calendar: SimpleNamespace, *, session: object | None = None) -> None:
        calls.append(("delete_calendar", calendar.id, session))

    async def fake_unset_default(
        user_id: str,
        *,
        exclude_calendar_id: str | None = None,
        session: object | None = None,
    ) -> None:
        calls.append(("unset_default", user_id, exclude_calendar_id, session))

    async def fake_update(
        calendar: SimpleNamespace,
        *,
        session: object | None = None,
        **kwargs: object,
    ) -> SimpleNamespace:
        calls.append(("update_calendar", calendar.id, kwargs, session))
        for key, value in kwargs.items():
            setattr(calendar, key, value)
        return calendar

    monkeypatch.setattr(service.calendars, "find_by_id", fake_find_by_id)
    monkeypatch.setattr(service.calendars, "find_first_other", fake_find_first_other)
    monkeypatch.setattr(service.events, "delete_by_calendar", fake_delete_by_calendar)
    monkeypatch.setattr(service.calendars, "delete", fake_delete)
    monkeypatch.setattr(service.calendars, "unset_default_for_user", fake_unset_default)
    monkeypatch.setattr(service.calendars, "update", fake_update)

    result = await service.delete_calendar("cal-default", "user-1")

    assert result.success is True
    assert result.id == "cal-default"
    assert replacement.is_default is True
    assert calls == [
        ("delete_events", "cal-default", "session"),
        ("delete_calendar", "cal-default", "session"),
        ("unset_default", "user-1", None, "session"),
        ("update_calendar", "cal-work", {"is_default": True}, "session"),
    ]
