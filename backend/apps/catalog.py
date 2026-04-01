"""App catalog routes — list apps, install/uninstall, categories.

Core platform routes at prefix /api/catalog (NOT /api/apps to avoid
conflicting with plugin routes at /api/apps/{app_id}).

Plugin-specific data routes live in each plugin's routes.py at /api/apps/{app_id}.
"""


from beanie import PydanticObjectId
from beanie.operators import In
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.auth import get_current_user, get_current_user_optional
from core.models import AppCategory, UserAppInstallation, WidgetPreference
from core.registry import list_categories as list_registry_categories
from core.registry import list_plugins
from shared.schemas import (
    AppCatalogEntry,
    AppInstallRequest,
    AppUninstallRequest,
    PreferenceUpdate,
    WidgetPreferenceSchema,
)

router = APIRouter()


# ─── Schemas ───────────────────────────────────────────────────────────────────

class CreateCategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    icon: str = Field(default="Folder", max_length=30)
    color: str = Field(default="oklch(0.65 0.21 280)", max_length=50)
    order: int = Field(default=0)


class UpdateCategoryRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    icon: str | None = Field(None, max_length=30)
    color: str | None = Field(None, max_length=50)
    order: int | None = None


# ─── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories")
async def list_categories() -> list[dict]:
    """List all app categories, merged from DB and app registry.

    Categories are discovered from:
    1. AppCategory documents in DB (admin-managed categories)
    2. App manifests in PLUGIN_REGISTRY (auto-discovered from installed apps)

    This enables true plug-n-play: when a new app declares a new category,
    it automatically appears in the UI without manual registration.
    """
    # Get categories from DB
    db_cats = await AppCategory.find_all().sort("order").to_list()

    # Get categories from app registry
    registry_cats = list_registry_categories()

    # Merge: DB categories take priority, registry fills gaps
    merged: dict[str, dict] = {}

    # First, add all DB categories
    for cat in db_cats:
        cat_id = cat.name.lower()
        merged[cat_id] = _cat_to_dict(cat)

    # Then, add registry categories if not already in DB
    for cat in registry_cats:
        cat_id = cat["id"].lower()
        if cat_id not in merged:
            # Auto-discovered category from app manifest
            merged[cat_id] = {
                "id": cat["id"],  # Use category id as string id
                "name": cat["name"],
                "icon": cat["icon"],
                "color": cat["color"],
                "order": 999,  # Auto-discovered categories appear at end
                "auto_discovered": True,  # Flag for UI
            }

    # Return sorted by order, then name
    return sorted(merged.values(), key=lambda x: (x.get("order", 0), x["name"]))


@router.post("/categories")
async def create_category(
    request: CreateCategoryRequest,
    user_id: str = Depends(get_current_user),
) -> dict:
    """Create a new app category. Requires auth."""
    existing = await AppCategory.find_one(AppCategory.name == request.name)
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{request.name}' already exists")
    cat = await AppCategory(
        name=request.name,
        icon=request.icon,
        color=request.color,
        order=request.order,
    ).insert()
    return _cat_to_dict(cat)


@router.patch("/categories/{category_id}")
async def update_category(
    category_id: str,
    request: UpdateCategoryRequest,
    user_id: str = Depends(get_current_user),
) -> dict:
    """Update an app category."""
    cat = await AppCategory.find_one(AppCategory.id == PydanticObjectId(category_id))
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if request.name is not None:
        cat.name = request.name
    if request.icon is not None:
        cat.icon = request.icon
    if request.color is not None:
        cat.color = request.color
    if request.order is not None:
        cat.order = request.order
    await cat.save()
    return _cat_to_dict(cat)


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    user_id: str = Depends(get_current_user),
) -> dict:
    """Delete an app category."""
    cat = await AppCategory.find_one(AppCategory.id == PydanticObjectId(category_id))
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    await cat.delete()
    return {"success": True, "id": category_id}


def _cat_to_dict(c: AppCategory) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "icon": c.icon,
        "color": c.color,
        "order": c.order,
    }


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
            widgets=m.widgets,
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

    # Batch: fetch all existing widget prefs in one query
    widget_ids = [w.id for w in plugin["manifest"].widgets]
    existing_prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        In(WidgetPreference.widget_id, widget_ids),
    ).to_list()
    existing_ids = {p.widget_id for p in existing_prefs}

    # Insert only missing ones
    to_insert = [
        WidgetPreference(
            user_id=PydanticObjectId(user_id),
            widget_id=w.id,
            app_id=request.app_id,
            enabled=True,
            position=0,
            config={},
        )
        for w in plugin["manifest"].widgets
        if w.id not in existing_ids
    ]
    if to_insert:
        await WidgetPreference.insert_many(to_insert)

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

def _pref_to_schema(p: WidgetPreference) -> WidgetPreferenceSchema:
    return WidgetPreferenceSchema(
        id=str(p.id),
        user_id=str(p.user_id),
        widget_id=p.widget_id,
        app_id=p.app_id,
        enabled=p.enabled,
        position=p.position,
        config=p.config,
        size_w=p.size_w,
        size_h=p.size_h,
    )


@router.get("/preferences")
async def get_all_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    """Get all widget preferences for the authenticated user across all apps."""
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
    ).to_list()
    return [_pref_to_schema(p) for p in prefs]


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
    return [_pref_to_schema(p) for p in prefs]


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
            # size_w and size_h: explicit None means reset to default
            if u.size_w is not None:
                pref.size_w = u.size_w
            else:
                # Check if size_w was explicitly provided (even as null)
                # by checking if the field was set in the update
                if "size_w" in u.model_dump(exclude_unset=True):
                    pref.size_w = None
            if u.size_h is not None:
                pref.size_h = u.size_h
            else:
                if "size_h" in u.model_dump(exclude_unset=True):
                    pref.size_h = None
            await pref.save()

    return await get_preferences(app_id, user_id)
