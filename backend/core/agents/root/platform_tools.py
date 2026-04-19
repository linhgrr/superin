"""Root-level platform tools for app management and long-term memory."""

from __future__ import annotations

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from core.catalog.service import install_app_for_user, uninstall_app_for_user
from core.db import get_store
from core.registry import list_plugins
from core.workspace.service import list_installed_app_ids
from shared.agent_config import require_user_id
from shared.tool_results import safe_tool_call

from .memory import delete_memory, recall_memories, save_memory


@tool("platform_list_installed_apps")
async def platform_list_installed_apps(config: RunnableConfig) -> dict:
    """List the apps currently installed for the user."""
    user_id = require_user_id(config)
    return await safe_tool_call(
        lambda: _list_installed_apps(user_id),
        action="listing installed apps",
        localize=False,
        user_id=user_id,
    )


async def _list_installed_apps(user_id: str) -> dict:
    installed_app_ids = await list_installed_app_ids(user_id)
    return {
        "installed_app_ids": installed_app_ids,
        "count": len(installed_app_ids),
    }


@tool("platform_list_available_apps")
async def platform_list_available_apps(config: RunnableConfig) -> dict:
    """List all apps available in the system catalog."""
    user_id = require_user_id(config)
    return await safe_tool_call(
        _list_available_apps,
        action="listing available apps",
        localize=False,
        user_id=user_id,
    )


async def _list_available_apps() -> dict:
    manifests = list_plugins()
    return {
        "available_apps": [
            {
                "app_id": manifest.id,
                "name": manifest.name,
                "description": manifest.description,
                "requires_tier": manifest.requires_tier,
            }
            for manifest in manifests
        ],
        "count": len(manifests),
    }


@tool("platform_install_app")
async def platform_install_app(app_id: str, config: RunnableConfig) -> dict:
    """Install an app for the current user by exact app_id."""
    user_id = require_user_id(config)
    return await safe_tool_call(
        lambda: install_app_for_user(user_id, app_id),
        action=f"installing app {app_id}",
        localize=False,
        user_id=user_id,
    )


@tool("platform_uninstall_app")
async def platform_uninstall_app(app_id: str, config: RunnableConfig) -> dict:
    """Uninstall an app for the current user by exact app_id."""
    user_id = require_user_id(config)
    return await safe_tool_call(
        lambda: uninstall_app_for_user(user_id, app_id),
        action=f"uninstalling app {app_id}",
        localize=False,
        user_id=user_id,
    )


@tool("platform_save_memory")
async def platform_save_memory(
    content: str,
    category: str = "general",
    config: RunnableConfig | None = None,
) -> dict:
    """Save a persistent user memory when the user explicitly asks to remember something."""
    user_id = require_user_id(config)
    store = get_store()
    return await safe_tool_call(
        lambda: _save_memory(store, user_id, content, category),
        action="saving memory",
        localize=False,
        user_id=user_id,
    )


async def _save_memory(store, user_id: str, content: str, category: str) -> dict:
    key = await save_memory(store, user_id, content, category=category)
    return {"key": key, "category": category, "content": content}


@tool("platform_recall_memories")
async def platform_recall_memories(
    query: str | None = None,
    category: str | None = None,
    limit: int = 5,
    config: RunnableConfig | None = None,
) -> dict:
    """Recall long-term user memories, optionally filtered by query or category."""
    user_id = require_user_id(config)
    store = get_store()
    return await safe_tool_call(
        lambda: _recall_memories(store, user_id, query, category, limit),
        action="recalling memories",
        localize=False,
        user_id=user_id,
    )


async def _recall_memories(store, user_id: str, query: str | None, category: str | None, limit: int) -> dict:
    memories = await recall_memories(
        store,
        user_id,
        category=category,
        query=query,
        limit=limit,
    )
    return {"memories": memories, "count": len(memories)}


@tool("platform_delete_memory")
async def platform_delete_memory(
    key: str,
    category: str = "general",
    config: RunnableConfig | None = None,
) -> dict:
    """Delete a stored user memory by key and category."""
    user_id = require_user_id(config)
    store = get_store()
    return await safe_tool_call(
        lambda: _delete_memory(store, user_id, key, category),
        action="deleting memory",
        localize=False,
        user_id=user_id,
    )


async def _delete_memory(store, user_id: str, key: str, category: str) -> dict:
    await delete_memory(store, user_id, key, category=category)
    return {"deleted": True, "key": key, "category": category}
