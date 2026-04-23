"""Workspace domain — installed app access helpers."""

import asyncio
from collections.abc import Callable
from typing import TYPE_CHECKING, Any, cast

from beanie import PydanticObjectId
from beanie.operators import In
from fastapi import Depends, HTTPException, Request

from core.auth.dependencies import get_current_user
from core.models import User, UserAppInstallation, WidgetDataConfig, WidgetPreference
from core.registry import WIDGET_DATA_HANDLERS, get_plugin
from core.widget_config import resolve_widget_config_from_serialized
from shared.enums import InstallationStatus, SubscriptionTier, UserRole
from shared.permissions import meets_minimum_tier
from shared.preference_utils import preference_to_schema
from shared.schemas import (
    AppRuntimeEntry,
    WidgetDataConfigSchema,
    WidgetManifestSchema,
    WidgetPreferenceSchema,
    WorkspaceBootstrap,
)

if TYPE_CHECKING:
    pass


async def list_installed_app_ids(user_id: str) -> list[str]:
    """Return active installed app ids for a user in installation order."""
    installations = await UserAppInstallation.find(
        UserAppInstallation.user_id == PydanticObjectId(user_id),
        UserAppInstallation.status == InstallationStatus.ACTIVE,
    ).sort("installed_at").to_list()
    return [installation.app_id for installation in installations]


async def get_installed_app_id_set(user_id: str, request: Request) -> set[str]:
    """Return and cache active installed app ids for the current request."""
    cache_key = "_installed_app_ids"
    cached = getattr(request.state, cache_key, None)
    if cached is not None:
        return cast(set[str], cached)

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

    # Load widget data configs for all installed apps
    widget_data_configs = await WidgetDataConfig.find(
        WidgetDataConfig.user_id == PydanticObjectId(user_id),
    ).to_list()
    widget_data_config_schemas = [
        WidgetDataConfigSchema(
            _id=str(doc.id),
            user_id=str(doc.user_id),
            widget_id=doc.widget_id,
            config=doc.config,
        )
        for doc in widget_data_configs
    ]
    initial_widget_data = await build_initial_widget_data(
        user_id,
        installed_apps,
        widget_preferences,
        widget_data_config_schemas,
    )

    return WorkspaceBootstrap(
        installed_apps=installed_apps,
        widget_preferences=widget_preferences,
        widget_data_configs=widget_data_config_schemas,
        initial_widget_data=initial_widget_data,
    )


def _is_widget_enabled(widget: WidgetManifestSchema, preference: WidgetPreferenceSchema | None) -> bool:
    return preference.enabled if preference is not None else not widget.requires_auth


async def build_initial_widget_data(
    user_id: str,
    installed_apps: list[AppRuntimeEntry],
    widget_preferences: list[WidgetPreferenceSchema],
    widget_data_configs: list[WidgetDataConfigSchema],
) -> dict[str, object]:
    """Resolve first-paint widget payloads in parallel for enabled widgets."""
    preference_by_widget_id = {
        preference.widget_id: preference
        for preference in widget_preferences
    }
    config_by_widget_id = {
        config.widget_id: config.config
        for config in widget_data_configs
    }

    async def load_widget_data(widget_id: str) -> tuple[str, object] | None:
        handler = WIDGET_DATA_HANDLERS.get(widget_id)
        if handler is None:
            return None

        config = resolve_widget_config_from_serialized(
            widget_id,
            config_by_widget_id.get(widget_id),
        )
        try:
            return widget_id, await handler(user_id, cast(Any, config))
        except Exception:
            return None

    tasks = [
        load_widget_data(widget.id)
        for app in installed_apps
        for widget in app.widgets
        if _is_widget_enabled(widget, preference_by_widget_id.get(widget.id))
    ]
    if not tasks:
        return {}

    results = await asyncio.gather(*tasks)
    return {
        widget_id: data
        for item in results
        if item is not None
        for widget_id, data in [item]
    }


def require_installed_app(app_id: str) -> Callable:
    """FastAPI dependency — rejects access to apps the user has not installed."""

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
            user = await User.get(PydanticObjectId(user_id))
            if user and user.role == UserRole.ADMIN:
                return

            from core.subscriptions.service import get_effective_tier  # noqa: PLC0415

            user_tier = await get_effective_tier(user_id)
            if not meets_minimum_tier(user_tier, required_tier):
                raise HTTPException(
                    status_code=403,
                    detail=f"App '{app_id}' requires a {required_tier} subscription.",
                )

    return dependency
