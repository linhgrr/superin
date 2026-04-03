"""Shared utilities for widget preference operations.

Provides common functions for updating widget preferences without code duplication
across multiple app routes.
"""

from beanie import PydanticObjectId
from beanie.operators import In

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

    if update.config is not None:
        pref.config = update.config

    if update.size_w is not None:
        pref.size_w = update.size_w
    elif "size_w" in update_payload:
        pref.size_w = None

    if update.size_h is not None:
        pref.size_h = update.size_h
    elif "size_h" in update_payload:
        pref.size_h = None


async def update_widget_preference(
    user_id: str,
    update: PreferenceUpdate,
    app_id: str,
) -> WidgetPreference | None:
    """Update a single widget preference for a user."""
    pref = await WidgetPreference.find_one(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == app_id,
        WidgetPreference.widget_id == update.widget_id,
    )

    if not pref:
        return None

    _apply_update_to_preference(pref, update)

    await pref.save()
    return pref


async def update_multiple_preferences(
    user_id: str,
    updates: list[PreferenceUpdate],
    app_id: str,
) -> list[WidgetPreference]:
    """Update multiple widget preferences for a user with one read and batched writes."""
    if not updates:
        return []

    widget_ids = [update.widget_id for update in updates]
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == app_id,
        In(WidgetPreference.widget_id, widget_ids),
    ).to_list()

    pref_by_widget_id = {pref.widget_id: pref for pref in prefs}
    results: list[WidgetPreference] = []

    async with WidgetPreference.bulk_writer() as bulk_writer:
        for update in updates:
            pref = pref_by_widget_id.get(update.widget_id)
            if not pref:
                continue

            _apply_update_to_preference(pref, update)
            await pref.replace(bulk_writer=bulk_writer)
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
