"""Shared utilities for widget preference operations.

Provides common functions for updating widget preferences without code duplication
across multiple app routes.
"""

from beanie import PydanticObjectId

from core.models import WidgetPreference
from shared.schemas import PreferenceUpdate


async def update_widget_preference(
    user_id: str,
    update: PreferenceUpdate,
    app_id: str,
) -> WidgetPreference | None:
    """Update a single widget preference for a user.

    This is a shared utility to avoid code duplication across app routes.
    Handles all fields including sort_order, config, size_w, and size_h.

    Args:
        user_id: The user ID
        update: The preference update payload
        app_id: The app ID (e.g. 'finance', 'todo')

    Returns:
        The updated WidgetPreference document, or None if not found
    """
    pref = await WidgetPreference.find_one(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == app_id,
        WidgetPreference.widget_id == update.widget_id,
    )

    if not pref:
        return None

    # Update enabled status
    if update.enabled is not None:
        pref.enabled = update.enabled

    # Update sort order (renamed from position)
    if update.sort_order is not None:
        pref.sort_order = update.sort_order

    # Update config dict
    if update.config is not None:
        pref.config = update.config

    # Update size_w: explicit None means reset to default
    if update.size_w is not None:
        pref.size_w = update.size_w
    else:
        # Check if size_w was explicitly provided (even as null)
        if "size_w" in update.model_dump(exclude_unset=True):
            pref.size_w = None

    # Update size_h: explicit None means reset to default
    if update.size_h is not None:
        pref.size_h = update.size_h
    else:
        if "size_h" in update.model_dump(exclude_unset=True):
            pref.size_h = None

    await pref.save()
    return pref


async def update_multiple_preferences(
    user_id: str,
    updates: list[PreferenceUpdate],
    app_id: str,
) -> list[WidgetPreference]:
    """Update multiple widget preferences for a user.

    Args:
        user_id: The user ID
        updates: List of preference update payloads
        app_id: The app ID

    Returns:
        List of updated WidgetPreference documents
    """
    results = []
    for update in updates:
        pref = await update_widget_preference(user_id, update, app_id)
        if pref:
            results.append(pref)
    return results


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
        config=pref.config,
        size_w=pref.size_w,
        size_h=pref.size_h,
    )
