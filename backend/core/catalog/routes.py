"""App catalog routes — list apps, install/uninstall, categories."""

from beanie import PydanticObjectId
from beanie.operators import In
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.auth.dependencies import (
    get_current_admin_user,
    get_current_user,
    get_current_user_optional,
)
from core.catalog.service import (
    UnknownAppError,
    install_app_for_user,
    uninstall_app_for_user,
)
from core.models import AppCategory, UserAppInstallation, WidgetPreference
from core.registry import list_categories as list_registry_categories
from core.registry import list_plugins
from core.workspace.service import list_installed_app_ids
from shared.preference_utils import (
    preference_to_schema,
    update_multiple_preferences,
)
from shared.schemas import (
    AppCatalogEntry,
    AppCategoryRead,
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

@router.get("/categories", response_model=list[AppCategoryRead])
async def list_categories() -> list[AppCategoryRead]:
    """List all app categories, merged from DB and app registry."""
    db_cats = await AppCategory.find_all().sort("order").to_list()
    registry_cats = list_registry_categories()

    merged: dict[str, AppCategoryRead] = {}

    for cat in db_cats:
        cat_id = cat.name.lower()
        merged[cat_id] = _cat_to_read(cat)

    for cat in registry_cats:
        cat_id = cat["id"].lower()
        if cat_id not in merged:
            merged[cat_id] = AppCategoryRead(
                id=cat["id"],
                name=cat["name"],
                icon=cat["icon"],
                color=cat["color"],
                order=999,
                auto_discovered=True,
            )

    return sorted(merged.values(), key=lambda x: (x.order, x.name))


@router.post("/categories", response_model=AppCategoryRead)
async def create_category(
    request: CreateCategoryRequest,
    admin_user_id: str = Depends(get_current_admin_user),
) -> AppCategoryRead:
    """Create a new app category. Requires admin."""
    existing = await AppCategory.find_one(AppCategory.name == request.name)
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{request.name}' already exists")
    cat = await AppCategory(
        name=request.name,
        icon=request.icon,
        color=request.color,
        order=request.order,
    ).insert()
    return _cat_to_read(cat)


@router.patch("/categories/{category_id}", response_model=AppCategoryRead)
async def update_category(
    category_id: str,
    request: UpdateCategoryRequest,
    admin_user_id: str = Depends(get_current_admin_user),
) -> AppCategoryRead:
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
    return _cat_to_read(cat)


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    admin_user_id: str = Depends(get_current_admin_user),
) -> dict:
    """Delete an app category."""
    cat = await AppCategory.find_one(AppCategory.id == PydanticObjectId(category_id))
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    await cat.delete()
    return {"success": True, "id": category_id}


def _cat_to_read(c: AppCategory) -> AppCategoryRead:
    return AppCategoryRead(
        id=str(c.id),
        name=c.name,
        icon=c.icon,
        color=c.color,
        order=c.order,
    )


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
            requires_tier=m.requires_tier,
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
    try:
        result = await install_app_for_user(user_id, request.app_id)
    except UnknownAppError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {
        "status": result["status"],
        "app_id": result["app_id"],
        **({"app_name": result["app_name"]} if "app_name" in result else {}),
    }


@router.post("/uninstall")
async def uninstall_app(
    request: AppUninstallRequest,
    user_id: str = Depends(get_current_user),
) -> dict:
    """Uninstall an app for the current user (soft delete)."""
    try:
        result = await uninstall_app_for_user(user_id, request.app_id)
    except UnknownAppError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {
        "status": result["status"],
        "app_id": result["app_id"],
        **({"app_name": result["app_name"]} if "app_name" in result else {}),
    }


# ─── Widget Preferences ────────────────────────────────────────────────────────

@router.get("/preferences")
async def get_all_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    """Get all widget preferences for the authenticated user across all apps."""
    installed_app_ids = await list_installed_app_ids(user_id)
    if not installed_app_ids:
        return []

    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        In(WidgetPreference.app_id, installed_app_ids),
    ).to_list()
    return [preference_to_schema(p) for p in prefs]


@router.get("/preferences/{app_id}")
async def get_preferences(
    app_id: str,
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    """Get all widget preferences for the authenticated user in a given app."""
    installed_app_ids = await list_installed_app_ids(user_id)
    if app_id not in installed_app_ids:
        raise HTTPException(status_code=403, detail=f"App '{app_id}' is not installed")

    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == app_id,
    ).to_list()
    return [preference_to_schema(p) for p in prefs]


@router.put("/preferences/{app_id}")
async def update_preferences(
    app_id: str,
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    """Batch-update widget preferences using shared utility."""
    installed_app_ids = await list_installed_app_ids(user_id)
    if app_id not in installed_app_ids:
        raise HTTPException(status_code=403, detail=f"App '{app_id}' is not installed")

    await update_multiple_preferences(user_id, updates, app_id)
    return await get_preferences(app_id, user_id)
