"""Catalog domain helpers shared by API routes and root-agent tools."""

from __future__ import annotations

from typing import Any

from beanie import PydanticObjectId
from beanie.operators import In

from core.db import get_db
from core.models import UserAppInstallation, WidgetPreference, utc_now
from core.registry import get_plugin
from shared.enums import INSTALL_STATUS_ALREADY_INSTALLED


class UnknownAppError(ValueError):
    """Raised when an app_id does not exist in the plugin registry."""

    def __init__(self, app_id: str) -> None:
        super().__init__(f"App '{app_id}' not found")
        self.app_id = app_id


async def install_app_for_user(user_id: str, app_id: str) -> dict[str, str]:
    """Install an app for a user and seed any missing widget preferences."""
    plugin = get_plugin(app_id)
    if not plugin:
        raise UnknownAppError(app_id)

    db = get_db()
    previous = await db["user_app_installations"].find_one_and_update(
        {"user_id": PydanticObjectId(user_id), "app_id": app_id},
        {
            "$set": {"status": "active"},
            "$setOnInsert": {
                "user_id": PydanticObjectId(user_id),
                "app_id": app_id,
                "installed_at": utc_now(),
            },
        },
        upsert=True,
        return_document=False,
    )

    if previous and previous.get("status") == "active":
        return {
            "status": INSTALL_STATUS_ALREADY_INSTALLED,
            "app_id": app_id,
            "app_name": plugin["manifest"].name,
        }

    await plugin["agent"].on_install(user_id)
    await _seed_widget_preferences(user_id, app_id, plugin["manifest"].widgets)

    return {
        "status": "installed",
        "app_id": app_id,
        "app_name": plugin["manifest"].name,
    }


async def uninstall_app_for_user(user_id: str, app_id: str) -> dict[str, str]:
    """Disable an installed app for a user."""
    plugin = get_plugin(app_id)
    if not plugin:
        raise UnknownAppError(app_id)

    installation = await UserAppInstallation.find_one(
        UserAppInstallation.user_id == PydanticObjectId(user_id),
        UserAppInstallation.app_id == app_id,
        UserAppInstallation.status == "active",
    )
    if not installation:
        return {
            "status": "already_uninstalled",
            "app_id": app_id,
            "app_name": plugin["manifest"].name,
        }

    await plugin["agent"].on_uninstall(user_id)
    installation.status = "disabled"
    await installation.save()

    return {
        "status": "uninstalled",
        "app_id": app_id,
        "app_name": plugin["manifest"].name,
    }


async def _seed_widget_preferences(user_id: str, app_id: str, widgets: list[Any]) -> None:
    """Create missing widget preferences for an installed app."""
    widget_ids = [widget.id for widget in widgets]
    if not widget_ids:
        return

    existing_prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        In(WidgetPreference.widget_id, widget_ids),
    ).to_list()
    existing_ids = {pref.widget_id for pref in existing_prefs}

    to_insert = [
        WidgetPreference(
            user_id=PydanticObjectId(user_id),
            widget_id=widget.id,
            app_id=app_id,
            enabled=True,
            sort_order=index,
            config={},
        )
        for index, widget in enumerate(widgets)
        if widget.id not in existing_ids
    ]
    if to_insert:
        await WidgetPreference.insert_many(to_insert)
