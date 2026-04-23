"""Mappings from calendar persistence models to response schemas."""

from apps.calendar.models import Calendar, Event, RecurringRule
from apps.calendar.schemas import (
    CalendarCalendarRead,
    CalendarEventAttendeeRead,
    CalendarEventRead,
    CalendarRecurringRuleRead,
)


def event_to_read(event: Event) -> CalendarEventRead:
    return CalendarEventRead(
        id=str(event.id),
        title=event.title,
        description=event.description,
        location=event.location,
        start_datetime=event.start_datetime,
        end_datetime=event.end_datetime,
        is_all_day=event.is_all_day,
        timezone=event.timezone,
        calendar_id=str(event.calendar_id),
        type=event.type,
        task_id=str(event.task_id) if event.task_id else None,
        color=event.color,
        is_recurring=event.is_recurring,
        reminders=event.reminders,
        attendees=[
            CalendarEventAttendeeRead(
                email=attendee.email,
                name=attendee.name,
                status=attendee.status,
            )
            for attendee in event.attendees
        ],
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


def calendar_to_read(calendar: Calendar) -> CalendarCalendarRead:
    return CalendarCalendarRead(
        id=str(calendar.id),
        name=calendar.name,
        color=calendar.color,
        is_visible=calendar.is_visible,
        is_default=calendar.is_default,
        created_at=calendar.created_at,
    )


def recurring_rule_to_read(rule: RecurringRule) -> CalendarRecurringRuleRead:
    return CalendarRecurringRuleRead(
        id=str(rule.id),
        event_template_id=str(rule.event_template_id),
        frequency=rule.frequency,
        interval=rule.interval,
        days_of_week=rule.days_of_week,
        end_date=rule.end_date,
        max_occurrences=rule.max_occurrences,
        occurrence_count=rule.occurrence_count,
        is_active=rule.is_active,
        created_at=rule.created_at,
    )
