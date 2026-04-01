"""Calendar plugin LangGraph agent."""

from langchain_core.tools import BaseTool

from apps.calendar.prompts import get_calendar_prompt
from apps.calendar.service import calendar_service
from apps.calendar.tools import (
    calendar_check_conflicts,
    calendar_create_event,
    calendar_create_recurring,
    calendar_delete_event,
    calendar_get_event,
    calendar_list_calendars,
    calendar_list_events,
    calendar_schedule_task,
    calendar_search_events,
    calendar_stop_recurring,
    calendar_update_event,
)
from core.agents.base_app import BaseAppAgent
from shared.agent_context import set_user_context


class CalendarAgent(BaseAppAgent):
    """Calendar app child agent used by the root orchestrator."""

    app_id = "calendar"

    def tools(self) -> list[BaseTool]:
        return [
            # Event tools
            calendar_list_events,
            calendar_search_events,
            calendar_get_event,
            calendar_create_event,
            calendar_update_event,
            calendar_delete_event,
            calendar_check_conflicts,
            # Calendar tools
            calendar_list_calendars,
            # Recurring tools
            calendar_create_recurring,
            calendar_stop_recurring,
            # Integration
            calendar_schedule_task,
        ]

    def build_prompt(self) -> str:
        return get_calendar_prompt()

    async def on_install(self, user_id: str) -> None:
        set_user_context(user_id)
        await calendar_service.on_install(user_id)

    async def on_uninstall(self, user_id: str) -> None:
        set_user_context(user_id)
        await calendar_service.on_uninstall(user_id)
