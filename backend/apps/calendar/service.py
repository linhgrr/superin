"""Calendar plugin business logic."""

from datetime import datetime, timedelta
from typing import Literal

from apps.calendar.models import Calendar, Event, RecurringRule
from apps.calendar.repository import CalendarRepository, EventRepository, RecurringRuleRepository

# Default colors for calendars
DEFAULT_CALENDAR_COLOR = "oklch(0.70 0.18 250)"  # Blue-ish
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
    ) -> list[dict]:
        """List events with optional time range and calendar filter."""
        events = await self.events.find_by_user(user_id, start, end, calendar_id, limit)
        return [_event_to_dict(e) for e in events]

    async def search_events(
        self,
        user_id: str,
        query: str,
        limit: int = 20,
    ) -> list[dict]:
        """Search events by title/description."""
        events = await self.events.search(user_id, query, limit)
        return [_event_to_dict(e) for e in events]

    async def get_event(self, event_id: str, user_id: str) -> dict | None:
        """Get single event by ID."""
        event = await self.events.find_by_id(event_id, user_id)
        return _event_to_dict(event) if event else None

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
        type_: Literal["event", "time_blocked_task"] = "event",
        task_id: str | None = None,
        color: str | None = None,
        reminders: list[int] | None = None,
    ) -> dict:
        """Create event with conflict check."""
        if end_datetime <= start_datetime:
            raise ValueError("End time must be after start time")

        # Verify calendar exists
        calendar = await self.calendars.find_by_id(calendar_id, user_id)
        if not calendar:
            raise ValueError("Calendar not found")

        event = await self.events.create(
            user_id, title, start_datetime, end_datetime, calendar_id,
            description, location, is_all_day, type_, task_id, color, reminders
        )
        return _event_to_dict(event)

    async def update_event(
        self,
        event_id: str,
        user_id: str,
        **kwargs,
    ) -> dict:
        """Update event with validation."""
        event = await self.events.find_by_id(event_id, user_id)
        if not event:
            raise ValueError("Event not found")

        # Validate time if updating
        new_start = kwargs.get("start_datetime", event.start_datetime)
        new_end = kwargs.get("end_datetime", event.end_datetime)
        if new_end <= new_start:
            raise ValueError("End time must be after start time")

        updated = await self.events.update(event, **kwargs)
        return _event_to_dict(updated)

    async def delete_event(self, event_id: str, user_id: str) -> dict:
        """Delete single event."""
        event = await self.events.find_by_id(event_id, user_id)
        if not event:
            raise ValueError("Event not found")

        await self.events.delete(event)
        return {"success": True, "id": event_id}

    async def check_conflicts(
        self,
        user_id: str,
        start: datetime,
        end: datetime,
        exclude_event_id: str | None = None,
    ) -> list[dict]:
        """Check for conflicting events in time range."""
        conflicts = await self.events.find_conflicts(user_id, start, end, exclude_event_id)
        return [_event_to_dict(e) for e in conflicts]

    # ─── Calendars ──────────────────────────────────────────────────────────────

    async def list_calendars(self, user_id: str) -> list[dict]:
        """List all user calendars."""
        calendars = await self.calendars.find_by_user(user_id)
        return [_calendar_to_dict(c) for c in calendars]

    async def get_calendar(self, calendar_id: str, user_id: str) -> dict | None:
        """Get single calendar."""
        calendar = await self.calendars.find_by_id(calendar_id, user_id)
        return _calendar_to_dict(calendar) if calendar else None

    async def create_calendar(
        self,
        user_id: str,
        name: str,
        color: str | None = None,
    ) -> dict:
        """Create new calendar."""
        # Check for duplicate name
        existing = await self.calendars.find_by_user(user_id)
        if any(c.name.lower() == name.lower() for c in existing):
            raise ValueError(f"Calendar '{name}' already exists")

        # First calendar is default
        is_default = len(existing) == 0

        calendar = await self.calendars.create(user_id, name, color, is_default)
        return _calendar_to_dict(calendar)

    async def update_calendar(
        self,
        calendar_id: str,
        user_id: str,
        **kwargs,
    ) -> dict:
        """Update calendar."""
        calendar = await self.calendars.find_by_id(calendar_id, user_id)
        if not calendar:
            raise ValueError("Calendar not found")

        # If setting as default, unset others
        if kwargs.get("is_default"):
            # Find and unset other default calendars
            all_cals = await self.calendars.find_by_user(user_id)
            for c in all_cals:
                if c.id != calendar.id and c.is_default:
                    c.is_default = False
                    await c.save()

        updated = await self.calendars.update(calendar, **kwargs)
        return _calendar_to_dict(updated)

    async def delete_calendar(self, calendar_id: str, user_id: str) -> dict:
        """Delete calendar and all its events."""
        calendar = await self.calendars.find_by_id(calendar_id, user_id)
        if not calendar:
            raise ValueError("Calendar not found")

        # Delete all events in calendar
        await self.events.delete_by_calendar(calendar_id)

        await self.calendars.delete(calendar)
        return {"success": True, "id": calendar_id}

    # ─── Recurring Rules ────────────────────────────────────────────────────────

    async def create_recurring_rule(
        self,
        user_id: str,
        event_template_id: str,
        frequency: Literal["daily", "weekly", "monthly", "yearly"],
        interval: int = 1,
        days_of_week: list[int] | None = None,
        end_date: datetime | None = None,
        max_occurrences: int | None = None,
    ) -> dict:
        """Create recurring pattern for an event."""
        # Verify event template exists
        template = await self.events.find_by_id(event_template_id, user_id)
        if not template:
            raise ValueError("Event template not found")

        # Mark event as recurring
        await self.events.update(template, is_recurring=True)

        rule = await self.recurring.create(
            user_id, event_template_id, frequency, interval,
            days_of_week, end_date, max_occurrences
        )
        return _recurring_rule_to_dict(rule)

    async def list_recurring_rules(self, user_id: str) -> list[dict]:
        """List all recurring rules."""
        rules = await self.recurring.find_by_user(user_id)
        return [_recurring_rule_to_dict(r) for r in rules]

    async def stop_recurring_rule(self, rule_id: str, user_id: str) -> dict:
        """Stop future occurrences of a recurring rule."""
        rule = await self.recurring.find_by_id(rule_id, user_id)
        if not rule:
            raise ValueError("Recurring rule not found")

        deactivated = await self.recurring.deactivate(rule)
        return _recurring_rule_to_dict(deactivated)

    # ─── Todo Integration ───────────────────────────────────────────────────────

    async def schedule_task(
        self,
        user_id: str,
        task_id: str,
        start_datetime: datetime,
        duration_minutes: int,
        calendar_id: str | None = None,
    ) -> dict:
        """Create time-blocked event from Todo task."""
        # Local import to avoid circular dependency
        from apps.todo.repository import TaskRepository

        task_repo = TaskRepository()
        task = await task_repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError(f"Task '{task_id}' not found")

        # Get default calendar if none specified
        if not calendar_id:
            default = await self.calendars.find_default(user_id)
            if not default:
                raise ValueError("No default calendar found. Create a calendar first.")
            calendar_id = str(default.id)

        # Calculate end time
        end_datetime = start_datetime + timedelta(minutes=duration_minutes)

        # Create event with task reference and actual task title
        event = await self.events.create(
            user_id=user_id,
            title=task.title,
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            calendar_id=calendar_id,
            type_="time_blocked_task",
            task_id=task_id,
        )
        return _event_to_dict(event)

    # ─── Install / Uninstall ────────────────────────────────────────────────────

    async def on_install(self, user_id: str) -> None:
        """Create default calendars for new user."""
        existing_names = {calendar.name for calendar in await self.calendars.find_by_user(user_id)}
        if "Personal" not in existing_names:
            await self.calendars.create(user_id, "Personal", DEFAULT_CALENDAR_COLOR, True)
        if "Work" not in existing_names:
            await self.calendars.create(user_id, "Work", WORK_CALENDAR_COLOR, False)

    async def on_uninstall(self, user_id: str) -> None:
        """Clean up all user data."""
        # Delete all calendars (cascades to events via delete_by_calendar)
        calendars = await self.calendars.find_by_user(user_id)
        for cal in calendars:
            await self.events.delete_by_calendar(str(cal.id))
            await self.calendars.delete(cal)

        # Delete recurring rules
        rules = await self.recurring.find_by_user(user_id)
        for rule in rules:
            await self.recurring.delete(rule)


# ─── DTO helpers ───────────────────────────────────────────────────────────────


def _event_to_dict(e: Event) -> dict:
    return {
        "id": str(e.id),
        "title": e.title,
        "description": e.description,
        "location": e.location,
        "start_datetime": e.start_datetime.isoformat(),
        "end_datetime": e.end_datetime.isoformat(),
        "is_all_day": e.is_all_day,
        "timezone": e.timezone,
        "calendar_id": str(e.calendar_id),
        "type": e.type,
        "task_id": str(e.task_id) if e.task_id else None,
        "color": e.color,
        "is_recurring": e.is_recurring,
        "reminders": e.reminders,
        "attendees": [a.model_dump() for a in e.attendees] if e.attendees else [],
        "created_at": e.created_at.isoformat(),
        "updated_at": e.updated_at.isoformat(),
    }


def _calendar_to_dict(c: Calendar) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "color": c.color,
        "is_visible": c.is_visible,
        "is_default": c.is_default,
        "created_at": c.created_at.isoformat(),
    }


def _recurring_rule_to_dict(r: RecurringRule) -> dict:
    return {
        "id": str(r.id),
        "event_template_id": str(r.event_template_id),
        "frequency": r.frequency,
        "interval": r.interval,
        "days_of_week": r.days_of_week,
        "end_date": r.end_date.isoformat() if r.end_date else None,
        "max_occurrences": r.max_occurrences,
        "occurrence_count": r.occurrence_count,
        "is_active": r.is_active,
        "created_at": r.created_at.isoformat(),
    }


# Singleton
calendar_service = CalendarService()
