"""Todo integration tools."""

from __future__ import annotations

from datetime import datetime

from langchain_core.tools import tool

from apps.calendar.service import calendar_service
from core.utils.timezone import ensure_aware_utc
from shared.agent_context import get_user_context
from shared.tool_results import safe_tool_call


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
    - "Put 'Prepare Presentation' on my calendar tomorrow"
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
