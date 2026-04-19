"""Calendar management tools."""

from __future__ import annotations

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from apps.calendar.service import calendar_service
from shared.tool_results import run_tool_with_user


@tool("calendar_list_calendars")
async def calendar_list_calendars(config: RunnableConfig) -> list[dict]:
    """
    List all user's calendars.

    Use when:
    - User asks about their calendars
    - Need to show available calendars for creating events
    """
    return await run_tool_with_user(
        config,
        action="listing calendars",
        operation=lambda user_id: calendar_service.list_calendars(user_id),
    )
