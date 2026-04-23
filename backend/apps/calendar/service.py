"""Calendar plugin business logic."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from motor.motor_asyncio import AsyncIOMotorClientSession
from pymongo.errors import DuplicateKeyError

from apps.calendar.enums import EventType, RecurrenceFrequency
from apps.calendar.mappers import calendar_to_read, event_to_read, recurring_rule_to_read
from apps.calendar.repository import (
    DEFAULT_CALENDAR_COLOR,
    CalendarRepository,
    EventRepository,
    RecurringRuleRepository,
    calendar_transaction,
)
from apps.calendar.schemas import (
    CalendarActionResponse,
    CalendarActivitySummaryResponse,
    CalendarCalendarRead,
    CalendarEventRead,
    CalendarRecurringRuleRead,
)
from core.models import User
from core.utils.timezone import get_user_timezone_context

logger = logging.getLogger(__name__)

WORK_CALENDAR_COLOR = "oklch(0.65 0.21 145)"  # Green-ish


class CalendarService:
    def __init__(self) -> None:
        self.events = EventRepository()
        self.calendars = CalendarRepository()
        self.recurring = RecurringRuleRepository()

    # ─── Events ────────────────────────────────────────────────────────────────

    async def list_events(
        self,
        user_id: str,
        start: datetime | None = None,
        end: datetime | None = None,
        calendar_id: str | None = None,
        limit: int = 100,
    ) -> list[CalendarEventRead]:
        """List events with optional time range and calendar filter."""
        events = await self.events.find_by_user(user_id, start, end, calendar_id, limit)
        return [event_to_read(e) for e in events]

    async def search_events(
        self,
        user_id: str,
        query: str,
        start: datetime | None = None,
        end: datetime | None = None,
        calendar_id: str | None = None,
        limit: int = 20,
    ) -> list[CalendarEventRead]:
        """Search events by text, optionally narrowed by time range or calendar."""
        events = await self.events.search(user_id, query, start, end, calendar_id, limit)
        return [event_to_read(e) for e in events]

    async def get_event(self, event_id: str, user_id: str) -> CalendarEventRead | None:
        """Get single event by ID."""
        event = await self.events.find_by_id(event_id, user_id)
        return event_to_read(event) if event else None

    async def create_event(
        self,
        user_id: str,
        title: str,
        start_datetime: datetime,
        end_datetime: datetime,
        calendar_id: str,
        description: str | None = None,
        location: str | None = None,
        is_all_day: bool = False,
        type_: EventType = "event",
        task_id: str | None = None,
        color: str | None = None,
        reminders: list[int] | None = None,
    ) -> CalendarEventRead:
        """Create event with conflict check.

        All incoming datetimes are normalized to UTC-naive via ensure_aware_utc
        before storage. This handles both aware datetimes (any tz) and naive
        datetimes (assumed to be UTC) uniformly.
        """
        from core.utils.timezone import ensure_aware_utc, ensure_naive_utc

        start_utc = ensure_naive_utc(ensure_aware_utc(start_datetime))
        end_utc = ensure_naive_utc(ensure_aware_utc(end_datetime))

        if end_utc <= start_utc:
            raise ValueError("End time must be after start time")

        # Verify calendar exists
        calendar = await self.calendars.find_by_id(calendar_id, user_id)
        if not calendar:
            raise ValueError("Calendar not found")

        user = await User.get(user_id)
        timezone_name = get_user_timezone_context(user).tz_name

        event = await self.events.create(
            user_id, title, start_utc, end_utc, calendar_id,
            description, location, is_all_day, timezone_name, type_, task_id, color, reminders
        )
        return event_to_read(event)

    async def update_event(
        self,
        event_id: str,
        user_id: str,
        title: str | None = None,
        start_datetime: datetime | None = None,
        end_datetime: datetime | None = None,
        calendar_id: str | None = None,
        description: str | None = None,
        location: str | None = None,
        color: str | None = None,
        reminders: list[int] | None = None,
        is_all_day: bool | None = None,
    ) -> CalendarEventRead:
        """Update event with validation.

        Only fields set to non-None values are updated (patch semantics).
        Incoming datetime values are normalized to UTC-naive before storage.
        """
        from core.utils.timezone import ensure_aware_utc, ensure_naive_utc

        event = await self.events.find_by_id(event_id, user_id)
        if not event:
            raise ValueError("Event not found")

        # Normalize datetimes if provided
        new_start = start_datetime if start_datetime else event.start_datetime
        new_end = end_datetime if end_datetime else event.end_datetime

        if isinstance(new_start, datetime):
            new_start = ensure_naive_utc(ensure_aware_utc(new_start))
        if isinstance(new_end, datetime):
            new_end = ensure_naive_utc(ensure_aware_utc(new_end))

        if new_end <= new_start:
            raise ValueError("End time must be after start time")

        updated = await self.events.update(
            event,
            title=title,
            start_datetime=new_start,
            end_datetime=new_end,
            calendar_id=calendar_id,
            description=description,
            location=location,
            color=color,
            reminders=reminders,
            is_all_day=is_all_day,
        )
        return event_to_read(updated)

    async def delete_event(self, event_id: str, user_id: str) -> CalendarActionResponse:
        """Delete single event."""
        event = await self.events.find_by_id(event_id, user_id)
        if not event:
            raise ValueError("Event not found")

        await self.events.delete(event)
        return CalendarActionResponse(success=True, id=event_id, message="Event deleted successfully")

    async def check_conflicts(
        self,
        user_id: str,
        start: datetime,
        end: datetime,
        exclude_event_id: str | None = None,
    ) -> list[CalendarEventRead]:
        """Check for conflicting events in time range."""
        conflicts = await self.events.find_conflicts(user_id, start, end, exclude_event_id)
        return [event_to_read(e) for e in conflicts]

    async def summarize_activity(
        self,
        user_id: str,
        start: datetime,
        end: datetime,
        *,
        limit: int = 10,
    ) -> CalendarActivitySummaryResponse:
        created_events = await self.events.find_created_between(user_id, start, end, limit=None)
        updated_events = await self.events.find_updated_between(user_id, start, end, limit=None)
        scheduled_events = await self.events.find_by_user(user_id, start, end, limit=1000)

        materially_updated_events = [
            event for event in updated_events if event.updated_at > event.created_at
        ]

        return CalendarActivitySummaryResponse(
            start_datetime=start,
            end_datetime=end,
            created_count=len(created_events),
            updated_count=len(materially_updated_events),
            scheduled_count=len(scheduled_events),
            created_events=[event_to_read(event) for event in created_events[:limit]],
            updated_events=[event_to_read(event) for event in materially_updated_events[:limit]],
            scheduled_events=[event_to_read(event) for event in scheduled_events[:limit]],
            unsupported_activity=["event_deletions_not_tracked"],
        )

    # ─── Calendars ──────────────────────────────────────────────────────────────

    async def list_calendars(self, user_id: str) -> list[CalendarCalendarRead]:
        """List all user calendars."""
        calendars = await self.calendars.find_by_user(user_id)
        if not calendars:
            await self.on_install(user_id)
            calendars = await self.calendars.find_by_user(user_id)
        return [calendar_to_read(c) for c in calendars]

    async def get_calendar(self, calendar_id: str, user_id: str) -> CalendarCalendarRead | None:
        """Get single calendar."""
        calendar = await self.calendars.find_by_id(calendar_id, user_id)
        return calendar_to_read(calendar) if calendar else None

    async def create_calendar(
        self,
        user_id: str,
        name: str,
        color: str | None = None,
    ) -> CalendarCalendarRead:
        """Create new calendar."""
        async with calendar_transaction() as session:
            is_default = await self.calendars.count_by_user(user_id, session=session) == 0
            try:
                calendar = await self.calendars.create(
                    user_id,
                    name,
                    color,
                    is_default,
                    session=session,
                )
            except DuplicateKeyError as exc:
                raise ValueError(_calendar_name_exists_message(name)) from exc
        return calendar_to_read(calendar)

    async def update_calendar(
        self,
        calendar_id: str,
        user_id: str,
        name: str | None = None,
        color: str | None = None,
        is_visible: bool | None = None,
        is_default: bool | None = None,
    ) -> CalendarCalendarRead:
        """Update calendar — only fields set to non-None are updated."""
        async with calendar_transaction() as session:
            calendar = await self.calendars.find_by_id(calendar_id, user_id, session=session)
            if not calendar:
                raise ValueError("Calendar not found")

            if is_default:
                await self.calendars.unset_default_for_user(
                    user_id,
                    exclude_calendar_id=calendar_id,
                    session=session,
                )

            try:
                updated = await self.calendars.update(
                    calendar,
                    session=session,
                    name=name,
                    color=color,
                    is_visible=is_visible,
                    is_default=is_default,
                )
            except DuplicateKeyError as exc:
                raise ValueError(
                    _calendar_name_exists_message(name or calendar.name)
                ) from exc
        return calendar_to_read(updated)

    async def delete_calendar(self, calendar_id: str, user_id: str) -> CalendarActionResponse:
        """Delete calendar and all its events."""
        async with calendar_transaction() as session:
            calendar = await self.calendars.find_by_id(calendar_id, user_id, session=session)
            if not calendar:
                raise ValueError("Calendar not found")

            replacement = None
            if calendar.is_default:
                replacement = await self.calendars.find_first_other(
                    user_id,
                    calendar_id,
                    session=session,
                )
                if replacement is None:
                    raise ValueError("Cannot delete the only calendar — at least one calendar must remain")
            else:
                count = await self.calendars.count_by_user(user_id, session=session)
                if count == 1:
                    raise ValueError("Cannot delete the only calendar — at least one calendar must remain")

            await self.events.delete_by_calendar(calendar_id, session=session)
            await self.calendars.delete(calendar, session=session)

            if replacement:
                await self.calendars.unset_default_for_user(user_id, session=session)
                await self.calendars.update(
                    replacement,
                    is_default=True,
                    session=session,
                )
        return CalendarActionResponse(success=True, id=calendar_id)

    # ─── Recurring Rules ────────────────────────────────────────────────────────

    async def create_recurring_rule(
        self,
        user_id: str,
        event_template_id: str,
        frequency: RecurrenceFrequency,
        interval: int = 1,
        days_of_week: list[int] | None = None,
        end_date: date | None = None,
        max_occurrences: int | None = None,
    ) -> CalendarRecurringRuleRead:
        """Create recurring pattern for an event."""
        # Verify event template exists
        template = await self.events.find_by_id(event_template_id, user_id)
        if not template:
            raise ValueError("Event template not found")

        async with calendar_transaction() as session:
            # Mark event as recurring
            await self.events.update(template, is_recurring=True, session=session)

            rule = await self.recurring.create(
                user_id, event_template_id, frequency, interval,
                days_of_week, end_date, max_occurrences,
                session=session,
            )
        return recurring_rule_to_read(rule)

    async def list_recurring_rules(self, user_id: str) -> list[CalendarRecurringRuleRead]:
        """List all recurring rules."""
        rules = await self.recurring.find_by_user(user_id)
        return [recurring_rule_to_read(r) for r in rules]

    async def stop_recurring_rule(self, rule_id: str, user_id: str) -> CalendarRecurringRuleRead:
        """Stop future occurrences of a recurring rule."""
        rule = await self.recurring.find_by_id(rule_id, user_id)
        if not rule:
            raise ValueError("Recurring rule not found")

        deactivated = await self.recurring.deactivate(rule)
        return recurring_rule_to_read(deactivated)

    # ─── Todo Integration ───────────────────────────────────────────────────────

    async def schedule_task(
        self,
        user_id: str,
        task_id: str,
        start_datetime: datetime,
        duration_minutes: int,
        calendar_id: str | None = None,
    ) -> CalendarEventRead:
        """Create time-blocked event from Todo task.

        The start_datetime may come from various callers (agents, tools, etc.)
        with unknown timezone. Normalize it to UTC-naive via ensure_aware_utc first.
        """
        from core.registry import get_task_finder

        task_finder = await get_task_finder(user_id)
        if task_finder is None:
            raise ValueError("Todo plugin is not installed")

        task = await task_finder.find_by_id(task_id, user_id)
        if not task:
            raise ValueError(f"Task '{task_id}' not found")

        # Get default calendar if none specified
        if not calendar_id:
            default = await self.calendars.find_default(user_id)
            if not default:
                raise ValueError("No default calendar found. Create a calendar first.")
            calendar_id = str(default.id)

        user = await User.get(user_id)
        timezone_name = get_user_timezone_context(user).tz_name

        # Normalize to UTC-naive before storage (defense-in-depth; model validator also does this)
        from core.utils.timezone import ensure_aware_utc, ensure_naive_utc

        start_utc = ensure_naive_utc(ensure_aware_utc(start_datetime))
        end_utc = start_utc + timedelta(minutes=duration_minutes)

        # Create event with task reference and actual task title
        event = await self.events.create(
            user_id=user_id,
            title=task.title,
            start_datetime=start_utc,
            end_datetime=end_utc,
            calendar_id=calendar_id,
            timezone=timezone_name,
            type_="time_blocked_task",
            task_id=task_id,
        )
        return event_to_read(event)

    # ─── Install / Uninstall ────────────────────────────────────────────────────

    async def on_install(self, user_id: str, session: AsyncIOMotorClientSession | None = None) -> None:
        """Create default calendars for new user."""
        if session is None:
            async with calendar_transaction() as tx_session:
                await self.on_install(user_id, session=tx_session)
            return

        personal = await self.calendars.find_by_name(user_id, "Personal", session=session)
        if not personal:
            try:
                personal = await self.calendars.create(
                    user_id,
                    "Personal",
                    DEFAULT_CALENDAR_COLOR,
                    True,
                    session=session,
                )
            except DuplicateKeyError:
                personal = await self.calendars.find_by_name(
                    user_id,
                    "Personal",
                    session=session,
                )

        try:
            await self.calendars.create(
                user_id,
                "Work",
                WORK_CALENDAR_COLOR,
                False,
                session=session,
            )
        except DuplicateKeyError:
            logger.warning("on_install: Work calendar already exists for user %s", user_id)

        if personal and not personal.is_default:
            await self.calendars.update(personal, is_default=True, session=session)

    async def on_uninstall(self, user_id: str, session: AsyncIOMotorClientSession | None = None) -> None:
        """Clean up all user data."""
        if session is None:
            async with calendar_transaction() as tx_session:
                await self.on_uninstall(user_id, session=tx_session)
            return

        calendars = await self.calendars.find_by_user(user_id, session=session)
        for cal in calendars:
            await self.events.delete_by_calendar(str(cal.id), session=session)
            await self.calendars.delete(cal, session=session)

        rules = await self.recurring.find_by_user(user_id, session=session)
        for rule in rules:
            await self.recurring.delete(rule, session=session)

def _calendar_name_exists_message(name: str) -> str:
    return f"Calendar '{name}' already exists"


# Singleton
calendar_service = CalendarService()
