"""Calendar plugin Beanie document models."""

from __future__ import annotations

from datetime import UTC, datetime

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

from apps.calendar.enums import AttendeeStatus, EventType, RecurrenceFrequency


class Attendee(BaseModel):
    """Basic attendee for events (Phase 2 feature)."""
    email: str
    name: str | None = None
    status: AttendeeStatus = "pending"


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
    type: EventType = "event"
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

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
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

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
    frequency: RecurrenceFrequency
    interval: int = 1  # Every N frequencies
    days_of_week: list[int] | None = None  # 0=Monday for weekly

    # Limits
    end_date: datetime | None = None
    max_occurrences: int | None = None
    occurrence_count: int = 0

    # State
    is_active: bool = True
    last_generated_date: datetime | None = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "calendar_recurring_rules"
        indexes = [
            [("user_id", 1), ("is_active", 1)],
            [("frequency", 1), ("last_generated_date", 1)],
        ]
