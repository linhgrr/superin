# Calendar App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Calendar App with events, recurring patterns, Todo integration, and conflict detection following Superin patterns.

**Architecture:** Clean separation - Events (Calendar) reference Tasks (Todo) via task_id. 10 consolidated tools. Beanie ODM with MongoDB.

**Tech Stack:** Python, FastAPI, Beanie ODM, LangGraph tools, Pydantic

**Reference Patterns:**
- @backend/apps/todo/ - Full CRUD, tools, recurring pattern
- @backend/apps/finance/ - Service/repository patterns
- @docs/PLUGIN_DEVELOPMENT_GUIDE.md - App structure

---

## Prerequisites

Before starting, ensure worktree is clean and calendar app directory doesn't exist.

---

### Task 1: Create Calendar App Directory Structure

**Files:**
- Create: `backend/apps/calendar/__init__.py`
- Create: `backend/apps/calendar/models.py`
- Create: `backend/apps/calendar/repository.py`
- Create: `backend/apps/calendar/service.py`
- Create: `backend/apps/calendar/schemas.py`
- Create: `backend/apps/calendar/tools.py`
- Create: `backend/apps/calendar/routes.py`
- Create: `backend/apps/calendar/agent.py`
- Create: `backend/apps/calendar/prompts.py`
- Create: `backend/apps/calendar/manifest.py`

**Step 1: Initialize directory structure**

```bash
mkdir -p /home/linh/Downloads/superin/backend/apps/calendar
touch /home/linh/Downloads/superin/backend/apps/calendar/__init__.py
```

**Step 2: Verify structure matches other apps**

```bash
ls -la backend/apps/todo/
# Should see: __init__.py models.py repository.py service.py schemas.py tools.py routes.py agent.py prompts.py manifest.py
```

Expected: Same structure as todo/

**Step 3: Commit**

```bash
git add backend/apps/calendar/
git commit -m "chore(calendar): create app directory structure

Create empty files following Superin app patterns."
```

---

### Task 2: Write Event and Calendar Models

**Files:**
- Create: `backend/apps/calendar/models.py` (empty → full content)
- Reference: `backend/apps/todo/models.py` for Beanie patterns

**Step 1: Create models with indexes**

```python
"""Calendar plugin Beanie document models."""

from datetime import datetime
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class Attendee(BaseModel):
    """Basic attendee for events (Phase 2 feature)."""
    email: str
    name: str | None = None
    status: Literal["pending", "accepted", "declined", "tentative"] = "pending"


class Event(Document):
    """A calendar event or time-blocked task."""

    user_id: PydanticObjectId
    title: str
    description: str | None = None
    location: str | None = None

    # Time fields
    start_datetime: datetime
    end_datetime: datetime
    is_all_day: bool = False
    timezone: str = "UTC"

    # Classification
    calendar_id: PydanticObjectId
    type: Literal["event", "time_blocked_task"] = "event"
    task_id: PydanticObjectId | None = None  # Link to Todo task

    # Appearance
    color: str | None = None  # Override calendar color

    # Recurrence
    is_recurring: bool = False
    recurring_rule_id: PydanticObjectId | None = None

    # Reminders (minutes before event)
    reminders: list[int] = Field(default_factory=list)

    # Attendees (Phase 2)
    attendees: list[Attendee] = Field(default_factory=list)

    # Metadata
    ics_uid: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "calendar_events"
        indexes = [
            [("user_id", 1), ("start_datetime", -1)],  # List queries
            [("user_id", 1), ("calendar_id", 1)],  # Filter by calendar
            [("user_id", 1), ("type", 1)],  # Filter by type
            [("task_id", 1)],  # Lookup from Todo
            [("recurring_rule_id", 1)],  # Find by rule
            [("start_datetime", 1), ("end_datetime", 1)],  # Conflict detection
        ]


class Calendar(Document):
    """A calendar grouping (Personal, Work, etc.)."""

    user_id: PydanticObjectId
    name: str  # e.g., "Personal", "Work", "Family"
    color: str = "oklch(0.70 0.18 250)"  # Default blue-ish
    is_visible: bool = True
    is_default: bool = False  # Default calendar for new events
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "calendar_calendars"
        indexes = [
            [("user_id", 1), ("is_default", 1)],
        ]


class RecurringRule(Document):
    """Pattern for generating recurring events."""

    user_id: PydanticObjectId
    event_template_id: PydanticObjectId  # Original event with pattern

    # Pattern
    frequency: Literal["daily", "weekly", "monthly", "yearly"]
    interval: int = 1  # Every N frequencies
    days_of_week: list[int] | None = None  # 0=Monday for weekly

    # Limits
    end_date: datetime | None = None
    max_occurrences: int | None = None
    occurrence_count: int = 0

    # State
    is_active: bool = True
    last_generated_date: datetime | None = None

    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "calendar_recurring_rules"
        indexes = [
            [("user_id", 1), ("is_active", 1)],
            [("frequency", 1), ("last_generated_date", 1)],
        ]
```

**Step 2: Verify syntax**

```bash
cd /home/linh/Downloads/superin/backend
python -c "from apps.calendar.models import Event, Calendar, RecurringRule; print('Models OK')"
```

Expected: "Models OK" (no import errors)

**Step 3: Commit**

```bash
git add backend/apps/calendar/models.py
git commit -m "feat(calendar): add Event, Calendar, RecurringRule models

- Event with time fields, type (event/time_blocked_task), task reference
- Calendar for grouping with color
- RecurringRule for pattern generation
- Proper indexes for conflict detection and queries"
```

---

### Task 3: Write Repository Layer

**Files:**
- Create: `backend/apps/calendar/repository.py`
- Reference: `backend/apps/finance/repository.py` for patterns

**Step 1: Create repository with conflict detection**

```python
"""Calendar plugin data access layer."""

from datetime import datetime
from typing import Literal

from beanie import PydanticObjectId

from apps.calendar.models import Calendar, Event, RecurringRule


class EventRepository:
    async def find_by_user(
        self,
        user_id: str,
        start: datetime | None = None,
        end: datetime | None = None,
        calendar_id: str | None = None,
        limit: int = 100,
    ) -> list[Event]:
        """List events with time range filter."""
        query = Event.user_id == PydanticObjectId(user_id)

        if calendar_id:
            query = query & (Event.calendar_id == PydanticObjectId(calendar_id))

        if start and end:
            # Events overlapping with range
            query = query & (
                (Event.start_datetime >= start) & (Event.start_datetime < end)
                | (Event.end_datetime > start) & (Event.end_datetime <= end)
                | (Event.start_datetime <= start) & (Event.end_datetime >= end)
            )
        elif start:
            query = query & (Event.end_datetime > start)
        elif end:
            query = query & (Event.start_datetime < end)

        return await Event.find(query).sort("start_datetime").limit(limit).to_list()

    async def find_by_id(self, event_id: str, user_id: str) -> Event | None:
        return await Event.find_one(
            Event.id == PydanticObjectId(event_id),
            Event.user_id == PydanticObjectId(user_id),
        )

    async def search(
        self,
        user_id: str,
        query: str,
        limit: int = 20,
    ) -> list[Event]:
        """Search events by title or description."""
        search_lower = query.lower()
        all_events = await Event.find(
            Event.user_id == PydanticObjectId(user_id)
        ).to_list()

        filtered = [
            e for e in all_events
            if search_lower in e.title.lower()
            or (e.description and search_lower in e.description.lower())
            or (e.location and search_lower in e.location.lower())
        ]
        return filtered[:limit]

    async def find_conflicts(
        self,
        user_id: str,
        start: datetime,
        end: datetime,
        exclude_event_id: str | None = None,
    ) -> list[Event]:
        """Find events overlapping with given time range."""
        query = Event.user_id == PydanticObjectId(user_id)

        # Overlap condition: (start1 < end2) and (end1 > start2)
        query = query & (
            (Event.start_datetime < end) & (Event.end_datetime > start)
        )

        if exclude_event_id:
            query = query & (Event.id != PydanticObjectId(exclude_event_id))

        return await Event.find(query).sort("start_datetime").to_list()

    async def create(
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
    ) -> Event:
        event = Event(
            user_id=PydanticObjectId(user_id),
            title=title,
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            calendar_id=PydanticObjectId(calendar_id),
            description=description,
            location=location,
            is_all_day=is_all_day,
            type=type_,
            task_id=PydanticObjectId(task_id) if task_id else None,
            color=color,
            reminders=reminders or [],
        )
        await event.insert()
        return event

    async def update(self, event: Event, **kwargs) -> Event:
        for key, value in kwargs.items():
            if hasattr(event, key) and value is not None:
                setattr(event, key, value)
        event.updated_at = datetime.utcnow()
        await event.save()
        return event

    async def delete(self, event: Event) -> None:
        await event.delete()

    async def delete_by_calendar(self, calendar_id: str) -> int:
        """Delete all events in a calendar."""
        count = 0
        async for e in Event.find(Event.calendar_id == PydanticObjectId(calendar_id)):
            await e.delete()
            count += 1
        return count


class CalendarRepository:
    async def find_by_user(self, user_id: str) -> list[Calendar]:
        return await Calendar.find(
            Calendar.user_id == PydanticObjectId(user_id)
        ).to_list()

    async def find_by_id(self, calendar_id: str, user_id: str) -> Calendar | None:
        return await Calendar.find_one(
            Calendar.id == PydanticObjectId(calendar_id),
            Calendar.user_id == PydanticObjectId(user_id),
        )

    async def find_default(self, user_id: str) -> Calendar | None:
        return await Calendar.find_one(
            Calendar.user_id == PydanticObjectId(user_id),
            Calendar.is_default == True,
        )

    async def create(
        self,
        user_id: str,
        name: str,
        color: str | None = None,
        is_default: bool = False,
    ) -> Calendar:
        calendar = Calendar(
            user_id=PydanticObjectId(user_id),
            name=name,
            color=color or "oklch(0.70 0.18 250)",
            is_default=is_default,
        )
        await calendar.insert()
        return calendar

    async def update(self, calendar: Calendar, **kwargs) -> Calendar:
        for key, value in kwargs.items():
            if hasattr(calendar, key) and value is not None:
                setattr(calendar, key, value)
        await calendar.save()
        return calendar

    async def delete(self, calendar: Calendar) -> None:
        await calendar.delete()


class RecurringRuleRepository:
    async def find_by_user(self, user_id: str) -> list[RecurringRule]:
        return await RecurringRule.find(
            RecurringRule.user_id == PydanticObjectId(user_id)
        ).to_list()

    async def find_by_id(self, rule_id: str, user_id: str) -> RecurringRule | None:
        return await RecurringRule.find_one(
            RecurringRule.id == PydanticObjectId(rule_id),
            RecurringRule.user_id == PydanticObjectId(user_id),
        )

    async def create(
        self,
        user_id: str,
        event_template_id: str,
        frequency: Literal["daily", "weekly", "monthly", "yearly"],
        interval: int = 1,
        days_of_week: list[int] | None = None,
        end_date: datetime | None = None,
        max_occurrences: int | None = None,
    ) -> RecurringRule:
        rule = RecurringRule(
            user_id=PydanticObjectId(user_id),
            event_template_id=PydanticObjectId(event_template_id),
            frequency=frequency,
            interval=interval,
            days_of_week=days_of_week,
            end_date=end_date,
            max_occurrences=max_occurrences,
        )
        await rule.insert()
        return rule

    async def update_occurrence(self, rule: RecurringRule) -> RecurringRule:
        """Increment occurrence count and update last generated date."""
        rule.occurrence_count += 1
        rule.last_generated_date = datetime.utcnow()
        await rule.save()
        return rule

    async def deactivate(self, rule: RecurringRule) -> RecurringRule:
        rule.is_active = False
        await rule.save()
        return rule

    async def delete(self, rule: RecurringRule) -> None:
        await rule.delete()
```

**Step 2: Verify syntax**

```bash
cd /home/linh/Downloads/superin/backend
python -c "from apps.calendar.repository import EventRepository, CalendarRepository, RecurringRuleRepository; print('Repository OK')"
```

Expected: "Repository OK"

**Step 3: Commit**

```bash
git add backend/apps/calendar/repository.py
git commit -m "feat(calendar): add repository layer with conflict detection

- EventRepository with find_conflicts() for overlap detection
- CalendarRepository with default calendar support
- RecurringRuleRepository for pattern management"
```

---

### Task 4: Write Schemas

**Files:**
- Create: `backend/apps/calendar/schemas.py`
- Reference: `backend/apps/todo/schemas.py`

**Step 1: Create Pydantic schemas**

```python
"""Calendar plugin Pydantic request/response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CreateEventRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    start_datetime: datetime
    end_datetime: datetime
    calendar_id: str
    description: str | None = None
    location: str | None = None
    is_all_day: bool = False
    type: Literal["event", "time_blocked_task"] = "event"
    task_id: str | None = None  # For time-blocked tasks
    color: str | None = None
    reminders: list[int] = Field(default_factory=list)


class UpdateEventRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    calendar_id: str | None = None
    description: str | None = None
    location: str | None = None
    is_all_day: bool | None = None
    color: str | None = None
    reminders: list[int] | None = None


class CreateCalendarRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: str | None = None


class UpdateCalendarRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    color: str | None = None
    is_visible: bool | None = None
    is_default: bool | None = None


class CreateRecurringRuleRequest(BaseModel):
    frequency: Literal["daily", "weekly", "monthly", "yearly"]
    interval: int = Field(default=1, ge=1, le=52)
    days_of_week: list[int] | None = None  # 0=Monday, 6=Sunday
    end_date: datetime | None = None
    max_occurrences: int | None = Field(None, ge=1, le=1000)


class ScheduleTaskRequest(BaseModel):
    task_id: str
    start_datetime: datetime
    duration_minutes: int = Field(ge=15, le=480)  # 15 min to 8 hours
```

**Step 2: Commit**

```bash
git add backend/apps/calendar/schemas.py
git commit -m "feat(calendar): add Pydantic request schemas

- CreateEventRequest, UpdateEventRequest
- CreateCalendarRequest, UpdateCalendarRequest
- CreateRecurringRuleRequest, ScheduleTaskRequest"
```

---

### Task 5: Write Service Layer

**Files:**
- Create: `backend/apps/calendar/service.py`
- Reference: `backend/apps/todo/service.py`

**Step 1: Create service with conflict detection**

```python
"""Calendar plugin business logic."""

from datetime import datetime, timedelta
from typing import Literal

from apps.calendar.models import Calendar, Event, RecurringRule
from apps.calendar.repository import CalendarRepository, EventRepository, RecurringRuleRepository


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
        # Get default calendar if none specified
        if not calendar_id:
            default = await self.calendars.find_default(user_id)
            if not default:
                raise ValueError("No default calendar found. Create a calendar first.")
            calendar_id = str(default.id)

        # Calculate end time
        end_datetime = start_datetime + timedelta(minutes=duration_minutes)

        # Create event with task reference
        event = await self.events.create(
            user_id=user_id,
            title=f"Task: {task_id}",  # Will be updated with actual task title
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            calendar_id=calendar_id,
            type_="time_blocked_task",
            task_id=task_id,
        )
        return _event_to_dict(event)

    # ─── Install / Uninstall ────────────────────────────────────────────────────

    async def on_install(self, user_id: str) -> None:
        """Create default calendar for new user."""
        await self.calendars.create(user_id, "Personal", "oklch(0.70 0.18 250)", True)
        await self.calendars.create(user_id, "Work", "oklch(0.65 0.21 145)", False)

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
```

**Step 2: Commit**

```bash
git add backend/apps/calendar/service.py
git commit -m "feat(calendar): add service layer with conflict detection

- Event CRUD with conflict check
- Calendar management with default support
- Recurring rule handling
- Todo integration via schedule_task()"
```

---

### Task 6: Write Tools (10 tools)

**Files:**
- Create: `backend/apps/calendar/tools.py`
- Reference: `backend/apps/todo/tools.py` for descriptions

**Step 1: Create all 10 tools**

```python
"""Calendar plugin LangGraph tools."""

from datetime import datetime
from typing import Literal

from langchain_core.tools import tool

from apps.calendar.service import calendar_service
from shared.agent_context import get_user_context
from shared.tool_results import safe_tool_call


# ─── Core Event Tools ─────────────────────────────────────────────────────────

@tool
async def calendar_list_events(
    start: str | None = None,
    end: str | None = None,
    calendar_id: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """
    List calendar events with optional time range and calendar filters.

    Use when:
    - User asks to see their calendar
    - "What's on my schedule?"
    - "Show me events for next week"

    Args:
        start: Start datetime in ISO format (optional, default: now)
        end: End datetime in ISO format (optional)
        calendar_id: Filter by specific calendar (optional)
        limit: Max events to return (default 100)

    Returns:
        List of events with id, title, start/end times, type

    Examples:
        - "What's on my calendar today?" → start="today", end="today+1day"
        - "Show work events" → calendar_id="work_calendar_id"
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()
        start_dt = datetime.fromisoformat(start) if start else datetime.utcnow()
        end_dt = datetime.fromisoformat(end) if end else None
        return await calendar_service.list_events(user_id, start_dt, end_dt, calendar_id, limit)

    return await safe_tool_call(operation, action="listing events")


@tool
async def calendar_search_events(
    query: str,
    limit: int = 20,
) -> list[dict]:
    """
    Search events by title, description, or location.

    Use when:
    - User wants to find a specific event
    - "Find my meeting with John"
    - "Search for dentist appointment"

    Args:
        query: Search term (searches title, description, location)
        limit: Max results (default 20)

    Returns:
        List of matching events
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()
        return await calendar_service.search_events(user_id, query, limit)

    return await safe_tool_call(operation, action="searching events")


@tool
async def calendar_get_event(event_id: str) -> dict:
    """
    Get full details of a single event.

    Use when:
    - User asks about a specific event by ID
    - Need complete event info including attendees, reminders

    Args:
        event_id: Event unique identifier

    Returns:
        Complete event details

    Errors:
        NOT_FOUND: Event ID does not exist
    """
    async def operation() -> dict:
        user_id = get_user_context()
        event = await calendar_service.get_event(event_id, user_id)
        if not event:
            raise ValueError(f"Event '{event_id}' not found")
        return event

    return await safe_tool_call(operation, action="getting event")


@tool
async def calendar_create_event(
    title: str,
    start: str,
    end: str,
    calendar_id: str,
    description: str | None = None,
    location: str | None = None,
    is_all_day: bool = False,
    type_: Literal["event", "time_blocked_task"] = "event",
    task_id: str | None = None,
    color: str | None = None,
    reminders: list[int] | None = None,
) -> dict:
    """
    Create a new calendar event with optional conflict detection.

    Use when:
    - User wants to add an event to their calendar
    - "Schedule a meeting tomorrow 2pm"
    - "Add dentist appointment next Friday"

    IMPORTANT: Before creating, consider checking conflicts with calendar_check_conflicts
    to warn user about overlapping events.

    Args:
        title: Event name (required)
        start: Start datetime ISO format (required)
        end: End datetime ISO format (required, must be after start)
        calendar_id: Which calendar (required)
        description: Event details (optional)
        location: Where it happens (optional)
        is_all_day: All-day event flag (default: False)
        type_: "event" (default) or "time_blocked_task"
        task_id: If type="time_blocked_task", link to Todo task ID
        color: Custom color override (optional)
        reminders: Minutes before to remind [15, 60] (optional)

    Returns:
        Created event with id

    Errors:
        INVALID_TIME: End must be after start
        CALENDAR_NOT_FOUND: Invalid calendar_id
    """
    async def operation() -> dict:
        user_id = get_user_context()
        start_dt = datetime.fromisoformat(start)
        end_dt = datetime.fromisoformat(end)
        return await calendar_service.create_event(
            user_id, title, start_dt, end_dt, calendar_id,
            description, location, is_all_day, type_, task_id, color, reminders
        )

    return await safe_tool_call(operation, action="creating event")


@tool
async def calendar_update_event(
    event_id: str,
    title: str | None = None,
    start: str | None = None,
    end: str | None = None,
    calendar_id: str | None = None,
    description: str | None = None,
    location: str | None = None,
    color: str | None = None,
    reminders: list[int] | None = None,
) -> dict:
    """
    Update an existing event's details.

    Use when:
    - User wants to change event details
    - "Move my meeting to 3pm"
    - "Change the location"

    Args:
        event_id: Event to update (required)
        title, start, end, etc.: New values (only provided fields updated)

    Returns:
        Updated event details

    Note: If changing time, consider checking conflicts first.
    """
    async def operation() -> dict:
        user_id = get_user_context()
        kwargs = {"title": title, "description": description, "location": location, "color": color, "reminders": reminders}
        if start:
            kwargs["start_datetime"] = datetime.fromisoformat(start)
        if end:
            kwargs["end_datetime"] = datetime.fromisoformat(end)
        if calendar_id:
            kwargs["calendar_id"] = calendar_id
        # Remove None values
        kwargs = {k: v for k, v in kwargs.items() if v is not None}
        return await calendar_service.update_event(event_id, user_id, **kwargs)

    return await safe_tool_call(operation, action="updating event")


@tool
async def calendar_delete_event(event_id: str) -> dict:
    """
    Delete an event permanently.

    Use when:
    - User wants to cancel/remove an event
    - "Delete my meeting tomorrow"

    Args:
        event_id: Event to delete

    Returns:
        Success confirmation

    Warning: Cannot be undone.
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await calendar_service.delete_event(event_id, user_id)

    return await safe_tool_call(operation, action="deleting event")


@tool
async def calendar_check_conflicts(
    start: str,
    end: str,
    exclude_event_id: str | None = None,
) -> list[dict]:
    """
    Check for conflicting events in a time range.

    Use when:
    - Before creating/updating an event to warn about conflicts
    - "Am I free at 2pm?"
    - "Check if I have anything at that time"

    Args:
        start: Start datetime ISO format
        end: End datetime ISO format
        exclude_event_id: Event to exclude (when checking update)

    Returns:
        List of conflicting events (empty if no conflicts)

    Examples:
        - Before creating: Check conflicts → if found, warn user
        - "Check my availability Friday afternoon"
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()
        start_dt = datetime.fromisoformat(start)
        end_dt = datetime.fromisoformat(end)
        return await calendar_service.check_conflicts(user_id, start_dt, end_dt, exclude_event_id)

    return await safe_tool_call(operation, action="checking conflicts")


# ─── Calendar Management ───────────────────────────────────────────────────────

@tool
async def calendar_list_calendars() -> list[dict]:
    """
    List all user's calendars.

    Use when:
    - User asks about their calendars
    - Need to show available calendars for creating events
    - "What calendars do I have?"

    Returns:
        List of calendars with id, name, color, is_default
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()
        return await calendar_service.list_calendars(user_id)

    return await safe_tool_call(operation, action="listing calendars")


# ─── Recurring Events ─────────────────────────────────────────────────────────

@tool
async def calendar_create_recurring(
    event_id: str,
    frequency: Literal["daily", "weekly", "monthly", "yearly"],
    interval: int = 1,
    days_of_week: list[int] | None = None,
    end_date: str | None = None,
    max_occurrences: int | None = None,
) -> dict:
    """
    Make an event repeat automatically (recurring).

    Use when:
    - User wants an event to repeat
    - "Make this a weekly meeting"
    - "Repeat daily for 30 days"

    Args:
        event_id: Event to use as template (required)
        frequency: How often - "daily", "weekly", "monthly", "yearly"
        interval: Every N frequencies (default: 1)
        days_of_week: For weekly - which days [0=Monday, 6=Sunday]
        end_date: When to stop repeating (ISO format, optional)
        max_occurrences: Max times to repeat (optional)

    Returns:
        Created recurring rule

    Examples:
        - "Weekly team meeting on Mondays" → frequency="weekly", days_of_week=[0]
        - "Daily for 2 weeks" → frequency="daily", max_occurrences=14
    """
    async def operation() -> dict:
        user_id = get_user_context()
        end_dt = datetime.fromisoformat(end_date) if end_date else None
        return await calendar_service.create_recurring_rule(
            user_id, event_id, frequency, interval, days_of_week, end_dt, max_occurrences
        )

    return await safe_tool_call(operation, action="creating recurring rule")


@tool
async def calendar_stop_recurring(rule_id: str) -> dict:
    """
    Stop an event from repeating (deactivate recurring rule).

    Use when:
    - User wants to cancel future occurrences
    - "Stop my daily reminder"
    - "Cancel the recurring meeting"

    Args:
        rule_id: Recurring rule to stop

    Returns:
        Stopped rule details

    Note: Existing occurrences remain, future ones won't be created.
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await calendar_service.stop_recurring_rule(rule_id, user_id)

    return await safe_tool_call(operation, action="stopping recurring rule")


# ─── Todo Integration ───────────────────────────────────────────────────────

@tool
async def calendar_schedule_task(
    task_id: str,
    start: str,
    duration_minutes: int,
    calendar_id: str | None = None,
) -> dict:
    """
    Schedule a Todo task as a time-blocked event on the calendar.

    Use when:
    - User wants to block time for a task
    - "Schedule my Write Report task for Friday 9am"
    - "Block 2 hours for the project task"

    This creates an Event with type="time_blocked_task" linked to the Todo task.

    Args:
        task_id: Todo task ID to schedule
        start: Start datetime ISO format
        duration_minutes: How long to block (15-480 min)
        calendar_id: Which calendar (optional, uses default if not provided)

    Returns:
        Created event with task reference

    Examples:
        - "Schedule Write Report for tomorrow 9am, 2 hours"
          → task_id="...", start="2025-04-02T09:00", duration_minutes=120
    """
    async def operation() -> dict:
        user_id = get_user_context()
        start_dt = datetime.fromisoformat(start)
        return await calendar_service.schedule_task(
            user_id, task_id, start_dt, duration_minutes, calendar_id
        )

    return await safe_tool_call(operation, action="scheduling task")
```

**Step 2: Commit**

```bash
git add backend/apps/calendar/tools.py
git commit -m "feat(calendar): add 10 LangGraph tools

- calendar_list_events, calendar_search_events, calendar_get_event
- calendar_create_event, calendar_update_event, calendar_delete_event
- calendar_check_conflicts (for availability checking)
- calendar_list_calendars
- calendar_create_recurring, calendar_stop_recurring
- calendar_schedule_task (Todo integration)"
```

---

### Task 7: Write Routes

**Files:**
- Create: `backend/apps/calendar/routes.py`
- Reference: `backend/apps/todo/routes.py`

**Step 1: Create routes**

```python
"""Calendar plugin FastAPI routes."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from apps.calendar.schemas import (
    CreateCalendarRequest,
    CreateEventRequest,
    CreateRecurringRuleRequest,
    ScheduleTaskRequest,
    UpdateCalendarRequest,
    UpdateEventRequest,
)
from apps.calendar.service import calendar_service
from core.auth import get_current_user
from shared.schemas import PreferenceUpdate, WidgetPreferenceSchema
from beanie import PydanticObjectId
from core.models import WidgetPreference

router = APIRouter()


# ─── Widgets ──────────────────────────────────────────────────────────────────

@router.get("/widgets")
async def list_widgets():
    from apps.calendar.manifest import calendar_manifest
    return calendar_manifest.widgets


# ─── Events ───────────────────────────────────────────────────────────────────

@router.get("/events")
async def list_events(
    user_id: str = Depends(get_current_user),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    calendar_id: str | None = Query(None),
    limit: int = Query(100, le=500),
):
    """List events with optional filters."""
    return await calendar_service.list_events(user_id, start, end, calendar_id, limit)


@router.get("/events/search")
async def search_events(
    q: str,
    user_id: str = Depends(get_current_user),
    limit: int = Query(20, le=100),
):
    """Search events by query."""
    return await calendar_service.search_events(user_id, q, limit)


@router.get("/events/{event_id}")
async def get_event(event_id: str, user_id: str = Depends(get_current_user)):
    """Get single event."""
    event = await calendar_service.get_event(event_id, user_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.post("/events")
async def create_event(
    request: CreateEventRequest,
    user_id: str = Depends(get_current_user),
):
    """Create new event."""
    try:
        return await calendar_service.create_event(
            user_id,
            request.title,
            request.start_datetime,
            request.end_datetime,
            request.calendar_id,
            request.description,
            request.location,
            request.is_all_day,
            request.type,
            request.task_id,
            request.color,
            request.reminders,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/events/{event_id}")
async def update_event(
    event_id: str,
    request: UpdateEventRequest,
    user_id: str = Depends(get_current_user),
):
    """Update event."""
    try:
        kwargs = {}
        if request.title is not None:
            kwargs["title"] = request.title
        if request.start_datetime is not None:
            kwargs["start_datetime"] = request.start_datetime
        if request.end_datetime is not None:
            kwargs["end_datetime"] = request.end_datetime
        if request.calendar_id is not None:
            kwargs["calendar_id"] = request.calendar_id
        if request.description is not None:
            kwargs["description"] = request.description
        if request.location is not None:
            kwargs["location"] = request.location
        if request.color is not None:
            kwargs["color"] = request.color
        if request.reminders is not None:
            kwargs["reminders"] = request.reminders
        return await calendar_service.update_event(event_id, user_id, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/events/{event_id}")
async def delete_event(event_id: str, user_id: str = Depends(get_current_user)):
    """Delete event."""
    try:
        return await calendar_service.delete_event(event_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Conflicts ────────────────────────────────────────────────────────────────

@router.get("/conflicts/check")
async def check_conflicts(
    start: datetime,
    end: datetime,
    exclude_event_id: str | None = Query(None),
    user_id: str = Depends(get_current_user),
):
    """Check for conflicting events."""
    return await calendar_service.check_conflicts(user_id, start, end, exclude_event_id)


# ─── Calendars ──────────────────────────────────────────────────────────────

@router.get("/calendars")
async def list_calendars(user_id: str = Depends(get_current_user)):
    """List all calendars."""
    return await calendar_service.list_calendars(user_id)


@router.post("/calendars")
async def create_calendar(
    request: CreateCalendarRequest,
    user_id: str = Depends(get_current_user),
):
    """Create new calendar."""
    try:
        return await calendar_service.create_calendar(user_id, request.name, request.color)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/calendars/{calendar_id}")
async def update_calendar(
    calendar_id: str,
    request: UpdateCalendarRequest,
    user_id: str = Depends(get_current_user),
):
    """Update calendar."""
    try:
        kwargs = {}
        if request.name is not None:
            kwargs["name"] = request.name
        if request.color is not None:
            kwargs["color"] = request.color
        if request.is_visible is not None:
            kwargs["is_visible"] = request.is_visible
        if request.is_default is not None:
            kwargs["is_default"] = request.is_default
        return await calendar_service.update_calendar(calendar_id, user_id, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/calendars/{calendar_id}")
async def delete_calendar(calendar_id: str, user_id: str = Depends(get_current_user)):
    """Delete calendar and all its events."""
    try:
        return await calendar_service.delete_calendar(calendar_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Recurring ────────────────────────────────────────────────────────────────

@router.post("/events/{event_id}/recurring")
async def create_recurring(
    event_id: str,
    request: CreateRecurringRuleRequest,
    user_id: str = Depends(get_current_user),
):
    """Make event recurring."""
    try:
        return await calendar_service.create_recurring_rule(
            user_id, event_id, request.frequency, request.interval,
            request.days_of_week, request.end_date, request.max_occurrences
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/recurring")
async def list_recurring_rules(user_id: str = Depends(get_current_user)):
    """List recurring rules."""
    return await calendar_service.list_recurring_rules(user_id)


@router.patch("/recurring/{rule_id}/stop")
async def stop_recurring(
    rule_id: str,
    user_id: str = Depends(get_current_user),
):
    """Stop recurring rule."""
    try:
        return await calendar_service.stop_recurring_rule(rule_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Todo Integration ─────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/schedule")
async def schedule_task(
    task_id: str,
    request: ScheduleTaskRequest,
    user_id: str = Depends(get_current_user),
):
    """Schedule Todo task as time-blocked event."""
    try:
        return await calendar_service.schedule_task(
            user_id, task_id, request.start_datetime, request.duration_minutes, request.calendar_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Preferences ──────────────────────────────────────────────────────────────

@router.get("/preferences")
async def get_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == "calendar",
    ).to_list()
    return [
        WidgetPreferenceSchema(
            id=str(p.id),
            user_id=str(p.user_id),
            widget_id=p.widget_id,
            app_id=p.app_id,
            enabled=p.enabled,
            position=p.position,
            config=p.config,
        )
        for p in prefs
    ]


@router.put("/preferences")
async def update_preferences(
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    for u in updates:
        pref = await WidgetPreference.find_one(
            WidgetPreference.user_id == PydanticObjectId(user_id),
            WidgetPreference.app_id == "calendar",
            WidgetPreference.widget_id == u.widget_id,
        )
        if pref:
            if u.enabled is not None:
                pref.enabled = u.enabled
            if u.position is not None:
                pref.position = u.position
            if u.config is not None:
                pref.config = u.config
            await pref.save()
    return await get_preferences(user_id)
```

**Step 2: Commit**

```bash
git add backend/apps/calendar/routes.py
git commit -m "feat(calendar): add API routes

- Events CRUD with search and conflict check
- Calendars management
- Recurring rules endpoints
- Todo integration route /tasks/{id}/schedule"
```

---

### Task 8: Write Agent

**Files:**
- Create: `backend/apps/calendar/agent.py`
- Reference: `backend/apps/todo/agent.py`

**Step 1: Create agent**

```python
"""Calendar plugin LangGraph agent."""

from langchain_core.tools import BaseTool

from apps.calendar.prompts import get_calendar_prompt
from apps.calendar.service import calendar_service
from apps.calendar.tools import (
    calendar_check_conflicts,
    calendar_create_event,
    calendar_create_recurring,
    calendar_delete_event,
    calendar_get_event,
    calendar_list_calendars,
    calendar_list_events,
    calendar_schedule_task,
    calendar_search_events,
    calendar_stop_recurring,
    calendar_update_event,
)
from core.agents.base_app import BaseAppAgent
from shared.agent_context import set_user_context


class CalendarAgent(BaseAppAgent):
    """Calendar app child agent used by the root orchestrator."""

    app_id = "calendar"

    def tools(self) -> list[BaseTool]:
        return [
            # Event tools
            calendar_list_events,
            calendar_search_events,
            calendar_get_event,
            calendar_create_event,
            calendar_update_event,
            calendar_delete_event,
            calendar_check_conflicts,
            # Calendar tools
            calendar_list_calendars,
            # Recurring tools
            calendar_create_recurring,
            calendar_stop_recurring,
            # Integration
            calendar_schedule_task,
        ]

    def build_prompt(self) -> str:
        return get_calendar_prompt()

    async def on_install(self, user_id: str) -> None:
        set_user_context(user_id)
        await calendar_service.on_install(user_id)

    async def on_uninstall(self, user_id: str) -> None:
        set_user_context(user_id)
        await calendar_service.on_uninstall(user_id)
```

**Step 2: Commit**

```bash
git add backend/apps/calendar/agent.py
git commit -m "feat(calendar): add CalendarAgent with 10 tools registered"
```

---

### Task 9: Write Prompts

**Files:**
- Create: `backend/apps/calendar/prompts.py`

**Step 1: Create prompts**

```python
"""System prompts for the calendar child agent."""

from datetime import datetime


def get_calendar_prompt() -> str:
    now = datetime.utcnow()
    current_date = now.strftime("%Y-%m-%d")
    current_time = now.strftime("%H:%M")

    return f"""<identity>
You are the Calendar app agent inside Superin.
You help users manage events, schedule time, and organize their calendar.

Current Date: {current_date}
Current Time: {current_time}
</identity>

<instructions>
- Always check for conflicts before creating or moving events
- Warn users about overlapping events and ask for confirmation
- Use calendar_list_calendars first if user doesn't specify which calendar
- Default to the user's default calendar if available
- Keep responses concise and action-oriented
</instructions>

<workflow_examples>
Creating an event:
1. Check conflicts with calendar_check_conflicts
2. If conflicts found: warn user and ask to confirm
3. If no conflicts: create with calendar_create_event

Scheduling a Todo task:
1. Get available calendars with calendar_list_calendars
2. Ask which calendar (or use default)
3. Schedule with calendar_schedule_task
4. Confirm the time block was created

Checking availability:
1. Use calendar_check_conflicts for the time range
2. Present conflicts if any
3. Suggest alternative times if needed
</workflow_examples>

<recurring_examples>
Weekly meeting on Mondays:
→ frequency="weekly", days_of_week=[0]

Daily for 30 days:
→ frequency="daily", max_occurrences=30

Monthly on first day:
→ frequency="monthly", interval=1
</recurring_examples>
"""
```

**Step 2: Commit**

```bash
git add backend/apps/calendar/prompts.py
git commit -m "feat(calendar): add system prompts with date context"
```

---

### Task 10: Write Manifest

**Files:**
- Create: `backend/apps/calendar/manifest.py`

**Step 1: Create manifest**

```python
"""Calendar plugin manifest."""

from shared.schemas import (
    AppManifestSchema,
    ConfigFieldSchema,
    WidgetManifestSchema,
)


month_view_widget = WidgetManifestSchema(
    id="calendar.month-view",
    name="Month View",
    description="Full month calendar grid with events",
    icon="Calendar",
    size="wide",
    config_fields=[
        ConfigFieldSchema(
            name="default_calendar",
            label="Default Calendar",
            type="select",
            required=False,
            options_source="calendar.calendars",
        ),
        ConfigFieldSchema(
            name="show_time_blocked_tasks",
            label="Show Scheduled Tasks",
            type="boolean",
            default=True,
        ),
    ],
)

upcoming_widget = WidgetManifestSchema(
    id="calendar.upcoming",
    name="Upcoming Events",
    description="List of next 5-10 upcoming events",
    icon="Clock",
    size="standard",
    config_fields=[
        ConfigFieldSchema(
            name="max_items",
            label="Max Events",
            type="number",
            default=5,
        ),
        ConfigFieldSchema(
            name="calendar_filter",
            label="Filter by Calendar",
            type="select",
            required=False,
            options_source="calendar.calendars",
        ),
    ],
)

day_summary_widget = WidgetManifestSchema(
    id="calendar.day-summary",
    name="Day Summary",
    description="Today and tomorrow overview",
    icon="Sun",
    size="compact",
    config_fields=[],
)

calendar_manifest = AppManifestSchema(
    id="calendar",
    name="Calendar",
    version="1.0.0",
    description="Manage events, schedule time, and organize your calendar with Todo integration",
    icon="Calendar",
    color="oklch(0.70 0.18 250)",  # Blue-ish
    widgets=[month_view_widget, upcoming_widget, day_summary_widget],
    agent_description="Helps users create events, check availability, schedule recurring events, and time-block Todo tasks.",
    tools=[
        "calendar_list_events",
        "calendar_search_events",
        "calendar_get_event",
        "calendar_create_event",
        "calendar_update_event",
        "calendar_delete_event",
        "calendar_check_conflicts",
        "calendar_list_calendars",
        "calendar_create_recurring",
        "calendar_stop_recurring",
        "calendar_schedule_task",
    ],
    models=["Event", "Calendar", "RecurringRule"],
    category="productivity",
    tags=["calendar", "events", "schedule", "time-blocking", "recurring"],
    author="Shin Team",
)
```

**Step 2: Commit**

```bash
git add backend/apps/calendar/manifest.py
git commit -m "feat(calendar): add app manifest with 3 widgets

- month-view (wide): Full month grid
- upcoming (standard): Next 5-10 events
- day-summary (compact): Today + tomorrow"
```

---

### Task 11: Write __init__.py

**Files:**
- Modify: `backend/apps/calendar/__init__.py`
- Reference: `backend/apps/todo/__init__.py`

**Step 1: Create __init__.py**

```python
"""Calendar plugin registration — auto-discovered at startup."""

from core.registry import register_plugin
from apps.calendar.manifest import calendar_manifest
from apps.calendar.agent import CalendarAgent
from apps.calendar.routes import router
from apps.calendar.models import Event, Calendar, RecurringRule

register_plugin(
    manifest=calendar_manifest,
    agent_class=CalendarAgent,
    router=router,
    models=[Event, Calendar, RecurringRule],
)
```

**Step 2: Commit**

```bash
git add backend/apps/calendar/__init__.py
git commit -m "feat(calendar): register plugin with core registry

- Exports Event, Calendar, RecurringRule models
- Registers agent_class, router, manifest"
```

---

### Task 12: Final Integration Test

**Step 1: Verify all imports work**

```bash
cd /home/linh/Downloads/superin/backend
python -c "
from apps.calendar import Event, Calendar, RecurringRule
from apps.calendar.agent import CalendarAgent
from apps.calendar.manifest import calendar_manifest
from apps.calendar.service import calendar_service
print('✅ All imports successful')
"
```

Expected: "✅ All imports successful"

**Step 2: Run ruff check**

```bash
cd /home/linh/Downloads/superin
ruff check backend/apps/calendar/
```

Expected: No errors

**Step 3: Final commit**

```bash
git add backend/apps/calendar/
git commit -m "feat(calendar): complete Calendar App implementation

Full Calendar App with:
- 3 models: Event, Calendar, RecurringRule
- 10 tools: full CRUD + conflict check + Todo integration
- 3 widgets: month-view, upcoming, day-summary
- Todo integration via calendar_schedule_task
- Conflict detection
- Recurring events (daily, weekly, monthly, yearly)

All ruff checks passing."
```

---

## Summary

**Total Tasks:** 12
**Estimated Time:** 60-90 minutes
**Lines of Code:** ~1500

**Key Files Created:**
- `models.py` - 3 models with indexes
- `repository.py` - 3 repositories with conflict detection
- `service.py` - Business logic with install/uninstall hooks
- `tools.py` - 10 LangGraph tools
- `routes.py` - Full API endpoints
- `agent.py` - Agent registration
- `prompts.py` - System prompts
- `manifest.py` - App manifest with widgets

**Tool Count:** 10 (following consolidation principle)
- Core: list, search, get, create, update, delete
- Utility: check_conflicts, list_calendars
- Recurring: create_recurring, stop_recurring
- Integration: schedule_task

**Ready for:** superpowers:executing-plans or superpowers:subagent-driven-development
