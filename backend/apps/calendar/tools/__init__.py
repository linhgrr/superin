"""Calendar plugin LangGraph tools."""

from __future__ import annotations

from apps.calendar.tools import calendars as _calendars
from apps.calendar.tools import events as _events
from apps.calendar.tools import recurring as _recurring
from apps.calendar.tools import tasks as _tasks

# Re-export all tool functions at package level for discoverable imports
calendar_block_task_time = _tasks.calendar_block_task_time
calendar_cancel_event = _events.calendar_cancel_event
calendar_edit_event = _events.calendar_edit_event
calendar_find_events = _events.calendar_find_events
calendar_list_calendars = _calendars.calendar_list_calendars
calendar_make_recurring = _recurring.calendar_make_recurring
calendar_reschedule_event = _events.calendar_reschedule_event
calendar_schedule_event = _events.calendar_schedule_event
calendar_stop_recurring = _recurring.calendar_stop_recurring

__all__ = [
    "calendar_schedule_event",
    "calendar_reschedule_event",
    "calendar_edit_event",
    "calendar_cancel_event",
    "calendar_find_events",
    "calendar_list_calendars",
    "calendar_make_recurring",
    "calendar_stop_recurring",
    "calendar_block_task_time",
]
