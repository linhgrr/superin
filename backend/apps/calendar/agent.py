"""Calendar plugin LangGraph agent."""

from langchain_core.tools import BaseTool

from apps.calendar.prompts import get_calendar_prompt
from apps.calendar.service import calendar_service
from apps.calendar.tools import (
    calendar_block_task_time,
    calendar_cancel_event,
    calendar_edit_event,
    calendar_find_events,
    calendar_list_calendars,
    calendar_make_recurring,
    calendar_reschedule_event,
    calendar_schedule_event,
    calendar_stop_recurring,
)
from core.agents.base_app import BaseAppAgent
from shared.agent_context import set_user_context


class CalendarAgent(BaseAppAgent):
    """Calendar app child agent used by the root orchestrator."""

    app_id = "calendar"

    def tools(self) -> list[BaseTool]:
        return [
            # Event lifecycle - consolidated design
            calendar_schedule_event,    # Create + auto conflict check
            calendar_reschedule_event,  # Move to new time
            calendar_edit_event,        # Edit metadata only
            calendar_cancel_event,      # Delete/cancel
            calendar_find_events,       # Search + list + get
            # Calendar management
            calendar_list_calendars,
            # Recurring events
            calendar_make_recurring,
            calendar_stop_recurring,
            # Todo integration
            calendar_block_task_time,
        ]

    def build_prompt(self) -> str:
        return get_calendar_prompt()

    async def on_install(self, user_id: str) -> None:
        set_user_context(user_id)
        await calendar_service.on_install(user_id)

    async def on_uninstall(self, user_id: str) -> None:
        set_user_context(user_id)
        await calendar_service.on_uninstall(user_id)
