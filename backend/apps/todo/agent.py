"""Todo plugin LangGraph agent."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.tools import BaseTool
from motor.motor_asyncio import AsyncIOMotorClientSession

from apps.todo.enums import TaskPriority, TaskStatus
from apps.todo.prompts import get_todo_prompt
from apps.todo.service import task_service
from apps.todo.tools import (
    todo_add_subtask,
    todo_add_tag,
    todo_add_task,
    todo_archive_task,
    todo_complete_subtask,
    todo_complete_task,
    todo_create_recurring_task,
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
    todo_summarize_activity,
    todo_uncomplete_subtask,
    todo_update_task,
)
from core.agents.base_app import BaseAppAgent


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
            todo_complete_task,
            todo_archive_task,
            todo_restore_task,
            todo_delete_task,
            todo_list_archived,
            todo_summarize_activity,
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
            todo_create_recurring_task,
            todo_list_recurring_tasks,
            todo_stop_recurring_task,
        ]

    def build_prompt(self) -> str:
        return get_todo_prompt()

    async def on_install(self, user_id: str, session: AsyncIOMotorClientSession | None = None) -> None:
        await task_service.on_install(user_id, session=session)

    async def on_uninstall(self, user_id: str, session: AsyncIOMotorClientSession | None = None) -> None:
        await task_service.on_uninstall(user_id, session=session)

    def get_task_finder(self) -> TodoTaskFinder:
        """Return a TaskFinder backed by TodoAgent's TaskService."""
        return TodoTaskFinder()


class TodoTaskFinder:
    """TaskFinder implementation that delegates to TodoAgent's TaskService."""

    __slots__ = ()

    async def find_by_id(self, task_id: str, user_id: str) -> Task | None:
        tasks = await task_service.get_tasks(
            ids=[task_id],
            user_id=user_id,
        )
        return tasks[0] if tasks else None

    async def find_by_user(
        self,
        user_id: str,
        status: TaskStatus | None = None,
        priority: TaskPriority | None = None,
        tag: str | None = None,
        include_archived: bool = False,
        limit: int = 20,
    ) -> list[Task]:
        return await task_service.repo.find_by_user(
            user_id=user_id,
            status=status,
            priority=priority,
            tag=tag,
            include_archived=include_archived,
            limit=limit,
        )

if TYPE_CHECKING:
    from apps.todo.models import Task
