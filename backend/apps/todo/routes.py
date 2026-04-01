"""Todo plugin FastAPI routes."""

from typing import Literal

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from apps.todo.schemas import CreateTaskRequest, UpdateTaskRequest
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


# ─── Tasks ─────────────────────────────────────────────────────────────────────

@router.get("/tasks")
async def list_tasks(
    user_id: str = Depends(get_current_user),
    status: Literal["pending", "completed"] | None = Query(None),
    priority: Literal["low", "medium", "high"] | None = Query(None),
    limit: int = Query(20, le=100),
):
    return await task_service.list_tasks(user_id, status, priority, limit)


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: str,
    user_id: str = Depends(get_current_user),
):
    """Get a single task by ID."""
    task = await task_service.get_task(task_id, user_id)
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
            request.priority,
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
            request.priority,
            request.status,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    user_id: str = Depends(get_current_user),
):
    try:
        return await task_service.delete_task(task_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/tasks/{task_id}/toggle")
async def toggle_task(
    task_id: str,
    user_id: str = Depends(get_current_user),
):
    """Flip task between pending and completed."""
    try:
        return await task_service.toggle_task(task_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Summary ────────────────────────────────────────────────────────────────────

@router.get("/summary")
async def todo_summary(user_id: str = Depends(get_current_user)):
    return await task_service.get_summary(user_id)


# ─── Preferences ────────────────────────────────────────────────────────────────

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
