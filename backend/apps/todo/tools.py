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
    """
    Add a new task to the to-do list.

    Use when:
    - User asks to create, add, or make a new task
    - User mentions something they need to do
    - Converting a message into a tracked task

    Args:
        title: Short task name (required, max 200 chars)
        description: Optional details about the task
        due_date: ISO format date string (e.g., "2025-04-15T10:00:00")
        priority: "low", "medium" (default), or "high"

    Returns:
        Created task with id, title, status, etc.

    Examples:
        - "Remind me to call mom tomorrow" → title="Call mom", due_date=tomorrow
        - "Add high priority task: finish report" → priority="high"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        dt = datetime.fromisoformat(due_date) if due_date else None
        return await task_service.create_task(user_id, title, description, dt, priority)

    return await safe_tool_call(operation, action="adding a task")


@tool
async def todo_list_tasks(
    status: Literal["pending", "completed"] | None = None,
    priority: Literal["low", "medium", "high"] | None = None,
    limit: int = 20,
) -> dict:
    """
    List tasks with optional filtering.

    Use when:
    - User asks "what tasks do I have" or "show my todos"
    - User wants to see pending, completed, or overdue items
    - Need task context before updating or completing

    Args:
        status: Filter by status - "pending", "completed", or None for all
        priority: Filter by "low", "medium", "high", or None for all
        limit: Max tasks to return (default 20, max 100)

    Returns:
        List of tasks with id, title, description, due_date, priority, status

    Examples:
        - "Show my tasks" → status="pending" (default shows pending)
        - "What did I complete?" → status="completed"
        - "Any high priority items?" → priority="high", status=None
    """
    async def operation() -> list[dict]:
        user_id = get_user_context()
        return await task_service.list_tasks(user_id, status, priority, limit)

    return await safe_tool_call(operation, action="listing tasks")


@tool
async def todo_get_task(task_id: str) -> dict:
    """
    Get a single task by ID.

    Use when:
    - User asks about a specific task by ID
    - Need full details of one task
    - Verifying task details before update

    Args:
        task_id: The task's unique identifier

    Returns:
        Complete task details

    Errors:
        NOT_FOUND: Task ID does not exist
    """
    async def operation() -> dict:
        user_id = get_user_context()
        task = await task_service.get_task(task_id, user_id)
        if not task:
            raise ValueError(f"Task '{task_id}' not found")
        return task

    return await safe_tool_call(operation, action="getting a task")


@tool
async def todo_update_task(
    task_id: str,
    title: str | None = None,
    description: str | None = None,
    due_date: str | None = None,
    priority: Literal["low", "medium", "high"] | None = None,
    status: Literal["pending", "completed"] | None = None,
) -> dict:
    """
    Update an existing task's details.

    Use when:
    - User asks to change/edit/update a task
    - Modifying title, description, due date, or priority
    - Use todo_complete_task or todo_toggle_task for status changes

    Args:
        task_id: Task to update (required)
        title: New title (optional, only updates if provided)
        description: New description (optional)
        due_date: New due date in ISO format (optional)
        priority: New priority level (optional)
        status: New status (optional, prefer todo_complete_task)

    Returns:
        Updated task details

    Examples:
        - "Change my task due date to Friday" → due_date="2025-04-03"
        - "Make task XYZ high priority" → task_id="XYZ", priority="high"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        dt = datetime.fromisoformat(due_date) if due_date else None
        return await task_service.update_task(
            task_id, user_id, title, description, dt, priority, status
        )

    return await safe_tool_call(operation, action="updating a task")


@tool
async def todo_toggle_task(task_id: str) -> dict:
    """
    Toggle task status between pending and completed.

    Use when:
    - User says "toggle task X"
    - User wants to flip status without specifying which
    - Quick status switch

    Args:
        task_id: Task to toggle

    Returns:
        Task with new status

    Examples:
        - "Toggle task status for ABC123"
        - "Flip my task XYZ"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await task_service.toggle_task(task_id, user_id)

    return await safe_tool_call(operation, action="toggling a task")


@tool
async def todo_complete_task(task_id: str) -> dict:
    """
    Mark a task as completed.

    Use when:
    - User says "done", "complete", "finish" a task
    - User marks something as finished
    - Always sets status to "completed"

    Args:
        task_id: Task to complete

    Returns:
        Completed task with completed_at timestamp

    Examples:
        - "Mark task ABC as done"
        - "I finished my call with mom"
        - "Complete task XYZ"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await task_service.complete_task(task_id, user_id)

    return await safe_tool_call(operation, action="completing a task")


@tool
async def todo_delete_task(task_id: str) -> dict:
    """
    Delete a task permanently.

    Use when:
    - User asks to remove or delete a task
    - User says "get rid of" or "cancel" a task

    Args:
        task_id: Task to delete permanently

    Returns:
        Success confirmation with deleted task ID

    Warning: This action cannot be undone.

    Examples:
        - "Delete task ABC"
        - "Remove my meeting task"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await task_service.delete_task(task_id, user_id)

    return await safe_tool_call(operation, action="deleting a task")


@tool
async def todo_get_summary() -> dict:
    """
    Get a summary of all tasks.

    Use when:
    - User asks for an overview or summary
    - User wants to know task statistics
    - "How am I doing with my tasks?"

    Returns:
        Summary with: total, pending, completed, overdue, due_today counts

    Examples:
        - "Give me a task summary"
        - "How many tasks do I have?"
        - "What's my progress?"
    """
    async def operation() -> dict:
        user_id = get_user_context()
        return await task_service.get_summary(user_id)

    return await safe_tool_call(operation, action="getting task summary")
