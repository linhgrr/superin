"""Workspace runtime bootstrap and installed-app access helpers."""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from beanie import PydanticObjectId
from beanie.operators import In
from fastapi import APIRouter, Depends, HTTPException, Request

from core.auth import get_current_user
from core.models import UserAppInstallation, WidgetPreference
from core.registry import get_plugin
from shared.enums import SubscriptionTier
from shared.permissions import meets_minimum_tier
from shared.preference_utils import preference_to_schema
from shared.schemas import AppRuntimeEntry, WidgetPreferenceSchema, WorkspaceBootstrap

if TYPE_CHECKING:
    pass

router = APIRouter()


async def list_installed_app_ids(user_id: str) -> list[str]:
    """Return active installed app ids for a user in installation order."""
    installations = await UserAppInstallation.find(
        UserAppInstallation.user_id == PydanticObjectId(user_id),
        UserAppInstallation.status == "active",
    ).sort("installed_at").to_list()
    return [installation.app_id for installation in installations]


async def get_installed_app_id_set(user_id: str, request: Request) -> set[str]:
    """Return and cache active installed app ids for the current request."""
    cache_key = "_installed_app_ids"
    cached = getattr(request.state, cache_key, None)
    if cached is not None:
        return cached

    installed_app_ids = set(await list_installed_app_ids(user_id))
    setattr(request.state, cache_key, installed_app_ids)
    return installed_app_ids


async def list_installed_apps(user_id: str) -> list[AppRuntimeEntry]:
    """Build runtime app entries from installed plugins only."""
    installed_app_ids = await list_installed_app_ids(user_id)
    installed_apps: list[AppRuntimeEntry] = []

    for app_id in installed_app_ids:
        plugin = get_plugin(app_id)
        if not plugin:
            continue

        manifest = plugin["manifest"]
        installed_apps.append(
            AppRuntimeEntry(
                id=manifest.id,
                name=manifest.name,
                description=manifest.description,
                icon=manifest.icon,
                color=manifest.color,
                category=manifest.category,
                version=manifest.version,
                author=manifest.author,
                widgets=manifest.widgets,
                requires_tier=manifest.requires_tier,
            )
        )

    return installed_apps


async def list_workspace_preferences(
    user_id: str,
    installed_app_ids: list[str],
) -> list[WidgetPreferenceSchema]:
    """Return widget preferences scoped to active installed apps only."""
    if not installed_app_ids:
        return []

    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        In(WidgetPreference.app_id, installed_app_ids),
    ).to_list()
    return [preference_to_schema(pref) for pref in prefs]


async def build_workspace_bootstrap(user_id: str) -> WorkspaceBootstrap:
    """Build the authenticated workspace runtime payload."""
    installed_apps = await list_installed_apps(user_id)
    installed_app_ids = [app.id for app in installed_apps]
    widget_preferences = await list_workspace_preferences(user_id, installed_app_ids)
    return WorkspaceBootstrap(
        installed_apps=installed_apps,
        widget_preferences=widget_preferences,
    )


@router.get("/bootstrap")
async def get_workspace_bootstrap(
    user_id: str = Depends(get_current_user),
) -> WorkspaceBootstrap:
    """Return installed apps and widget preferences for the authenticated user."""
    return await build_workspace_bootstrap(user_id)


def require_installed_app(app_id: str) -> Callable:
    """Create a dependency that rejects access to apps the user has not installed."""

    async def dependency(
        request: Request,
        user_id: str = Depends(get_current_user),
    ) -> None:
        installed_app_ids = await get_installed_app_id_set(user_id, request)
        if app_id not in installed_app_ids:
            raise HTTPException(status_code=403, detail=f"App '{app_id}' is not installed")

        # Check tier requirement against user's subscription
        plugin = get_plugin(app_id)
        if plugin:
            required_tier: SubscriptionTier = plugin["manifest"].requires_tier
            # Avoid circular import: resolve Subscription at call time
            from apps.billing.models import Subscription  # noqa: PLC0415
            sub = await Subscription.find_one(
                Subscription.user_id == PydanticObjectId(user_id),
            )
            user_tier: SubscriptionTier = sub.tier if sub else "free"
            if not meets_minimum_tier(user_tier, required_tier):
                raise HTTPException(
                    status_code=403,
                    detail=f"App '{app_id}' requires a {required_tier} subscription.",
                )

    return dependency
