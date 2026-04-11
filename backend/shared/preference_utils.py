"""Shared utilities for widget preference operations.

Provides common functions for updating widget preferences without code duplication
across multiple app routes.
"""

from beanie import PydanticObjectId
from beanie.operators import In
from pymongo import ReturnDocument, UpdateOne

from core.db import get_db
from core.models import WidgetPreference
from shared.schemas import PreferenceUpdate


def _apply_update_to_preference(
    pref: WidgetPreference,
    update: PreferenceUpdate,
) -> None:
    update_payload = update.model_dump(exclude_unset=True)

    if update.enabled is not None:
        pref.enabled = update.enabled

    if update.sort_order is not None:
        pref.sort_order = update.sort_order

    if update.grid_x is not None:
        pref.grid_x = update.grid_x

    if update.grid_y is not None:
        pref.grid_y = update.grid_y

    if update.size_w is not None:
        pref.size_w = update.size_w
    elif "size_w" in update_payload:
        pref.size_w = None

    if update.size_h is not None:
        pref.size_h = update.size_h
    elif "size_h" in update_payload:
        pref.size_h = None


def _build_update_document(
    update: PreferenceUpdate,
    *,
    user_object_id: PydanticObjectId,
    app_id: str,
) -> dict[str, dict]:
    payload = update.model_dump(exclude_unset=True)
    set_payload = {
        key: payload[key]
        for key in ("enabled", "sort_order", "grid_x", "grid_y", "size_w", "size_h")
        if key in payload
    }
    insert_defaults = {
        "user_id": user_object_id,
        "app_id": app_id,
        "widget_id": update.widget_id,
        "enabled": False,
        "sort_order": 0,
        "grid_x": 0,
        "grid_y": 0,
        "size_w": None,
        "size_h": None,
    }
    set_on_insert = {
        key: value
        for key, value in insert_defaults.items()
        if key not in set_payload
    }

    update_document: dict[str, dict] = {"$setOnInsert": set_on_insert}
    if set_payload:
        update_document["$set"] = set_payload
    return update_document


async def update_widget_preference(
    user_id: str,
    update: PreferenceUpdate,
    app_id: str,
) -> WidgetPreference | None:
    """Update or create a single widget preference for a user."""
    user_object_id = PydanticObjectId(user_id)
    collection = get_db()["widget_preferences"]
    updated = await collection.find_one_and_update(
        {
            "user_id": user_object_id,
            "app_id": app_id,
            "widget_id": update.widget_id,
        },
        {
            **_build_update_document(
                update,
                user_object_id=user_object_id,
                app_id=app_id,
            ),
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        return None
    return WidgetPreference.model_validate(updated)


async def update_multiple_preferences(
    user_id: str,
    updates: list[PreferenceUpdate],
    app_id: str,
) -> list[WidgetPreference]:
    """Update or create multiple widget preferences for a user."""
    if not updates:
        return []

    latest_by_widget_id: dict[str, PreferenceUpdate] = {}
    for update in updates:
        latest_by_widget_id[update.widget_id] = update

    user_object_id = PydanticObjectId(user_id)
    collection = get_db()["widget_preferences"]
    operations = [
        UpdateOne(
            {
                "user_id": user_object_id,
                "app_id": app_id,
                "widget_id": update.widget_id,
            },
            {
                **_build_update_document(
                    update,
                    user_object_id=user_object_id,
                    app_id=app_id,
                ),
            },
            upsert=True,
        )
        for update in latest_by_widget_id.values()
    ]

    await collection.bulk_write(operations, ordered=False)

    widget_ids = list(latest_by_widget_id.keys())
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == user_object_id,
        WidgetPreference.app_id == app_id,
        In(WidgetPreference.widget_id, widget_ids),
    ).to_list()

    pref_by_widget_id = {pref.widget_id: pref for pref in prefs}
    return [
        pref_by_widget_id[widget_id]
        for widget_id in widget_ids
        if widget_id in pref_by_widget_id
    ]


def preference_to_schema(
    pref: WidgetPreference,
    schema_class: type = None,
) -> dict:
    """Convert a WidgetPreference document to a schema dict.

    Args:
        pref: The WidgetPreference document
        schema_class: Optional schema class to instantiate

    Returns:
        Dict representation of the preference
    """
    from shared.schemas import WidgetPreferenceSchema

    if schema_class is None:
        schema_class = WidgetPreferenceSchema

    return schema_class(
        id=str(pref.id),
        user_id=str(pref.user_id),
        widget_id=pref.widget_id,
        app_id=pref.app_id,
        enabled=pref.enabled,
        sort_order=pref.sort_order,
        grid_x=pref.grid_x,
        grid_y=pref.grid_y,
        size_w=pref.size_w,
        size_h=pref.size_h,
    )
