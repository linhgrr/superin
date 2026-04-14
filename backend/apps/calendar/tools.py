"""Calendar plugin LangGraph tools - Consolidated Design.

Following tool design principles:
- Consolidate related operations (create + conflict check)
- Split by workflow (reschedule vs edit metadata)
- Clear examples in docstrings
- Return structured data for agent decision-making
"""

from datetime import datetime

from langchain_core.tools import tool

from apps.calendar.enums import EventType, RecurrenceFrequency
from apps.calendar.service import calendar_service
from core.utils.timezone import ensure_aware_utc
from shared.agent_context import get_user_context
from shared.tool_results import safe_tool_call

# ═══════════════════════════════════════════════════════════════════════════════
# EVENT MANAGEMENT - CONSOLIDATED
# ═══════════════════════════════════════════════════════════════════════════════

@tool("calendar_schedule_event")
async def calendar_schedule_event(
    title: str,
    start: str,
    end: str,
    calendar_id: str,
    description: str | None = None,
    location: str | None = None,
    is_all_day: bool = False,
    type_: EventType = "event",
    task_id: str | None = None,
    color: str | None = None,
    reminders: list[int] | None = None,
    allow_conflicts: bool = False,
) -> dict:
    """
    Create a calendar event with automatic conflict detection.

    Use when:
    - User wants to schedule/schedule anything
    - "Schedule a meeting tomorrow 2pm"
    - "Add dentist appointment next Friday"
    - "Block 2 hours for the project"

    This tool automatically checks for conflicts BEFORE creating. It returns:
    - The created event (if no conflicts or allow_conflicts=True)
    - List of conflicting events (if any found)

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
        allow_conflicts: If True, create even with conflicts (default: False)

    Returns:
        {
            "success": True,
            "event": {...},
            "conflicts": [...],  # Empty if no conflicts
            "had_conflicts": False  # True if conflicts were detected
        }

    Examples:
        - "Schedule meeting tomorrow 2-3pm":
          → start="2025-04-02T14:00", end="2025-04-02T15:00", calendar_id="..."

        - "Add lunch with John Friday" (if busy, will warn about conflicts):
          → title="Lunch with John", start="...", end="..."
          → Tool returns conflicts, agent asks user to confirm
    """
    async def operation() -> dict:
        user_id = get_user_context()
        start_dt = ensure_aware_utc(datetime.fromisoformat(start))
        end_dt = ensure_aware_utc(datetime.fromisoformat(end))

        # Check for conflicts first
        conflicts = await calendar_service.check_conflicts(
            user_id, start_dt, end_dt, exclude_event_id=None
        )

        if conflicts and not allow_conflicts:
            # Return conflicts without creating - let agent decide
            return {
                "success": False,
                "event": None,
                "conflicts": conflicts,
                "had_conflicts": True,
                "message": f"Found {len(conflicts)} conflicting events. Set allow_conflicts=True to schedule anyway."
            }

        # No conflicts or user allows conflicts - create the event
        event = await calendar_service.create_event(
            user_id=user_id,
            title=title,
            start_datetime=start_dt,
            end_datetime=end_dt,
            calendar_id=calendar_id,
            description=description,
            location=location,
            is_all_day=is_all_day,
            type_=type_,
            task_id=task_id,
            color=color,
            reminders=reminders,
        )

        return {
            "success": True,
            "event": event,
            "conflicts": conflicts if conflicts else [],
            "had_conflicts": len(conflicts) > 0,
        }

    return await safe_tool_call(operation, action="scheduling event")


@tool("calendar_reschedule_event")
async def calendar_reschedule_event(
    event_id: str,
    new_start: str,
    new_end: str,
    allow_conflicts: bool = False,
) -> dict:
    """
    Move an event to a different time/day.

    Use when:
    - User wants to move/change event time
    - "Move my meeting to 3pm"
    - "Reschedule tomorrow's dentist to next week"
    - "Push the standup 30 minutes later"

    Automatically checks for conflicts at the new time. Returns both the
    updated event and any conflicts found.

    Args:
        event_id: Event to reschedule (required)
        new_start: New start datetime ISO format (required)
        new_end: New end datetime ISO format (required)
        allow_conflicts: If True, move even with conflicts (default: False)

    Returns:
        {
            "success": True,
            "event": {...},
            "conflicts": [...],
            "had_conflicts": False
        }

    Examples:
        - "Move my 2pm meeting to 3pm":
          → event_id="...", new_start="2025-04-02T15:00", new_end="2025-04-02T16:00"

        - "Reschedule standup to tomorrow morning":
          → event_id="standup_id", new_start="2025-04-02T09:00", new_end="2025-04-02T09:15"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        new_start_dt = ensure_aware_utc(datetime.fromisoformat(new_start))
        new_end_dt = ensure_aware_utc(datetime.fromisoformat(new_end))

        # Check for conflicts at new time (excluding this event)
        conflicts = await calendar_service.check_conflicts(
            user_id, new_start_dt, new_end_dt, exclude_event_id=event_id
        )

        if conflicts and not allow_conflicts:
            return {
                "success": False,
                "event": None,
                "conflicts": conflicts,
                "had_conflicts": True,
                "message": f"New time conflicts with {len(conflicts)} events. Set allow_conflicts=True to reschedule anyway."
            }

        # Update the event
        updated = await calendar_service.update_event(
            event_id=event_id,
            user_id=user_id,
            start_datetime=new_start_dt,
            end_datetime=new_end_dt,
        )

        return {
            "success": True,
            "event": updated,
            "conflicts": conflicts if conflicts else [],
            "had_conflicts": len(conflicts) > 0,
        }

    return await safe_tool_call(operation, action="rescheduling event")


@tool("calendar_edit_event")
async def calendar_edit_event(
    event_id: str,
    title: str | None = None,
    description: str | None = None,
    location: str | None = None,
    calendar_id: str | None = None,
    color: str | None = None,
    reminders: list[int] | None = None,
) -> dict:
    """
    Edit event metadata (title, description, location, etc.) without changing time.

    Use when:
    - User wants to change event details (NOT time)
    - "Rename meeting to 'Client Call - ABC Corp'"
    - "Add location: Conference Room B"
    - "Change the meeting description"
    - "Move this event to my Work calendar"

    Note: This tool does NOT change event time. Use calendar_reschedule_event
    for time changes (as that requires conflict checking).

    Args:
        event_id: Event to edit (required)
        title: New title (optional)
        description: New description (optional)
        location: New location (optional)
        calendar_id: Move to different calendar (optional)
        color: New color (optional)
        reminders: New reminder minutes [15, 60] (optional)

    Returns:
        Updated event details

    Examples:
        - "Add Zoom link to the description":
          → event_id="...", description="https://zoom.us/j/..."

        - "Change location to Room 302":
          → event_id="...", location="Room 302"
    """
    async def operation() -> dict:
        user_id = get_user_context()

        kwargs = {
            "title": title,
            "description": description,
            "location": location,
            "calendar_id": calendar_id,
            "color": color,
            "reminders": reminders,
        }
        # Remove None values
        kwargs = {k: v for k, v in kwargs.items() if v is not None}

        return await calendar_service.update_event(event_id, user_id, **kwargs)

    return await safe_tool_call(operation, action="editing event")


@tool("calendar_cancel_event")
async def calendar_cancel_event(
    event_id: str,
    permanent: bool = True,
) -> dict:
    """
    Cancel (delete) an event.

    Use when:
    - User wants to cancel/remove an event
    - "Cancel my meeting tomorrow"
    - "Delete the dentist appointment"
    - "Remove that event"

    Args:
        event_id: Event to cancel (required)
        permanent: If True, permanently delete (default: True)
                   If False, mark as cancelled but keep visible

    Returns:
        Success confirmation

    Examples:
        - "Cancel my 2pm": → event_id="..."
        - "Delete the recurring meeting": → event_id="..."
    """
    async def operation() -> dict:
        user_id = get_user_context()
        result = await calendar_service.delete_event(event_id, user_id)
        return {
            "success": True,
            "deleted": result.get("success", True),
            "id": event_id,
        }

    return await safe_tool_call(operation, action="cancelling event")


# ═══════════════════════════════════════════════════════════════════════════════
# EVENT SEARCH & LISTING
# ═══════════════════════════════════════════════════════════════════════════════

@tool("calendar_find_events")
async def calendar_find_events(
    query: str | None = None,
    start: str | None = None,
    end: str | None = None,
    calendar_id: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """
    Find events by search query OR time range OR calendar.

    Use when:
    - User asks to see their calendar
    - "What's on my schedule?"
    - "Find my meeting with John"
    - "Show me events for next week"
    - "What do I have on Friday?"

    This is the primary discovery tool. It combines search + listing:
    - If query provided: searches title/description/location
    - If time range provided: filters by date range
    - If calendar_id provided: filters to that calendar

    Args:
        query: Search term (searches title, description, location)
        start: Start datetime ISO format (optional, for time range)
        end: End datetime ISO format (optional, for time range)
        calendar_id: Filter by specific calendar (optional)
        limit: Max results (default 20)

    Returns:
        List of events with id, title, start/end times, calendar

    Examples:
        - "What's on my calendar today?":
          → start="2025-04-01T00:00", end="2025-04-01T23:59"

        - "Find my meeting with John":
          → query="John"

        - "Show work events next week":
          → calendar_id="work_id", start="2025-04-07", end="2025-04-13"
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()

        # If query provided, do search
        if query:
            return await calendar_service.search_events(user_id, query, limit)

        # Otherwise do time-based listing
        start_dt = ensure_aware_utc(datetime.fromisoformat(start)) if start else None
        end_dt = ensure_aware_utc(datetime.fromisoformat(end)) if end else None
        return await calendar_service.list_events(
            user_id, start_dt, end_dt, calendar_id, limit
        )

    return await safe_tool_call(operation, action="finding events")


# ═══════════════════════════════════════════════════════════════════════════════
# CALENDAR MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

@tool("calendar_list_calendars")
async def calendar_list_calendars() -> list[dict]:
    """
    List all user's calendars.

    Use when:
    - User asks about their calendars
    - Need to show available calendars for creating events
    - "What calendars do I have?"
    - "Show my calendars"

    Returns:
        List of calendars with id, name, color, is_default

    Examples:
        - "What calendars do I have?" → Returns all calendars
        - "Which calendar should I use?" → Call this, then suggest default
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()
        return await calendar_service.list_calendars(user_id)

    return await safe_tool_call(operation, action="listing calendars")


# ═══════════════════════════════════════════════════════════════════════════════
# RECURRING EVENTS
# ═══════════════════════════════════════════════════════════════════════════════

@tool("calendar_make_recurring")
async def calendar_make_recurring(
    event_id: str,
    frequency: RecurrenceFrequency,
    interval: int = 1,
    days_of_week: list[int] | None = None,
    end_date: str | None = None,
    max_occurrences: int | None = None,
) -> dict:
    """
    Make an event repeat automatically (create recurring series).

    Use when:
    - User wants an event to repeat
    - "Make this a weekly meeting"
    - "Repeat daily for 30 days"
    - "This should happen every Monday and Wednesday"

    Args:
        event_id: Event to use as template for the series (required)
        frequency: How often - "daily", "weekly", "monthly", "yearly"
        interval: Every N frequencies (default: 1, e.g., every 2 weeks)
        days_of_week: For weekly - which days [0=Monday, 6=Sunday]
        end_date: When to stop repeating (ISO format, optional)
        max_occurrences: Max times to repeat (optional)

    Returns:
        Created recurring rule details

    Examples:
        - "Weekly team meeting on Mondays":
          → event_id="...", frequency="weekly", days_of_week=[0]

        - "Daily standup for 2 weeks":
          → event_id="...", frequency="daily", max_occurrences=10

        - "Bi-weekly sync":
          → event_id="...", frequency="weekly", interval=2
    """
    async def operation() -> dict:
        user_id = get_user_context()
        end_dt = ensure_aware_utc(datetime.fromisoformat(end_date)) if end_date else None
        return await calendar_service.create_recurring_rule(
            user_id=user_id,
            event_template_id=event_id,
            frequency=frequency,
            interval=interval,
            days_of_week=days_of_week,
            end_date=end_dt,
            max_occurrences=max_occurrences,
        )

    return await safe_tool_call(operation, action="making event recurring")


@tool("calendar_stop_recurring")
async def calendar_stop_recurring(
    rule_id: str,
    keep_past: bool = True,
) -> dict:
    """
    Stop future occurrences of a recurring series.

    Use when:
    - User wants to cancel future occurrences
    - "Stop my daily reminder"
    - "Cancel the recurring meeting starting next week"

    Args:
        rule_id: Recurring rule to stop (required)
        keep_past: If True, keep past occurrences (default: True)

    Returns:
        Stopped rule details

    Note: Past events remain. Only future occurrences are stopped.

    Examples:
        - "Stop the weekly standup": → rule_id="..."
    """
    async def operation() -> dict:
        user_id = get_user_context()
        result = await calendar_service.stop_recurring_rule(rule_id, user_id)
        return {
            "success": True,
            "rule": result,
            "message": "Future occurrences stopped. Past events remain."
        }

    return await safe_tool_call(operation, action="stopping recurring rule")


# ═══════════════════════════════════════════════════════════════════════════════
# TODO INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════════

@tool("calendar_block_task_time")
async def calendar_block_task_time(
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
    - "Put 'Prepare Presentation' on my calendar tomorrow"

    This creates an Event with type="time_blocked_task" linked to the Todo task.
    The event uses the task title as the event title.

    Args:
        task_id: Todo task ID to schedule (required)
        start: Start datetime ISO format (required)
        duration_minutes: How long to block (15-480 min)
        calendar_id: Which calendar (optional, uses default if not provided)

    Returns:
        Created event with task reference

    Examples:
        - "Schedule Write Report for tomorrow 9am, 2 hours":
          → task_id="...", start="2025-04-02T09:00", duration_minutes=120

        - "Block time for Q1 planning Friday afternoon":
          → task_id="q1_planning", start="2025-04-04T14:00", duration_minutes=180
    """
    async def operation() -> dict:
        user_id = get_user_context()
        start_dt = ensure_aware_utc(datetime.fromisoformat(start))
        return await calendar_service.schedule_task(
            user_id=user_id,
            task_id=task_id,
            start_datetime=start_dt,
            duration_minutes=duration_minutes,
            calendar_id=calendar_id,
        )

    return await safe_tool_call(operation, action="blocking task time")
