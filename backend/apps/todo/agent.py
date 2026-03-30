"""Todo plugin LangGraph agent."""

from apps.todo.tools import (
    todo_add_task,
    todo_list_tasks,
    todo_complete_task,
    todo_delete_task,
)
from apps.todo.service import task_service
from shared.agent_context import set_user_context
from shared.interfaces import AgentProtocol


# ─── Agent ─────────────────────────────────────────────────────────────────────

class TodoAgent(AgentProtocol):
    """To-Do app agent — handles task management via chat."""

    @property
    def graph(self):
        return None

    def tools(self) -> list:
        return [
            todo_add_task,
            todo_list_tasks,
            todo_complete_task,
            todo_delete_task,
        ]

    async def on_install(self, user_id: str) -> None:
        set_user_context(user_id)
        await task_service.on_install(user_id)

    async def on_uninstall(self, user_id: str) -> None:
        set_user_context(user_id)
        await task_service.on_uninstall(user_id)
