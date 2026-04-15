"""Widget preferences routes."""

from __future__ import annotations

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends

from core.auth.dependencies import get_current_user
from core.models import WidgetPreference
from shared.preference_utils import (
    preference_to_schema,
    update_multiple_preferences,
)
from shared.schemas import (
    PreferenceUpdate,
    WidgetPreferenceSchema,
)

router = APIRouter()


@router.get("/", response_model=list[WidgetPreferenceSchema])
async def get_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == "calendar",
    ).to_list()
    return [preference_to_schema(p) for p in prefs]


@router.put("/", response_model=list[WidgetPreferenceSchema])
async def update_preferences(
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    await update_multiple_preferences(user_id, updates, "calendar")
    return await get_preferences(user_id)
