"""Todo plugin FastAPI routes."""

from typing import Literal

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from apps.todo.schemas import (
    CreateRecurringRuleRequest,
    CreateSubTaskRequest,
    CreateTaskRequest,
    UpdateTaskRequest,
)
from apps.todo.service import task_service
from core.auth import get_current_user
from core.models import WidgetPreference
from shared.schemas import PreferenceUpdate, WidgetPreferenceSchema

router = APIRouter()


# ─── Widgets ──────────────────────────────────────────────────────────────────

@router.get("/widgets")
async def list_widgets():
    from apps.todo.manifest import todo_manifest

    return todo_manifest.widgets


# ─── Tasks ────────────────────────────────────────────────────────────────────

@router.get("/tasks")
async def list_tasks(
    user_id: str = Depends(get_current_user),
    status: Literal["pending", "completed"] | None = Query(None),
    priority: Literal["low", "medium", "high"] | None = Query(None),
    tag: str | None = Query(None),
    limit: int = Query(20, le=100),
):
    """List tasks with optional filtering."""
    return await task_service.list_tasks(user_id, status, priority, tag, False, limit)


@router.get("/tasks/search")
async def search_tasks(
    q: str,
    user_id: str = Depends(get_current_user),
    include_archived: bool = Query(False),
    limit: int = Query(20, le=100),
):
    """Search tasks by query string."""
    return await task_service.search_tasks(user_id, q, include_archived, limit)


@router.get("/tasks/{task_id}")
async def get_task(task_id: str, user_id: str = Depends(get_current_user)):
    """Get a single task by ID with subtasks."""
    task = await task_service.get_task_with_subtasks(task_id, user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/tasks")
async def create_task(
    request: CreateTaskRequest,
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


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: str,
    request: UpdateTaskRequest,
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


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user_id: str = Depends(get_current_user)):
    """Permanently delete a task and all its subtasks."""
    try:
        return await task_service.delete_task(task_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/tasks/{task_id}/toggle")
async def toggle_task(task_id: str, user_id: str = Depends(get_current_user)):
    """Flip task between pending and completed."""
    try:
        return await task_service.toggle_task(task_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Archive ──────────────────────────────────────────────────────────────────

@router.patch("/tasks/{task_id}/archive")
async def archive_task(task_id: str, user_id: str = Depends(get_current_user)):
    """Archive (soft delete) a task."""
    try:
        return await task_service.archive_task(task_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/tasks/{task_id}/restore")
async def restore_task(task_id: str, user_id: str = Depends(get_current_user)):
    """Restore an archived task."""
    try:
        return await task_service.restore_task(task_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/tasks/archived/list")
async def list_archived(
    user_id: str = Depends(get_current_user),
    limit: int = Query(20, le=100),
):
    """List archived (soft deleted) tasks."""
    return await task_service.list_archived(user_id, limit)


# ─── Tags ─────────────────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/tags/{tag}")
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


@router.delete("/tasks/{task_id}/tags/{tag}")
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

@router.get("/tasks/{task_id}/subtasks")
async def get_subtasks(task_id: str, user_id: str = Depends(get_current_user)):
    """Get all subtasks for a parent task."""
    return await task_service.get_subtasks(task_id, user_id)


@router.post("/tasks/{task_id}/subtasks")
async def add_subtask(
    task_id: str,
    request: CreateSubTaskRequest,
    user_id: str = Depends(get_current_user),
):
    """Add a subtask to a parent task."""
    try:
        return await task_service.add_subtask(task_id, user_id, request.title)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/subtasks/{subtask_id}/complete")
async def complete_subtask(
    subtask_id: str,
    user_id: str = Depends(get_current_user),
):
    """Mark a subtask as completed."""
    try:
        return await task_service.complete_subtask(subtask_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/subtasks/{subtask_id}/uncomplete")
async def uncomplete_subtask(
    subtask_id: str,
    user_id: str = Depends(get_current_user),
):
    """Mark a completed subtask as not completed."""
    try:
        return await task_service.uncomplete_subtask(subtask_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/subtasks/{subtask_id}")
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

@router.post("/tasks/{task_id}/recurring")
async def create_recurring_rule(
    task_id: str,
    request: CreateRecurringRuleRequest,
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


@router.get("/recurring")
async def list_recurring_rules(user_id: str = Depends(get_current_user)):
    """List all recurring task rules."""
    return await task_service.list_recurring_rules(user_id)


@router.patch("/recurring/{rule_id}/stop")
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

@router.get("/summary")
async def todo_summary(user_id: str = Depends(get_current_user)):
    return await task_service.get_summary(user_id)


# ─── Preferences ──────────────────────────────────────────────────────────────

@router.get("/preferences")
async def get_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == "todo",
    ).to_list()
    return [
        WidgetPreferenceSchema(
            id=str(p.id),
            user_id=str(p.user_id),
            widget_id=p.widget_id,
            app_id=p.app_id,
            enabled=p.enabled,
            position=p.position,
            config=p.config,
        )
        for p in prefs
    ]


@router.put("/preferences")
async def update_preferences(
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    for u in updates:
        pref = await WidgetPreference.find_one(
            WidgetPreference.user_id == PydanticObjectId(user_id),
            WidgetPreference.app_id == "todo",
            WidgetPreference.widget_id == u.widget_id,
        )
        if pref:
            if u.enabled is not None:
                pref.enabled = u.enabled
            if u.position is not None:
                pref.position = u.position
            if u.config is not None:
                pref.config = u.config
            await pref.save()
    return await get_preferences(user_id)
