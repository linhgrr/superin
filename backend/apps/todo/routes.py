"""Todo plugin FastAPI routes."""


from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from apps.todo.enums import TaskPriority, TaskStatus
from apps.todo.schemas import (
    TaskListWidgetConfig,
    TaskListWidgetData,
    TodayWidgetConfig,
    TodayWidgetData,
    TodoActionResponse,
    TodoCreateRecurringRuleRequest,
    TodoCreateSubTaskRequest,
    TodoCreateTaskRequest,
    TodoRecurringRuleRead,
    TodoSubTaskRead,
    TodoSummaryResponse,
    TodoTaskDetailRead,
    TodoTaskRead,
    TodoUpdateTaskRequest,
    TodoWidgetDataResponse,
)
from apps.todo.service import task_service
from core.auth.dependencies import get_current_user
from core.models import User, WidgetPreference
from core.registry import WIDGET_DATA_HANDLERS
from core.utils.timezone import get_user_timezone_context
from core.widget_config import resolve_widget_config, upsert_widget_config
from shared.preference_utils import (
    preference_to_schema,
    update_multiple_preferences,
)
from shared.schemas import (
    ConfigFieldSchema,
    PreferenceUpdate,
    WidgetDataConfigSchema,
    WidgetDataConfigUpdate,
    WidgetManifestSchema,
    WidgetPreferenceSchema,
)

router = APIRouter()


def _get_widget_manifest(widget_id: str) -> WidgetManifestSchema:
    from apps.todo.manifest import todo_manifest

    for widget in todo_manifest.widgets:
        if widget.id == widget_id:
            return widget
    raise HTTPException(status_code=404, detail=f"Widget '{widget_id}' not found")


async def get_task_list_widget_data(
    user_id: str,
    config: TaskListWidgetConfig,
) -> TaskListWidgetData:
    tasks = await task_service.list_tasks(user_id, None, None, None, False, max(config.limit * 3, 20))
    if config.filter == "today":
        user = await User.get(PydanticObjectId(user_id))
        ctx = get_user_timezone_context(user)
        start, end = ctx.today_range()
        items = [
            task for task in tasks
            if task.get("due_date") and start <= task["due_date"] <= end
        ]
    elif config.filter == "high":
        items = [task for task in tasks if task.get("priority") == "high"]
    else:
        items = tasks

    return TaskListWidgetData(
        filter=config.filter,
        items=items[: config.limit],
        total=len(items),
    )


async def get_today_widget_data(
    user_id: str,
    config: TodayWidgetConfig,
) -> TodayWidgetData:
    user = await User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    summary = await task_service.get_summary(user)
    tasks = await task_service.list_tasks(user_id, "pending", None, None, False, 50)
    next_due_task = next(
        (
            task for task in tasks
            if task.get("due_date") is not None
        ),
        None,
    )

    overdue = summary["overdue"] if config.include_overdue else 0
    return TodayWidgetData(
        due_today=summary["due_today"],
        overdue=overdue,
        next_due_task=next_due_task,
    )


# ─── Widgets ──────────────────────────────────────────────────────────────────

@router.get("/widgets", response_model=list[WidgetManifestSchema])
async def list_widgets() -> list[WidgetManifestSchema]:
    from apps.todo.manifest import todo_manifest

    return todo_manifest.widgets


@router.get("/widgets/{widget_id}", response_model=TodoWidgetDataResponse)
async def get_widget_data(
    widget_id: str,
    user_id: str = Depends(get_current_user),
) -> TodoWidgetDataResponse:
    _get_widget_manifest(widget_id)
    handler = WIDGET_DATA_HANDLERS.get(widget_id)
    if handler is None:
        raise HTTPException(status_code=404, detail=f"Widget '{widget_id}' is not registered")
    config = await resolve_widget_config(user_id, widget_id)
    return await handler(user_id, config)


@router.put("/widgets/{widget_id}/config", response_model=WidgetDataConfigSchema)
async def update_widget_config(
    widget_id: str,
    update: WidgetDataConfigUpdate,
    user_id: str = Depends(get_current_user),
) -> WidgetDataConfigSchema:
    _get_widget_manifest(widget_id)
    if update.widget_id != widget_id:
        raise HTTPException(status_code=400, detail="Payload widget_id must match path widget_id")

    doc = await upsert_widget_config(user_id, widget_id, update.config)
    return WidgetDataConfigSchema(
        id=str(doc.id),
        user_id=str(doc.user_id),
        widget_id=doc.widget_id,
        config=doc.config,
    )


@router.get("/widgets/{widget_id}/options", response_model=list[ConfigFieldSchema])
async def get_widget_options(
    widget_id: str,
    user_id: str = Depends(get_current_user),
) -> list[ConfigFieldSchema]:
    del user_id
    return [field.model_copy(deep=True) for field in _get_widget_manifest(widget_id).config_fields]


# ─── Tasks ────────────────────────────────────────────────────────────────────

@router.get("/tasks", response_model=list[TodoTaskRead])
async def list_tasks(
    user_id: str = Depends(get_current_user),
    status: TaskStatus | None = Query(None),
    priority: TaskPriority | None = Query(None),
    tag: str | None = Query(None),
    limit: int = Query(20, le=100),
):
    """List tasks with optional filtering."""
    return await task_service.list_tasks(user_id, status, priority, tag, False, limit)


@router.get("/tasks/search", response_model=list[TodoTaskRead])
async def search_tasks(
    q: str,
    user_id: str = Depends(get_current_user),
    include_archived: bool = Query(False),
    limit: int = Query(20, le=100),
):
    """Search tasks by query string."""
    return await task_service.search_tasks(user_id, q, include_archived, limit)


@router.get("/tasks/archived/list", response_model=list[TodoTaskRead])
async def list_archived(
    user_id: str = Depends(get_current_user),
    limit: int = Query(20, le=100),
):
    """List archived (soft deleted) tasks."""
    return await task_service.list_archived(user_id, limit)


@router.get("/tasks/{task_id}", response_model=TodoTaskDetailRead)
async def get_task(task_id: str, user_id: str = Depends(get_current_user)):
    """Get a single task by ID with subtasks."""
    task = await task_service.get_task_with_subtasks(task_id, user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/tasks", response_model=TodoTaskRead)
async def create_task(
    request: TodoCreateTaskRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        return await task_service.create_task(
            user_id,
            request.title,
            request.description,
            request.due_date,
            request.due_time,
            request.priority,
            request.tags,
            request.reminder_minutes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/tasks/{task_id}", response_model=TodoTaskRead)
async def update_task(
    task_id: str,
    request: TodoUpdateTaskRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        return await task_service.update_task(
            task_id,
            user_id,
            request.title,
            request.description,
            request.due_date,
            request.due_time,
            request.priority,
            request.status,
            request.tags,
            request.reminder_minutes,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/tasks/{task_id}", response_model=TodoActionResponse)
async def delete_task(task_id: str, user_id: str = Depends(get_current_user)):
    """Permanently delete a task and all its subtasks."""
    try:
        return await task_service.delete_task(task_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/tasks/{task_id}/toggle", response_model=TodoTaskRead)
async def toggle_task(task_id: str, user_id: str = Depends(get_current_user)):
    """Flip task between pending and completed."""
    try:
        return await task_service.toggle_task(task_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Archive ──────────────────────────────────────────────────────────────────

@router.patch("/tasks/{task_id}/archive", response_model=TodoTaskRead)
async def archive_task(task_id: str, user_id: str = Depends(get_current_user)):
    """Archive (soft delete) a task."""
    try:
        return await task_service.archive_task(task_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/tasks/{task_id}/restore", response_model=TodoTaskRead)
async def restore_task(task_id: str, user_id: str = Depends(get_current_user)):
    """Restore an archived task."""
    try:
        return await task_service.restore_task(task_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Tags ─────────────────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/tags/{tag}", response_model=TodoTaskRead)
async def add_tag(
    task_id: str,
    tag: str,
    user_id: str = Depends(get_current_user),
):
    """Add a tag to a task."""
    try:
        return await task_service.add_task_tag(task_id, user_id, tag)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/tasks/{task_id}/tags/{tag}", response_model=TodoTaskRead)
async def remove_tag(
    task_id: str,
    tag: str,
    user_id: str = Depends(get_current_user),
):
    """Remove a tag from a task."""
    try:
        return await task_service.remove_task_tag(task_id, user_id, tag)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Subtasks ─────────────────────────────────────────────────────────────────

@router.get("/tasks/{task_id}/subtasks", response_model=list[TodoSubTaskRead])
async def get_subtasks(task_id: str, user_id: str = Depends(get_current_user)):
    """Get all subtasks for a parent task."""
    return await task_service.get_subtasks(task_id, user_id)


@router.post("/tasks/{task_id}/subtasks", response_model=TodoSubTaskRead)
async def add_subtask(
    task_id: str,
    request: TodoCreateSubTaskRequest,
    user_id: str = Depends(get_current_user),
):
    """Add a subtask to a parent task."""
    try:
        return await task_service.add_subtask(task_id, user_id, request.title)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/subtasks/{subtask_id}/complete", response_model=TodoSubTaskRead)
async def complete_subtask(
    subtask_id: str,
    user_id: str = Depends(get_current_user),
):
    """Mark a subtask as completed."""
    try:
        return await task_service.complete_subtask(subtask_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/subtasks/{subtask_id}/uncomplete", response_model=TodoSubTaskRead)
async def uncomplete_subtask(
    subtask_id: str,
    user_id: str = Depends(get_current_user),
):
    """Mark a completed subtask as not completed."""
    try:
        return await task_service.uncomplete_subtask(subtask_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/subtasks/{subtask_id}", response_model=TodoActionResponse)
async def delete_subtask(
    subtask_id: str,
    user_id: str = Depends(get_current_user),
):
    """Delete a subtask permanently."""
    try:
        return await task_service.delete_subtask(subtask_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Recurring Tasks ──────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/recurring", response_model=TodoRecurringRuleRead)
async def create_recurring_rule(
    task_id: str,
    request: TodoCreateRecurringRuleRequest,
    user_id: str = Depends(get_current_user),
):
    """Create a recurring rule based on a task template."""
    try:
        return await task_service.create_recurring_rule(
            user_id,
            task_id,
            request.frequency,
            request.interval,
            request.days_of_week,
            request.end_date,
            request.max_occurrences,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/recurring", response_model=list[TodoRecurringRuleRead])
async def list_recurring_rules(user_id: str = Depends(get_current_user)):
    """List all recurring task rules."""
    return await task_service.list_recurring_rules(user_id)


@router.patch("/recurring/{rule_id}/stop", response_model=TodoRecurringRuleRead)
async def stop_recurring_rule(
    rule_id: str,
    user_id: str = Depends(get_current_user),
):
    """Stop a task from recurring."""
    try:
        return await task_service.deactivate_recurring_rule(rule_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Summary ──────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=TodoSummaryResponse)
async def todo_summary(user_id: str = Depends(get_current_user)):
    # Fetch user to pass to service for timezone-aware calculations
    from core.models import User
    user = await User.get(user_id)
    return await task_service.get_summary(user)


# ─── Preferences ──────────────────────────────────────────────────────────────

@router.get("/preferences")
async def get_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == "todo",
    ).to_list()
    return [preference_to_schema(p) for p in prefs]


@router.put("/preferences")
async def update_preferences(
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    await update_multiple_preferences(user_id, updates, "todo")
    return await get_preferences(user_id)
