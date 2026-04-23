"""Todo plugin LangGraph tools (LLM-facing).

All tools accept a hidden ``runtime: ToolRuntime[AppAgentContext]`` injected by
LangGraph/LangChain. User-scoped context comes from ``runtime.context`` rather
than from per-tool config plumbing.
"""

from typing import Any

from langchain.tools import ToolRuntime
from langchain_core.tools import tool

from apps.todo.enums import RecurrenceFrequency, TaskPriority, TaskStatus
from apps.todo.schemas import (
    TodoActionResponse,
    TodoActivitySummaryResponse,
    TodoRecurringRuleRead,
    TodoSubTaskRead,
    TodoSummaryResponse,
    TodoTaskDetailRead,
    TodoTaskRead,
)
from apps.todo.service import task_service
from core.agents.runtime_context import AppAgentContext
from core.models import User
from shared.tool_results import (
    run_time_aware_tool_with_runtime,
    run_tool_with_runtime,
)
from shared.tool_time import ToolTimeContext

TodoToolResult = (
    TodoActionResponse
    | TodoActivitySummaryResponse
    | TodoRecurringRuleRead
    | TodoSubTaskRead
    | TodoSummaryResponse
    | TodoTaskDetailRead
    | TodoTaskRead
    | list[TodoRecurringRuleRead]
    | list[TodoTaskRead]
)

# ─── Core Task Tools ──────────────────────────────────────────────────────────

@tool("todo_add_task")
async def todo_add_task(
    title: str,
    description: str | None = None,
    due_date: str | None = None,
    due_time: str | None = None,
    priority: TaskPriority = "medium",
    tags: list[str] | None = None,
    reminder_minutes: int | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Add a new task to the to-do list.

    Use when:
    - User asks to create, add, or make a new task
    - User mentions something they need to do
    - Converting a message into a tracked task

    Args:
        title: Short task name (required, max 200 chars)
        description: Optional details about the task
        due_date: ISO format date string (e.g., "2025-04-15")
        due_time: Time in HH:MM format (optional, e.g., "14:30")
        priority: "low", "medium" (default), or "high"
        tags: List of tag strings (e.g., ["work", "urgent"])
        reminder_minutes: Remind X minutes before due time

    Returns:
        Created task with id, title, status, tags, etc.

    Examples:
        - "Remind me to call mom tomorrow at 3pm" → due_date=tomorrow, due_time="15:00"
        - "Add high priority work task" → priority="high", tags=["work"]
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        time_context: ToolTimeContext,
    ) -> TodoTaskRead:
        due_date_value = temporal.get("due_date")
        dt_time = temporal.get("due_time")
        return await task_service.create_task(
            user_id, title, description, due_date_value, dt_time, priority, tags, reminder_minutes
        )

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"due_date": due_date, "due_time": due_time},
        temporal_fields={"due_date": "local_date", "due_time": "local_time"},
        operation=operation,
    )


@tool("todo_list_tasks")
async def todo_list_tasks(
    status: TaskStatus | None = None,
    priority: TaskPriority | None = None,
    tag: str | None = None,
    limit: int = 20,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    List tasks with optional filtering.

    Use when:
    - User asks "what tasks do I have" or "show my todos"
    - User wants to see pending, completed, or overdue items
    - Filtering by tag (e.g., "show my work tasks")

    Args:
        status: Filter by status - "pending", "completed", or None for all
        priority: Filter by "low", "medium", "high", or None for all
        tag: Filter by specific tag (optional)
        limit: Max tasks to return (default 20, max 100)

    Returns:
        List of tasks with id, title, description, due_date, priority, status, tags

    Examples:
        - "Show my tasks" → status="pending"
        - "What did I complete?" → status="completed"
        - "Show my work tasks" → tag="work"
    """
    async def operation(user_id: str) -> list[TodoTaskRead]:
        return await task_service.list_tasks(user_id, status, priority, tag, False, limit)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("todo_search_tasks")
async def todo_search_tasks(
    query: str,
    include_archived: bool = False,
    limit: int = 20,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Search tasks by title, description, or tags.

    Use when:
    - User wants to find specific tasks by keyword
    - "Find my meeting tasks"
    - "Search for grocery items"

    Args:
        query: Search term to look for in title, description, or tags
        include_archived: Whether to include archived tasks (default: False)
        limit: Max results (default 20)

    Returns:
        List of matching tasks

    Examples:
        - "Find my meeting tasks" → query="meeting"
        - "Search for urgent work" → query="urgent work"
    """
    async def operation(user_id: str) -> list[TodoTaskRead]:
        return await task_service.search_tasks(user_id, query, include_archived, limit)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("todo_get_task")
async def todo_get_task(
    task_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Get a single task by ID, including subtasks.

    Use when:
    - User asks about a specific task by ID
    - Need full details including subtasks and progress
    - Verifying task details before update

    Args:
        task_id: The task's unique identifier

    Returns:
        Complete task details including subtasks list and progress percentage

    Errors:
        NOT_FOUND: Task ID does not exist
    """
    async def operation(user_id: str) -> TodoTaskDetailRead:
        task = await task_service.get_task_with_subtasks(task_id, user_id)
        if not task:
            raise ValueError(f"Task '{task_id}' not found")
        return task

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("todo_update_task")
async def todo_update_task(
    task_id: str,
    title: str | None = None,
    description: str | None = None,
    due_date: str | None = None,
    due_time: str | None = None,
    priority: TaskPriority | None = None,
    status: TaskStatus | None = None,
    tags: list[str] | None = None,
    reminder_minutes: int | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Update an existing task's details.

    Use when:
    - User asks to change/edit/update a task
    - Modifying title, description, due date, priority, tags, or reminder
    - Reopening a completed task or explicitly setting status
    - Prefer todo_complete_task when the user just wants to mark a task done

    Args:
        task_id: Task to update (required)
        title: New title (optional)
        description: New description (optional)
        due_date: New due date in ISO format (optional)
        due_time: New time in HH:MM format (optional)
        priority: New priority level (optional)
        status: New explicit status such as reopening a task to "pending"
        tags: Replace all tags (optional)
        reminder_minutes: New reminder time (optional)

    Returns:
        Updated task details

    Examples:
        - "Change my task due date to Friday" → due_date="2025-04-03"
        - "Add work tag to my task" → tags=["work"]
        - "Set reminder 30 mins before" → reminder_minutes=30
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        time_context: ToolTimeContext,
    ) -> TodoTaskRead:
        due_date_value = temporal.get("due_date")
        dt_time = temporal.get("due_time")
        return await task_service.update_task(
            task_id, user_id, title, description, due_date_value, dt_time, priority, status, tags, reminder_minutes
        )

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"due_date": due_date, "due_time": due_time},
        temporal_fields={"due_date": "local_date", "due_time": "local_time"},
        operation=operation,
    )


@tool("todo_toggle_task")
async def todo_toggle_task(
    task_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
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
    """
    async def operation(user_id: str) -> TodoTaskRead:
        return await task_service.toggle_task(task_id, user_id)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("todo_complete_task")
async def todo_complete_task(
    task_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
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
    """
    async def operation(user_id: str) -> TodoTaskRead:
        return await task_service.complete_task(task_id, user_id)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("todo_delete_task")
async def todo_delete_task(
    task_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Delete a task permanently (including all subtasks).

    Use when:
    - User asks to remove or delete a task permanently
    - User says "get rid of" or "cancel" a task completely

    Args:
        task_id: Task to delete permanently

    Returns:
        Success confirmation with deleted task ID

    Warning: This action cannot be undone. All subtasks will also be deleted.

    Examples:
        - "Delete task ABC permanently"
        - "Remove my meeting task completely"
    """
    async def operation(user_id: str) -> TodoActionResponse:
        return await task_service.delete_task(task_id, user_id)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


# ─── Archive / Soft Delete ────────────────────────────────────────────────────

@tool("todo_archive_task")
async def todo_archive_task(
    task_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Archive (soft delete) a task - hides from normal lists but can be restored.

    Use when:
    - User wants to hide a task without deleting it permanently
    - "Archive my old project tasks"
    - "Move this to archive"
    - User is unsure about deleting, offer archive as safer option

    Args:
        task_id: Task to archive

    Returns:
        Archived task details

    Note: Archived tasks don't appear in normal lists. Use todo_list_archived to see them.
    """
    async def operation(user_id: str) -> TodoTaskRead:
        return await task_service.archive_task(task_id, user_id)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("todo_restore_task")
async def todo_restore_task(
    task_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Restore an archived task back to active status.

    Use when:
    - User wants to unarchive a previously archived task
    - "Restore my archived task"
    - "Bring back the task I archived"

    Args:
        task_id: Task to restore

    Returns:
        Restored task details
    """
    async def operation(user_id: str) -> TodoTaskRead:
        return await task_service.restore_task(task_id, user_id)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("todo_list_archived")
async def todo_list_archived(
    limit: int = 20,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    List archived (soft deleted) tasks.

    Use when:
    - User wants to see their archived tasks
    - "Show my archived tasks"
    - "What did I archive?"

    Args:
        limit: Max archived tasks to return (default 20)

    Returns:
        List of archived tasks
    """
    async def operation(user_id: str) -> list[TodoTaskRead]:
        return await task_service.list_archived(user_id, limit)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


# ─── Tag Management ────────────────────────────────────────────────────────────

@tool("todo_add_tag")
async def todo_add_tag(
    task_id: str,
    tag: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Add a tag/label to a task.

    Use when:
    - User wants to categorize a task
    - "Tag this as work"
    - "Add urgent label to my task"

    Args:
        task_id: Task to add tag to
        tag: Tag string (e.g., "work", "personal", "urgent")

    Returns:
        Updated task with new tag

    Examples:
        - "Tag task ABC as work" → tag="work"
        - "Add shopping label" → tag="shopping"
    """
    async def operation(user_id: str) -> TodoTaskRead:
        return await task_service.add_task_tag(task_id, user_id, tag)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("todo_remove_tag")
async def todo_remove_tag(
    task_id: str,
    tag: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Remove a tag/label from a task.

    Use when:
    - User wants to remove a category from a task
    - "Remove work tag from this task"
    - "Untag my personal task"

    Args:
        task_id: Task to remove tag from
        tag: Tag string to remove

    Returns:
        Updated task without the tag
    """
    async def operation(user_id: str) -> TodoTaskRead:
        return await task_service.remove_task_tag(task_id, user_id, tag)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


# ─── Subtasks ─────────────────────────────────────────────────────────────────

@tool("todo_add_subtask")
async def todo_add_subtask(
    parent_task_id: str,
    title: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Add a subtask to a parent task.

    Use when:
    - User wants to break down a task into smaller steps
    - "Add subtask to my project"
    - "Create step 1 for this task"

    Args:
        parent_task_id: The main task that will contain this subtask
        title: Subtask description (e.g., "Research options", "Call vendor")

    Returns:
        Created subtask with id and parent reference

    Examples:
        - "Add 'buy groceries' as subtask of shopping"
        - "Create subtask: prepare slides for presentation"
    """
    async def operation(user_id: str) -> TodoSubTaskRead:
        return await task_service.add_subtask(parent_task_id, user_id, title)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("todo_complete_subtask")
async def todo_complete_subtask(
    subtask_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Mark a subtask as completed.

    Use when:
    - User completes a step in a larger task
    - "Done with subtask ABC"
    - "Complete step 1"

    Args:
        subtask_id: Subtask to complete

    Returns:
        Completed subtask

    Note: Completing all subtasks doesn't auto-complete the parent task.
    """
    async def operation(user_id: str) -> TodoSubTaskRead:
        return await task_service.complete_subtask(subtask_id, user_id)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("todo_uncomplete_subtask")
async def todo_uncomplete_subtask(
    subtask_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Mark a completed subtask as not completed (reopen).

    Use when:
    - User accidentally completed a subtask
    - "Undo completion of subtask ABC"
    - "Reopen step 2"

    Args:
        subtask_id: Subtask to uncomplete

    Returns:
        Uncompleted subtask
    """
    async def operation(user_id: str) -> TodoSubTaskRead:
        return await task_service.uncomplete_subtask(subtask_id, user_id)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("todo_delete_subtask")
async def todo_delete_subtask(
    subtask_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Delete a subtask permanently.

    Use when:
    - User wants to remove a step completely
    - "Delete subtask ABC"
    - "Remove this step"

    Args:
        subtask_id: Subtask to delete

    Returns:
        Success confirmation

    Warning: This action cannot be undone.
    """
    async def operation(user_id: str) -> TodoActionResponse:
        return await task_service.delete_subtask(subtask_id, user_id)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


# ─── Recurring Tasks ──────────────────────────────────────────────────────────

@tool("todo_create_recurring_task")
async def todo_create_recurring_task(
    task_template_id: str,
    frequency: RecurrenceFrequency,
    interval: int = 1,
    days_of_week: list[int] | None = None,
    end_date: str | None = None,
    max_occurrences: int | None = None,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Create a recurring task pattern based on an existing task.

    Use when:
    - User wants a task to repeat automatically
    - "Make this a daily task"
    - "Repeat this every Monday and Friday"
    - "Create a weekly recurring task"

    Args:
        task_template_id: The task to use as template for recurring instances
        frequency: How often - "daily", "weekly", "monthly", "yearly"
        interval: Every N frequencies (e.g., every 2 weeks, default 1)
        days_of_week: For weekly only - list of days 0=Monday to 6=Sunday
        end_date: When to stop recurring (ISO format, optional)
        max_occurrences: Maximum number of times to repeat (optional)

    Returns:
        Created recurring rule with schedule details

    Examples:
        - "Make this daily" → frequency="daily"
        - "Every Monday and Friday" → frequency="weekly", days_of_week=[0,4]
        - "Every 2 weeks" → frequency="weekly", interval=2
        - "Monthly for 6 months" → frequency="monthly", max_occurrences=6
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        time_context: ToolTimeContext,
    ) -> TodoRecurringRuleRead:
        end_date_value = temporal.get("end_date")
        return await task_service.create_recurring_rule(
            user_id, task_template_id, frequency, interval, days_of_week, end_date_value, max_occurrences
        )

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"end_date": end_date},
        temporal_fields={"end_date": "local_date"},
        operation=operation,
    )


@tool("todo_list_recurring_tasks")
async def todo_list_recurring_tasks(*, runtime: ToolRuntime[AppAgentContext]) -> TodoToolResult:
    """
    List all recurring task patterns.

    Use when:
    - User wants to see their recurring tasks
    - "Show my recurring tasks"
    - "What tasks repeat automatically?"

    Returns:
        List of recurring rules with frequency, next occurrence, etc.
    """
    async def operation(user_id: str) -> list[TodoRecurringRuleRead]:
        return await task_service.list_recurring_rules(user_id)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


@tool("todo_stop_recurring_task")
async def todo_stop_recurring_task(
    rule_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Stop a task from recurring (deactivate the recurring rule).

    Use when:
    - User wants to stop a repeating task
    - "Stop my daily workout reminder"
    - "Cancel the recurring team meeting task"

    Args:
        rule_id: The recurring rule to stop

    Returns:
        Deactivated recurring rule

    Note: This stops future instances but doesn't delete existing tasks.
    """
    async def operation(user_id: str) -> TodoRecurringRuleRead:
        return await task_service.deactivate_recurring_rule(rule_id, user_id)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )


# ─── Summary ───────────────────────────────────────────────────────────────────

@tool("todo_summarize_activity")
async def todo_summarize_activity(
    start: str,
    end: str,
    limit: int = 10,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> TodoToolResult:
    """
    Summarize task activity that happened within a local time window.

    Use when:
    - User asks "what changed" in to-do today/this week
    - Need created/completed task activity, not just current totals
    - Building a workspace recap

    Returns:
    - tasks created in the range
    - tasks completed in the range
    - explicit unsupported activity dimensions

    Limitations:
    - Task edits, deletions, and archive/restore history are not tracked explicitly.
    """
    async def operation(
        user_id: str,
        temporal: dict[str, Any],
        _time_context: ToolTimeContext,
    ) -> TodoActivitySummaryResponse:
        return await task_service.summarize_activity(
            user_id,
            temporal["start"],
            temporal["end"],
            limit=limit,
        )

    return await run_time_aware_tool_with_runtime(
        runtime,
        payload={"start": start, "end": end},
        temporal_fields={"start": "local_datetime", "end": "local_datetime"},
        operation=operation,
    )

@tool("todo_get_summary")
async def todo_get_summary(*, runtime: ToolRuntime[AppAgentContext]) -> TodoToolResult:
    """
    Get a comprehensive summary of all tasks.

    Use when:
    - User asks for an overview or summary
    - User wants to know task statistics
    - "How am I doing with my tasks?"

    Returns:
        Summary with:
        - total, pending, completed, overdue, due_today counts
        - archived count
        - total unique tags and tag list

    Examples:
        - "Give me a task summary"
        - "How many tasks do I have?"
        - "What's my progress?"
    """
    async def operation(user_id: str) -> TodoSummaryResponse:
        user = await User.get(user_id)
        if not isinstance(user, User):
            raise ValueError("User not found")
        return await task_service.get_summary(user)

    return await run_tool_with_runtime(
        runtime,
        operation=operation,
    )
