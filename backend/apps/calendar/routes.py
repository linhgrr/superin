"""Calendar plugin FastAPI routes — thin layer calling calendar_service."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from beanie import PydanticObjectId

from core.auth import get_current_user
from core.models import WidgetPreference
from .service import calendar_service
from .schemas import (
    CreateCalendarRequest,
    UpdateCalendarRequest,
)
from shared.schemas import WidgetPreferenceSchema, PreferenceUpdate

router = APIRouter()


# ─── Widgets ──────────────────────────────────────────────────────────────────

@router.get("/widgets")
async def list_widgets():
    from .manifest import calendar_manifest
    return calendar_manifest.widgets


# ─── CRUD endpoints ────────────────────────────────────────────────────────────
# TODO: rename/add/remove based on your model

@router.get("/calendars")
async def list_calendar(
    user_id: str = Depends(get_current_user),
    # TODO: add filter query params, e.g.: status: str | None = None,
    limit: int = Query(20, le=100),
):
    return await calendar_service.list(user_id, # TODO: pass params, e.g.: status=status,
        limit=limit)


@router.post("/calendars")
async def create_calendar(
    request: CreateCalendarRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        return await calendar_service.create(user_id, # TODO: unpack fields from request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/calendars/{calendar_id}")
async def get_calendar(
    calendar_id: str,
    user_id: str = Depends(get_current_user),
):
    doc = await calendar_service.get(calendar_id, user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Calendar not found")
    return doc


@router.patch("/calendars/{calendar_id}")
async def update_calendar(
    calendar_id: str,
    request: UpdateCalendarRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        return await calendar_service.update(calendar_id, user_id, # TODO: unpack fields)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/calendars/{calendar_id}")
async def delete_calendar(
    calendar_id: str,
    user_id: str = Depends(get_current_user),
):
    try:
        return await calendar_service.delete(calendar_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Preferences (required by platform) ────────────────────────────────────────

@router.get("/preferences")
async def get_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == "calendar",
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
            WidgetPreference.app_id == "calendar",
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
