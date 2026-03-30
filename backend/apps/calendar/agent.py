"""Calendar plugin LangGraph agent."""

from .tools import (
    set_user_context,
    calendar_list,
    calendar_create,
    calendar_delete,
)
from .service import calendar_service
from shared.interfaces import AgentProtocol


class CalendarAgent(AgentProtocol):
    """Calendar app agent — handles domain operations via chat."""

    @property
    def graph(self):
        return None  # Reserved for future multi-step graph

    def tools(self) -> list:
        return [
            calendar_list,
            calendar_create,
            calendar_delete,
        ]

    async def on_install(self, user_id: str) -> None:
        set_user_context(user_id)
        await calendar_service.on_install(user_id)

    async def on_uninstall(self, user_id: str) -> None:
        set_user_context(user_id)
        await calendar_service.on_uninstall(user_id)
