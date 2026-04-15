"""Calendar management tools."""

from __future__ import annotations

from langchain_core.tools import tool

from apps.calendar.service import calendar_service
from shared.agent_context import get_user_context
from shared.tool_results import safe_tool_call


@tool("calendar_list_calendars")
async def calendar_list_calendars() -> list[dict]:
    """
    List all user's calendars.

    Use when:
    - User asks about their calendars
    - Need to show available calendars for creating events
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()
        return await calendar_service.list_calendars(user_id)

    return await safe_tool_call(operation, action="listing calendars")
