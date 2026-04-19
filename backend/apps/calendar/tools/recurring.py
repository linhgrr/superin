"""Recurring event tools."""

from __future__ import annotations

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from apps.calendar.enums import RecurrenceFrequency
from apps.calendar.service import calendar_service
from shared.tool_results import run_time_aware_tool_with_user, run_tool_with_user


@tool("calendar_make_recurring")
async def calendar_make_recurring(
    event_id: str,
    frequency: RecurrenceFrequency,
    config: RunnableConfig,
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
    async def operation(user_id: str, temporal: dict, time_context) -> dict:
        return await calendar_service.create_recurring_rule(
            user_id=user_id,
            event_template_id=event_id,
            frequency=frequency,
            interval=interval,
            days_of_week=days_of_week,
            end_date=temporal.get("end_date"),
            max_occurrences=max_occurrences,
        )

    return await run_time_aware_tool_with_user(
        config,
        action="making event recurring",
        payload={"end_date": end_date},
        temporal_fields={"end_date": "local_date"},
        operation=operation,
    )


@tool("calendar_stop_recurring")
async def calendar_stop_recurring(
    rule_id: str,
    config: RunnableConfig,
    keep_past: bool = True,
) -> dict:
    """
    Stop future occurrences of a recurring series.

    Use when:
    - "Stop my daily reminder"
    - "Cancel the recurring meeting"
    """
    async def operation(user_id: str) -> dict:
        result = await calendar_service.stop_recurring_rule(rule_id, user_id)
        return {
            "success": True,
            "rule": result,
            "message": "Future occurrences stopped. Past events remain.",
        }

    return await run_tool_with_user(
        config,
        action="stopping recurring rule",
        operation=operation,
    )
