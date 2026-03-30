"""Plugin registry — singleton store for all registered app plugins.

Plugins call register_plugin() in their __init__.py.
The platform reads PLUGIN_REGISTRY at startup to mount routers, expose catalog, etc.
"""

from typing import TYPE_CHECKING, TypedDict

from fastapi import APIRouter

if TYPE_CHECKING:
    from langgraph.graph.state import CompiledStateGraph as CompiledGraph

from shared.schemas import AppManifestSchema


class PluginEntry(TypedDict):
    """The shape stored in PLUGIN_REGISTRY after register_plugin()."""

    manifest: AppManifestSchema
    agent: "AgentProtocol"  # type: ignore[name-defined]
    router: APIRouter
    models: list[type]


# ─── Registry ─────────────────────────────────────────────────────────────────

PLUGIN_REGISTRY: dict[str, PluginEntry] = {}

# Track Beanie document models from plugins so init_beanie() can load them
_plugin_models: list[type] = []


def register_plugin(
    manifest: AppManifestSchema,
    agent: "AgentProtocol",  # type: ignore[name-defined]
    router: APIRouter,
    models: list[type] = [],
) -> None:
    """Register a plugin. Called by each app's __init__.py at import time."""
    if manifest.id in PLUGIN_REGISTRY:
        raise ValueError(f"Plugin already registered: {manifest.id}")

    PLUGIN_REGISTRY[manifest.id] = PluginEntry(
        manifest=manifest,
        agent=agent,
        router=router,
        models=models,
    )
    _plugin_models.extend(models)


def get_plugin_models() -> list[type]:
    """Return all Beanie document models registered by plugins."""
    return list(_plugin_models)


def get_plugin(app_id: str) -> PluginEntry | None:
    """Return a plugin entry by app_id, or None if not found."""
    return PLUGIN_REGISTRY.get(app_id)


def list_plugins() -> list[AppManifestSchema]:
    """Return all plugin manifests as a list."""
    return [entry["manifest"] for entry in PLUGIN_REGISTRY.values()]