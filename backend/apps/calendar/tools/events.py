"""Calendar event tools."""

from __future__ import annotations

from typing import Any, NotRequired, TypedDict

from langchain.tools import ToolRuntime
from langchain_core.tools import tool

from apps.calendar.enums import EventType
from apps.calendar.schemas import CalendarEventRead
from apps.calendar.service import calendar_service
from core.agents.runtime_context import AppAgentContext
from shared.tool_results import (
    run_time_aware_tool_with_runtime,
    run_tool_with_runtime,
)
from shared.tool_time import ToolTimeContext


class CalendarEventConflictPayload(TypedDict):
    success: bool
    event: CalendarEventRead | None
    conflicts: list[CalendarEventRead]
    had_conflicts: bool
    message: NotRequired[str]


class CalendarCancelEventPayload(TypedDict):
    success: bool
    deleted: bool
    id: str


CalendarEventToolResult = (
    CalendarEventConflictPayload
    | CalendarCancelEventPayload
    | CalendarEventRead
    | list[CalendarEventRead]
)


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
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> CalendarEventToolResult:
    """
    Create a calendar event with automatic conflict detection.

    Use when:
    - User wants to schedule anything
    - "Schedule a meeting tomorrow 2pm"
    - "Add dentist appointment next Friday"
    - "Block 2 hours for the project"

    Returns created event or list of conflicts (if any).
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        _time_context: ToolTimeContext,
    ) -> CalendarEventConflictPayload:
        start_dt = temporal["start"]
        end_dt = temporal["end"]

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

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"start": start, "end": end},
        temporal_fields={"start": "local_datetime", "end": "local_datetime"},
        operation=operation,
    )


@tool("calendar_reschedule_event")
async def calendar_reschedule_event(
    event_id: str,
    new_start: str,
    new_end: str,
    allow_conflicts: bool = False,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> CalendarEventToolResult:
    """
    Move an event to a different time/day.

    Use when:
    - User wants to move/change event time
    - "Move my meeting to 3pm"
    - "Reschedule tomorrow's dentist to next week"
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        _time_context: ToolTimeContext,
    ) -> CalendarEventConflictPayload:
        new_start_dt = temporal["new_start"]
        new_end_dt = temporal["new_end"]

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

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"new_start": new_start, "new_end": new_end},
        temporal_fields={"new_start": "local_datetime", "new_end": "local_datetime"},
        operation=operation,
    )


@tool("calendar_edit_event")
async def calendar_edit_event(
    event_id: str,
    title: str | None = None,
    description: str | None = None,
    location: str | None = None,
    calendar_id: str | None = None,
    color: str | None = None,
    reminders: list[int] | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> CalendarEventToolResult:
    """
    Edit event metadata (NOT time). Use calendar_reschedule_event for time changes.

    Use when:
    - "Rename meeting to 'Client Call'"
    - "Add location: Conference Room B"
    - "Change the meeting description"
    """
    async def operation(user_id: str) -> CalendarEventRead:
        return await calendar_service.update_event(
            event_id=event_id,
            user_id=user_id,
            title=title,
            calendar_id=calendar_id,
            description=description,
            location=location,
            color=color,
            reminders=reminders,
        )

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("calendar_cancel_event")
async def calendar_cancel_event(
    event_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> CalendarEventToolResult:
    """
    Delete a calendar event permanently.

    Use when:
    - "Cancel my meeting tomorrow"
    - "Delete the dentist appointment"

    Returns:
    - success confirmation with deleted event id

    Limitations:
    - This tool does not support archive or soft-delete semantics.
    """
    async def operation(user_id: str) -> CalendarCancelEventPayload:
        result = await calendar_service.delete_event(event_id, user_id)
        return {
            "success": True,
            "deleted": result.success,
            "id": event_id,
        }

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("calendar_find_events")
async def calendar_find_events(
    query: str | None = None,
    start: str | None = None,
    end: str | None = None,
    calendar_id: str | None = None,
    limit: int = 20,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> CalendarEventToolResult:
    """
    Find events by text search, time range, calendar, or any combination of them.

    Use when:
    - "What's on my schedule?"
    - "Find my meeting with John"
    - "Show me events for next week"
    - "Find meetings with John next week on my work calendar"

    Args:
    - query: Keyword search over title, description, and location
    - start/end: Optional local datetime window to narrow results
    - calendar_id: Optional calendar filter
    - limit: Maximum number of events to return

    Returns:
    - matching events sorted by start time
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        _time_context: ToolTimeContext,
    ) -> list[CalendarEventRead]:
        start_dt = temporal.get("start")
        end_dt = temporal.get("end")
        if query:
            return await calendar_service.search_events(
                user_id,
                query,
                start_dt,
                end_dt,
                calendar_id,
                limit,
            )
        return await calendar_service.list_events(user_id, start_dt, end_dt, calendar_id, limit)

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"start": start, "end": end},
        temporal_fields={"start": "local_datetime", "end": "local_datetime"},
        operation=operation,
    )
