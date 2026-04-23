"""Todo integration tools."""

from __future__ import annotations

from typing import Any

from langchain.tools import ToolRuntime
from langchain_core.tools import tool

from apps.calendar.schemas import CalendarEventRead
from apps.calendar.service import calendar_service
from core.agents.runtime_context import AppAgentContext
from shared.tool_results import run_time_aware_tool_with_runtime
from shared.tool_time import ToolTimeContext

CalendarTaskToolResult = CalendarEventRead


@tool("calendar_block_task_time")
async def calendar_block_task_time(
    task_id: str,
    start: str,
    duration_minutes: int,
    calendar_id: str | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> CalendarTaskToolResult:
    """
    Schedule a Todo task as a time-blocked event on the calendar.

    Use when:
    - User wants to block time for a task
    - "Schedule my Write Report task for Friday 9am"
    - "Put 'Prepare Presentation' on my calendar tomorrow"
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        _time_context: ToolTimeContext,
    ) -> CalendarEventRead:
        start_dt = temporal["start"]
        return await calendar_service.schedule_task(
            user_id=user_id,
            task_id=task_id,
            start_datetime=start_dt,
            duration_minutes=duration_minutes,
            calendar_id=calendar_id,
        )

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"start": start},
        temporal_fields={"start": "local_datetime"},
        operation=operation,
    )
