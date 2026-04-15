"""Recurring event tools."""

from __future__ import annotations

from datetime import datetime

from langchain_core.tools import tool

from apps.calendar.enums import RecurrenceFrequency
from apps.calendar.service import calendar_service
from core.utils.timezone import ensure_aware_utc
from shared.agent_context import get_user_context
from shared.tool_results import safe_tool_call


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
    - "Stop my daily reminder"
    - "Cancel the recurring meeting"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        result = await calendar_service.stop_recurring_rule(rule_id, user_id)
        return {
            "success": True,
            "rule": result,
            "message": "Future occurrences stopped. Past events remain.",
        }

    return await safe_tool_call(operation, action="stopping recurring rule")
