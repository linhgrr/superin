"""App catalog routes — list apps, install/uninstall, widget preferences.

Core platform routes at prefix /api/catalog (NOT /api/apps to avoid
conflicting with plugin routes at /api/apps/{app_id}).

Plugin-specific data routes live in each plugin's routes.py at /api/apps/{app_id}.
"""

from fastapi import APIRouter, Depends, HTTPException
from beanie import PydanticObjectId

from core.auth import get_current_user, get_current_user_optional
from core.models import UserAppInstallation, WidgetPreference
from core.registry import list_plugins
from shared.schemas import (
    AppCatalogEntry,
    AppInstallRequest,
    AppUninstallRequest,
    WidgetPreferenceSchema,
    PreferenceUpdate,
)

router = APIRouter()


# ─── Catalog ──────────────────────────────────────────────────────────────────

@router.get("")
async def list_catalog(
    user_id: str | None = Depends(get_current_user_optional),
) -> list[AppCatalogEntry]:
    """List all available apps, marking installed apps for authenticated users."""
    manifests = list_plugins()
    installed_ids: set[str] = set()

    if user_id:
        installations = await UserAppInstallation.find(
            UserAppInstallation.user_id == PydanticObjectId(user_id),
            UserAppInstallation.status == "active",
        ).to_list()
        installed_ids = {inst.app_id for inst in installations}

    return [
        AppCatalogEntry(
            id=m.id,
            name=m.name,
            description=m.description,
            icon=m.icon,
            color=m.color,
            category=m.category,
            version=m.version,
            author=m.author,
            is_installed=m.id in installed_ids,
            tags=m.tags,
            screenshots=m.screenshots,
        )
        for m in manifests
    ]


# ─── Install / Uninstall ────────────────────────────────────────────────────────

@router.post("/install")
async def install_app(
    request: AppInstallRequest,
    user_id: str = Depends(get_current_user),
) -> dict:
    """Install an app for the current user."""
    from core.registry import get_plugin
    plugin = get_plugin(request.app_id)
    if not plugin:
        raise HTTPException(status_code=404, detail=f"App '{request.app_id}' not found")

    existing = await UserAppInstallation.find_one(
        UserAppInstallation.user_id == PydanticObjectId(user_id),
        UserAppInstallation.app_id == request.app_id,
    )
    if existing:
        existing.status = "active"
        await existing.save()
    else:
        await UserAppInstallation(
            user_id=PydanticObjectId(user_id),
            app_id=request.app_id,
            status="active",
        ).insert()

    for widget in plugin["manifest"].widgets:
        existing_pref = await WidgetPreference.find_one(
            WidgetPreference.user_id == PydanticObjectId(user_id),
            WidgetPreference.widget_id == widget.id,
        )
        if not existing_pref:
            await WidgetPreference(
                user_id=PydanticObjectId(user_id),
                widget_id=widget.id,
                app_id=request.app_id,
                enabled=True,
                position=0,
                config={},
            ).insert()

    await plugin["agent"].on_install(user_id)
    return {"status": "installed", "app_id": request.app_id}


@router.post("/uninstall")
async def uninstall_app(
    request: AppUninstallRequest,
    user_id: str = Depends(get_current_user),
) -> dict:
    """Uninstall an app for the current user (soft delete)."""
    installation = await UserAppInstallation.find_one(
        UserAppInstallation.user_id == PydanticObjectId(user_id),
        UserAppInstallation.app_id == request.app_id,
    )
    if not installation:
        raise HTTPException(status_code=404, detail="App not installed")

    installation.status = "disabled"
    await installation.save()

    from core.registry import get_plugin
    plugin = get_plugin(request.app_id)
    if plugin:
        await plugin["agent"].on_uninstall(user_id)

    return {"status": "uninstalled", "app_id": request.app_id}


# ─── Widget Preferences ────────────────────────────────────────────────────────
# Route at /preferences/{app_id} to avoid conflict with plugin routes
# at /api/apps/{app_id}/... which take priority in FastAPI routing.

@router.get("/preferences/{app_id}")
async def get_preferences(
    app_id: str,
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    """Get all widget preferences for the authenticated user in a given app."""
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == app_id,
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


@router.put("/preferences/{app_id}")
async def update_preferences(
    app_id: str,
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    """Batch-update widget preferences."""
    for u in updates:
        pref = await WidgetPreference.find_one(
            WidgetPreference.user_id == PydanticObjectId(user_id),
            WidgetPreference.app_id == app_id,
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

    return await get_preferences(app_id, user_id)
