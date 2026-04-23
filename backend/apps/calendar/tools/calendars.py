"""Calendar management tools."""

from __future__ import annotations

from langchain.tools import ToolRuntime
from langchain_core.tools import tool

from apps.calendar.schemas import CalendarCalendarRead
from apps.calendar.service import calendar_service
from core.agents.runtime_context import AppAgentContext
from shared.tool_results import run_tool_with_runtime

CalendarCalendarToolResult = list[CalendarCalendarRead]


@tool("calendar_list_calendars")
async def calendar_list_calendars(*, runtime: ToolRuntime[AppAgentContext]) -> CalendarCalendarToolResult:
    """
    List all user's calendars.

    Use when:
    - User asks about their calendars
    - Need to show available calendars for creating events
    """
    return await run_tool_with_runtime(
        runtime,
        operation=lambda user_id: calendar_service.list_calendars(user_id),
    )
