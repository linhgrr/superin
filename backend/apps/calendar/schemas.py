"""Calendar plugin Pydantic request/response schemas."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from apps.calendar.enums import AttendeeStatus, EventType, RecurrenceFrequency


class CalendarCreateEventRequest(BaseModel):
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


class CalendarUpdateEventRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    calendar_id: str | None = None
    description: str | None = None
    location: str | None = None
    is_all_day: bool | None = None
    color: str | None = None
    reminders: list[int] | None = None


class CalendarCreateCalendarRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: str | None = None


class CalendarUpdateCalendarRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    color: str | None = None
    is_visible: bool | None = None
    is_default: bool | None = None


class CalendarCreateRecurringRuleRequest(BaseModel):
    frequency: RecurrenceFrequency
    interval: int = Field(default=1, ge=1, le=52)
    days_of_week: list[int] | None = None  # 0=Monday, 6=Sunday
    end_date: date | None = None
    max_occurrences: int | None = Field(None, ge=1, le=1000)


class CalendarScheduleTaskRequest(BaseModel):
    start_datetime: datetime
    duration_minutes: int = Field(ge=15, le=480)  # 15 min to 8 hours
    calendar_id: str | None = None


class CalendarEventAttendeeRead(BaseModel):
    email: str
    name: str | None = None
    status: AttendeeStatus


class CalendarEventRead(BaseModel):
    id: str
    title: str
    description: str | None = None
    location: str | None = None
    start_datetime: datetime
    end_datetime: datetime
    is_all_day: bool
    timezone: str
    calendar_id: str
    type: EventType
    task_id: str | None = None
    color: str | None = None
    is_recurring: bool
    reminders: list[int] = Field(default_factory=list)
    attendees: list[CalendarEventAttendeeRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class CalendarCalendarRead(BaseModel):
    id: str
    name: str
    color: str
    is_visible: bool
    is_default: bool
    created_at: datetime


class CalendarRecurringRuleRead(BaseModel):
    id: str
    event_template_id: str
    frequency: RecurrenceFrequency
    interval: int
    days_of_week: list[int] | None = None
    end_date: date | None = None
    max_occurrences: int | None = None
    occurrence_count: int
    is_active: bool
    created_at: datetime


class CalendarActionResponse(BaseModel):
    success: bool
    id: str
    message: str | None = None


class CalendarActivitySummaryResponse(BaseModel):
    start_datetime: datetime
    end_datetime: datetime
    created_count: int
    updated_count: int
    scheduled_count: int
    created_events: list[CalendarEventRead] = Field(default_factory=list)
    updated_events: list[CalendarEventRead] = Field(default_factory=list)
    scheduled_events: list[CalendarEventRead] = Field(default_factory=list)
    unsupported_activity: list[str] = Field(default_factory=list)


class MonthViewWidgetConfig(BaseModel):
    default_calendar: str | None = None
    show_time_blocked_tasks: bool = True

class CalendarMonthDaySummary(BaseModel):
    day: int
    event_count: int
    event_titles: list[str] = Field(default_factory=list)


class MonthViewWidgetData(BaseModel):
    month: int
    year: int
    month_label: str
    start_offset: int
    days_in_month: int
    days: list[CalendarMonthDaySummary] = Field(default_factory=list)
    calendars: list[CalendarCalendarRead] = Field(default_factory=list)


class UpcomingWidgetConfig(BaseModel):
    max_items: int = Field(default=5, ge=1, le=10)
    calendar_filter: str | None = None


class UpcomingWidgetData(BaseModel):
    items: list[CalendarEventRead] = Field(default_factory=list)


class DaySummaryWidgetConfig(BaseModel):
    horizon_days: int = Field(default=1, ge=1, le=7)


class DaySummaryWidgetData(BaseModel):
    today_count: int
    next_event: CalendarEventRead | None = None


CalendarWidgetDataResponse = MonthViewWidgetData | UpcomingWidgetData | DaySummaryWidgetData
