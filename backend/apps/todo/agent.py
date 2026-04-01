"""Todo plugin LangGraph agent."""

from langchain_core.tools import BaseTool

from apps.todo.prompts import get_todo_prompt
from apps.todo.service import task_service
from apps.todo.tools import (
    todo_add_recurring_task,
    todo_add_subtask,
    todo_add_tag,
    todo_add_task,
    todo_archive_task,
    todo_complete_subtask,
    todo_complete_task,
    todo_delete_subtask,
    todo_delete_task,
    todo_get_summary,
    todo_get_task,
    todo_list_archived,
    todo_list_recurring_tasks,
    todo_list_tasks,
    todo_remove_tag,
    todo_restore_task,
    todo_search_tasks,
    todo_stop_recurring_task,
    todo_toggle_task,
    todo_uncomplete_subtask,
    todo_update_task,
)
from core.agents.base_app import BaseAppAgent
from shared.agent_context import set_user_context


class TodoAgent(BaseAppAgent):
    """To-do app child agent used by the root orchestrator."""

    app_id = "todo"

    def tools(self) -> list[BaseTool]:
        return [
            # Core task tools
            todo_add_task,
            todo_list_tasks,
            todo_search_tasks,
            todo_get_task,
            todo_update_task,
            todo_toggle_task,
            todo_complete_task,
            todo_archive_task,
            todo_restore_task,
            todo_delete_task,
            todo_list_archived,
            todo_get_summary,
            # Tag tools
            todo_add_tag,
            todo_remove_tag,
            # Subtask tools
            todo_add_subtask,
            todo_complete_subtask,
            todo_uncomplete_subtask,
            todo_delete_subtask,
            # Recurring tools
            todo_add_recurring_task,
            todo_list_recurring_tasks,
            todo_stop_recurring_task,
        ]

    def build_prompt(self) -> str:
        return get_todo_prompt()

    async def on_install(self, user_id: str) -> None:
        set_user_context(user_id)
        await task_service.on_install(user_id)

    async def on_uninstall(self, user_id: str) -> None:
        set_user_context(user_id)
        await task_service.on_uninstall(user_id)
