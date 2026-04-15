"""Calendar event tools."""

from __future__ import annotations

from datetime import datetime

from langchain_core.tools import tool

from apps.calendar.service import calendar_service
from core.utils.timezone import ensure_aware_utc
from shared.agent_context import get_user_context
from shared.tool_results import safe_tool_call


@tool("calendar_schedule_event")
async def calendar_schedule_event(
    title: str,
    start: str,
    end: str,
    calendar_id: str,
    description: str | None = None,
    location: str | None = None,
    is_all_day: bool = False,
    type_: str = "event",
    task_id: str | None = None,
    color: str | None = None,
    reminders: list[int] | None = None,
    allow_conflicts: bool = False,
) -> dict:
    """
    Create a calendar event with automatic conflict detection.

    Use when:
    - User wants to schedule anything
    - "Schedule a meeting tomorrow 2pm"
    - "Add dentist appointment next Friday"
    - "Block 2 hours for the project"

    Returns created event or list of conflicts (if any).
    """
    async def operation() -> dict:
        user_id = get_user_context()
        start_dt = ensure_aware_utc(datetime.fromisoformat(start))
        end_dt = ensure_aware_utc(datetime.fromisoformat(end))

        conflicts = await calendar_service.check_conflicts(
            user_id, start_dt, end_dt, exclude_event_id=None
        )

        if conflicts and not allow_conflicts:
            return {
                "success": False,
                "event": None,
                "conflicts": conflicts,
                "had_conflicts": True,
                "message": f"Found {len(conflicts)} conflicting events. Set allow_conflicts=True to schedule anyway.",
            }

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
    """
    async def operation() -> dict:
        user_id = get_user_context()
        new_start_dt = ensure_aware_utc(datetime.fromisoformat(new_start))
        new_end_dt = ensure_aware_utc(datetime.fromisoformat(new_end))

        conflicts = await calendar_service.check_conflicts(
            user_id, new_start_dt, new_end_dt, exclude_event_id=event_id
        )

        if conflicts and not allow_conflicts:
            return {
                "success": False,
                "event": None,
                "conflicts": conflicts,
                "had_conflicts": True,
                "message": f"New time conflicts with {len(conflicts)} events. Set allow_conflicts=True to reschedule anyway.",
            }

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
    Edit event metadata (NOT time). Use calendar_reschedule_event for time changes.

    Use when:
    - "Rename meeting to 'Client Call'"
    - "Add location: Conference Room B"
    - "Change the meeting description"
    """
    async def operation() -> dict:
        user_id = get_user_context()

        kwargs = {
            k: v
            for k, v in {
                "title": title,
                "description": description,
                "location": location,
                "calendar_id": calendar_id,
                "color": color,
                "reminders": reminders,
            }.items()
            if v is not None
        }

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
    - "Cancel my meeting tomorrow"
    - "Delete the dentist appointment"
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
    - "What's on my schedule?"
    - "Find my meeting with John"
    - "Show me events for next week"
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()

        if query:
            return await calendar_service.search_events(user_id, query, limit)

        start_dt = ensure_aware_utc(datetime.fromisoformat(start)) if start else None
        end_dt = ensure_aware_utc(datetime.fromisoformat(end)) if end else None
        return await calendar_service.list_events(user_id, start_dt, end_dt, calendar_id, limit)

    return await safe_tool_call(operation, action="finding events")
