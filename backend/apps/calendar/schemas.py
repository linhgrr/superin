"""Calendar plugin Pydantic request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from apps.calendar.enums import EventType, RecurrenceFrequency


class CreateEventRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    start_datetime: datetime
    end_datetime: datetime
    calendar_id: str
    description: str | None = None
    location: str | None = None
    is_all_day: bool = False
    type: EventType = "event"
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
    frequency: RecurrenceFrequency
    interval: int = Field(default=1, ge=1, le=52)
    days_of_week: list[int] | None = None  # 0=Monday, 6=Sunday
    end_date: datetime | None = None
    max_occurrences: int | None = Field(None, ge=1, le=1000)


class ScheduleTaskRequest(BaseModel):
    task_id: str
    start_datetime: datetime
    duration_minutes: int = Field(ge=15, le=480)  # 15 min to 8 hours
    calendar_id: str | None = None
