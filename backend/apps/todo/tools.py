"""Todo plugin LangGraph tools (LLM-facing)."""

from datetime import datetime
from typing import Literal

from langchain_core.tools import tool

from apps.todo.service import task_service
from shared.agent_context import get_user_context
from shared.tool_results import safe_tool_call

# ─── Tools ────────────────────────────────────────────────────────────────────

@tool
async def todo_add_task(
    title: str,
    description: str | None = None,
    due_date: str | None = None,
    priority: Literal["low", "medium", "high"] = "medium",
) -> dict:
    """Add a new task to the to-do list."""
    async def operation() -> dict:
        user_id = get_user_context()
        dt = datetime.fromisoformat(due_date) if due_date else None
        return await task_service.create_task(user_id, title, description, dt, priority)

    return await safe_tool_call(operation, action="adding a task")


@tool
async def todo_list_tasks(
    status: Literal["pending", "completed"] = "pending",
    priority: Literal["low", "medium", "high"] | None = None,
    limit: int = 20,
) -> dict:
    """List tasks, optionally filtered by status and priority."""
    async def operation() -> list[dict]:
        user_id = get_user_context()
        return await task_service.list_tasks(user_id, status, priority, limit)

    return await safe_tool_call(operation, action="listing tasks")


@tool
async def todo_complete_task(task_id: str) -> dict:
    """Mark a task as completed."""
    async def operation() -> dict:
        user_id = get_user_context()
        return await task_service.complete_task(task_id, user_id)

    return await safe_tool_call(operation, action="completing a task")


@tool
async def todo_delete_task(task_id: str) -> dict:
    """Delete a task permanently."""
    async def operation() -> dict:
        user_id = get_user_context()
        return await task_service.delete_task(task_id, user_id)

    return await safe_tool_call(operation, action="deleting a task")
