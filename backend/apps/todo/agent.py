"""Todo plugin LangGraph agent."""

from langchain_core.tools import BaseTool

from apps.todo.tools import (
    todo_add_task,
    todo_complete_task,
    todo_delete_task,
    todo_list_tasks,
)
from apps.todo.prompts import get_todo_prompt
from apps.todo.service import task_service
from core.agents.base_app import BaseAppAgent
from shared.agent_context import set_user_context


class TodoAgent(BaseAppAgent):
    """To-do app child agent used by the root orchestrator."""

    app_id = "todo"

    def tools(self) -> list[BaseTool]:
        return [
            todo_add_task,
            todo_list_tasks,
            todo_complete_task,
            todo_delete_task,
        ]

    def build_prompt(self) -> str:
        return get_todo_prompt()

    async def on_install(self, user_id: str) -> None:
        set_user_context(user_id)
        await task_service.on_install(user_id)

    async def on_uninstall(self, user_id: str) -> None:
        set_user_context(user_id)
        await task_service.on_uninstall(user_id)
