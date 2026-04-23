"""Calendar activity summary tool."""

from __future__ import annotations

from langchain.tools import ToolRuntime
from langchain_core.tools import tool

from apps.calendar.schemas import CalendarActivitySummaryResponse
from apps.calendar.service import calendar_service
from core.agents.runtime_context import AppAgentContext
from shared.tool_results import run_time_aware_tool_with_runtime
from shared.tool_time import ToolTimeContext


@tool("calendar_summarize_activity")
async def calendar_summarize_activity(
    start: str,
    end: str,
    limit: int = 10,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> CalendarActivitySummaryResponse:
    """
    Summarize calendar activity within a local time window.

    Use when:
    - User asks what changed in calendar today/this week
    - Need event creations, material updates, and what is scheduled in the range
    - Building a workspace recap

    Returns:
    - events created in the range
    - events updated in the range (excluding creation-only writes)
    - events scheduled during the range
    - explicit unsupported history dimensions

    Limitations:
    - Event deletion history is not tracked explicitly.
    """
    async def operation(
        user_id: str,
        temporal: dict[str, object],
        _time_context: ToolTimeContext,
    ) -> CalendarActivitySummaryResponse:
        return await calendar_service.summarize_activity(
            user_id,
            temporal["start"],
            temporal["end"],
            limit=limit,
        )

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"start": start, "end": end},
        temporal_fields={"start": "local_datetime", "end": "local_datetime"},
        operation=operation,
    )
