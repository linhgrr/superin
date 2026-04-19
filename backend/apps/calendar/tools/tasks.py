"""Todo integration tools."""

from __future__ import annotations

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from apps.calendar.service import calendar_service
from shared.tool_results import run_time_aware_tool_with_user


@tool("calendar_block_task_time")
async def calendar_block_task_time(
    task_id: str,
    start: str,
    duration_minutes: int,
    config: RunnableConfig,
    calendar_id: str | None = None,
) -> dict:
    """
    Schedule a Todo task as a time-blocked event on the calendar.

    Use when:
    - User wants to block time for a task
    - "Schedule my Write Report task for Friday 9am"
    - "Put 'Prepare Presentation' on my calendar tomorrow"
    """
    async def operation(user_id: str, temporal: dict, _time_context) -> dict:
        start_dt = temporal["start"]
        return await calendar_service.schedule_task(
            user_id=user_id,
            task_id=task_id,
            start_datetime=start_dt,
            duration_minutes=duration_minutes,
            calendar_id=calendar_id,
        )

    return await run_time_aware_tool_with_user(
        config,
        action="blocking task time",
        payload={"start": start},
        temporal_fields={"start": "local_datetime"},
        operation=operation,
    )
