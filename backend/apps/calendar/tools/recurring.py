"""Recurring event tools."""

from __future__ import annotations

from typing import Any, TypedDict

from langchain.tools import ToolRuntime
from langchain_core.tools import tool

from apps.calendar.enums import RecurrenceFrequency
from apps.calendar.schemas import CalendarRecurringRuleRead
from apps.calendar.service import calendar_service
from core.agents.runtime_context import AppAgentContext
from shared.tool_results import (
    run_time_aware_tool_with_runtime,
    run_tool_with_runtime,
)
from shared.tool_time import ToolTimeContext


class CalendarStopRecurringPayload(TypedDict):
    success: bool
    rule: CalendarRecurringRuleRead
    message: str


CalendarRecurringToolResult = CalendarRecurringRuleRead | CalendarStopRecurringPayload


@tool("calendar_make_recurring")
async def calendar_make_recurring(
    event_id: str,
    frequency: RecurrenceFrequency,
    interval: int = 1,
    days_of_week: list[int] | None = None,
    end_date: str | None = None,
    max_occurrences: int | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> CalendarRecurringToolResult:
    """
    Make an event repeat automatically (create recurring series).

    Use when:
    - User wants an event to repeat
    - "Make this a weekly meeting"
    - "Repeat daily for 30 days"
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        time_context: ToolTimeContext,
    ) -> CalendarRecurringRuleRead:
        return await calendar_service.create_recurring_rule(
            user_id=user_id,
            event_template_id=event_id,
            frequency=frequency,
            interval=interval,
            days_of_week=days_of_week,
            end_date=temporal.get("end_date"),
            max_occurrences=max_occurrences,
        )

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"end_date": end_date},
        temporal_fields={"end_date": "local_date"},
        operation=operation,
    )


@tool("calendar_stop_recurring")
async def calendar_stop_recurring(
    rule_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> CalendarRecurringToolResult:
    """
    Stop future occurrences of a recurring series.

    Use when:
    - "Stop my daily reminder"
    - "Cancel the recurring meeting"

    Returns:
    - the updated recurring rule
    - confirmation that future occurrences were stopped

    Notes:
    - Past events remain unchanged.
    """
    async def operation(user_id: str) -> CalendarStopRecurringPayload:
        result = await calendar_service.stop_recurring_rule(rule_id, user_id)
        return {
            "success": True,
            "rule": result,
            "message": "Future occurrences stopped. Past events remain.",
        }

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )
