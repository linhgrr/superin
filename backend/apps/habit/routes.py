"""Habit plugin FastAPI routes — thin layer calling habit_service."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from beanie import PydanticObjectId

from core.auth import get_current_user
from core.models import WidgetPreference
from .service import habit_service
from .schemas import (
    CreateHabitRequest,
    UpdateHabitRequest,
)
from shared.schemas import WidgetPreferenceSchema, PreferenceUpdate

router = APIRouter()


# ─── Widgets ──────────────────────────────────────────────────────────────────

@router.get("/widgets")
async def list_widgets():
    from .manifest import habit_manifest
    return habit_manifest.widgets


# ─── CRUD endpoints ────────────────────────────────────────────────────────────
# TODO: rename/add/remove based on your model

@router.get("/habits")
async def list_habit(
    user_id: str = Depends(get_current_user),
    # TODO: add filter query params, e.g.: status: str | None = None,
    limit: int = Query(20, le=100),
):
    return await habit_service.list(user_id, # TODO: pass params, e.g.: status=status,
        limit=limit)


@router.post("/habits")
async def create_habit(
    request: CreateHabitRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        return await habit_service.create(user_id, # TODO: unpack fields from request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/habits/{habit_id}")
async def get_habit(
    habit_id: str,
    user_id: str = Depends(get_current_user),
):
    doc = await habit_service.get(habit_id, user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Habit not found")
    return doc


@router.patch("/habits/{habit_id}")
async def update_habit(
    habit_id: str,
    request: UpdateHabitRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        return await habit_service.update(habit_id, user_id, # TODO: unpack fields)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/habits/{habit_id}")
async def delete_habit(
    habit_id: str,
    user_id: str = Depends(get_current_user),
):
    try:
        return await habit_service.delete(habit_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Preferences (required by platform) ────────────────────────────────────────

@router.get("/preferences")
async def get_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == "habit",
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
            WidgetPreference.app_id == "habit",
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
