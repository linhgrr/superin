"""Habit plugin LangGraph agent."""

from .tools import (
    set_user_context,
    habit_list,
    habit_create,
    habit_delete,
)
from .service import habit_service
from shared.interfaces import AgentProtocol


class HabitAgent(AgentProtocol):
    """Habit app agent — handles domain operations via chat."""

    @property
    def graph(self):
        return None  # Reserved for future multi-step graph

    def tools(self) -> list:
        return [
            habit_list,
            habit_create,
            habit_delete,
        ]

    async def on_install(self, user_id: str) -> None:
        set_user_context(user_id)
        await habit_service.on_install(user_id)

    async def on_uninstall(self, user_id: str) -> None:
        set_user_context(user_id)
        await habit_service.on_uninstall(user_id)
