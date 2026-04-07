"""Plugin registry — singleton store for all registered app plugins.

Plugins call register_plugin() in their __init__.py.
The platform reads PLUGIN_REGISTRY at startup to mount routers, expose catalog, etc.
"""

from typing import TYPE_CHECKING, TypedDict

from fastapi import APIRouter

if TYPE_CHECKING:
    from core.agents.base_app import BaseAppAgent

from shared.schemas import AppManifestSchema


class PluginEntry(TypedDict):
    """The shape stored in PLUGIN_REGISTRY after register_plugin()."""

    manifest: AppManifestSchema
    agent: "BaseAppAgent"
    router: APIRouter
    models: list[type]


# ─── Registry ─────────────────────────────────────────────────────────────────

PLUGIN_REGISTRY: dict[str, PluginEntry] = {}

# Track Beanie document models from plugins so init_beanie() can load them
_plugin_models: list[type] = []


# ─── Category Registry ───────────────────────────────────────────────────────

class CategoryEntry(TypedDict):
    """Category metadata from app registration."""

    id: str  # category id, e.g., "finance", "productivity"
    name: str  # display name, e.g., "Finance", "Productivity"
    color: str  # oklch color string
    icon: str  # Lucide icon name
    app_id: str  # source app that registered this category


CATEGORY_REGISTRY: dict[str, CategoryEntry] = {}


def register_category(
    category_id: str,
    name: str,
    color: str,
    icon: str,
    app_id: str,
) -> None:
    """Register a category with metadata. Called during plugin registration."""
    # Allow later registrations to override (for "custom" category flexibility)
    CATEGORY_REGISTRY[category_id] = CategoryEntry(
        id=category_id,
        name=name,
        color=color,
        icon=icon,
        app_id=app_id,
    )


def list_categories() -> list[CategoryEntry]:
    """Return all registered categories as a list."""
    return list(CATEGORY_REGISTRY.values())


def get_category(category_id: str) -> CategoryEntry | None:
    """Get category metadata by id."""
    return CATEGORY_REGISTRY.get(category_id)


# ─── Plugin Registration ───────────────────────────────────────────────────────

def register_plugin(
    manifest: AppManifestSchema,
    agent: "BaseAppAgent",
    router: APIRouter,
    models: list[type] | None = None,
) -> None:
    """Register a plugin. Called by each app's __init__.py at import time."""
    if manifest.id in PLUGIN_REGISTRY:
        raise ValueError(f"Plugin already registered: {manifest.id}")

    models = models or []

    PLUGIN_REGISTRY[manifest.id] = PluginEntry(
        manifest=manifest,
        agent=agent,
        router=router,
        models=models,
    )
    _plugin_models.extend(models)

    # Auto-register category with metadata from manifest
    register_category(
        category_id=manifest.category,
        name=manifest.category.capitalize(),  # Default: capitalize category id
        color=manifest.color,
        icon=manifest.icon,
        app_id=manifest.id,
    )


def get_plugin_models() -> list[type]:
    """Return all Beanie document models registered by plugins."""
    return list(_plugin_models)


def get_plugin(app_id: str) -> PluginEntry | None:
    """Return a plugin entry by app_id, or None if not found."""
    return PLUGIN_REGISTRY.get(app_id)


def list_plugins() -> list[AppManifestSchema]:
    """Return all plugin manifests as a list."""
    return [entry["manifest"] for entry in PLUGIN_REGISTRY.values()]
