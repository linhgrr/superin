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
