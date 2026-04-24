"""Root-level platform tools for app management and long-term memory."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain.tools import ToolRuntime
from langchain_core.tools import tool
from typing_extensions import TypedDict

from core.agents.runtime_context import AppAgentContext
from core.catalog.service import install_app_for_user, uninstall_app_for_user
from core.registry import list_plugins
from core.workspace.service import list_installed_app_ids

from .memory import fetch_memories, persist_memory, remove_memory, sanitize_memory_content

if TYPE_CHECKING:
    from langgraph.store.base import BaseStore


class InstalledAppsPayload(TypedDict):
    installed_app_ids: list[str]
    count: int


class AvailableAppPayload(TypedDict):
    app_id: str
    name: str
    description: str
    requires_tier: str


class AvailableAppsPayload(TypedDict):
    available_apps: list[AvailableAppPayload]
    count: int


class AppMutationPayload(TypedDict):
    status: str
    app_id: str


class MemorySavePayload(TypedDict):
    key: str
    category: str
    content: str
    source_thread_id: str | None


class MemoryRecallPayload(TypedDict):
    memories: list[dict[str, object]]
    count: int


class MemoryDeletePayload(TypedDict):
    deleted: bool
    key: str
    category: str


@tool("platform_list_installed_apps")
async def platform_list_installed_apps(
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> InstalledAppsPayload:
    """List the apps currently installed for the user."""
    return await _list_installed_apps(runtime.context.user_id)


async def _list_installed_apps(user_id: str) -> InstalledAppsPayload:
    installed_app_ids = await list_installed_app_ids(user_id)
    return {
        "installed_app_ids": installed_app_ids,
        "count": len(installed_app_ids),
    }


@tool("platform_list_available_apps")
async def platform_list_available_apps(
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> AvailableAppsPayload:
    """List all apps available in the system catalog."""
    return await _list_available_apps()


async def _list_available_apps() -> AvailableAppsPayload:
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


@tool("platform_install_app", extras={"is_mutating": True})
async def platform_install_app(
    app_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> AppMutationPayload:
    """Install an app for the current user by exact app_id."""
    result = await install_app_for_user(runtime.context.user_id, app_id)
    return {"status": result["status"], "app_id": result["app_id"]}


@tool("platform_uninstall_app", extras={"is_mutating": True})
async def platform_uninstall_app(
    app_id: str,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> AppMutationPayload:
    """Uninstall an app for the current user by exact app_id."""
    result = await uninstall_app_for_user(runtime.context.user_id, app_id)
    return {"status": result["status"], "app_id": result["app_id"]}


@tool("platform_save_memory", extras={"is_mutating": True})
async def platform_save_memory(
    content: str,
    category: str = "general",
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> MemorySavePayload:
    """Save a persistent user memory when the agent identifies durable user context."""
    return await save_memory_tool_impl(
        _require_store(runtime),
        runtime.context.user_id,
        content,
        category,
        runtime.context.thread_id,
    )


async def save_memory_tool_impl(
    store: BaseStore,
    user_id: str,
    content: str,
    category: str,
    source_thread_id: str | None,
) -> MemorySavePayload:
    sanitized_content = await sanitize_memory_content(content)
    key = await persist_memory(
        store,
        user_id,
        content,
        category=category,
        source_thread_id=source_thread_id,
        sanitized_content=sanitized_content,
    )
    return build_saved_memory_payload(key, category, sanitized_content, source_thread_id)


def build_saved_memory_payload(
    key: str,
    category: str,
    content: str,
    source_thread_id: str | None,
) -> MemorySavePayload:
    return {
        "key": key,
        "category": category,
        "content": content,
        "source_thread_id": source_thread_id,
    }


@tool("platform_recall_memories")
async def platform_recall_memories(
    query: str | None = None,
    category: str | None = None,
    limit: int = 5,
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> MemoryRecallPayload:
    """Recall long-term user memories, optionally filtered by query or category."""
    return await recall_memories_tool_impl(
        _require_store(runtime),
        runtime.context.user_id,
        query,
        category,
        limit,
    )


async def recall_memories_tool_impl(
    store: BaseStore,
    user_id: str,
    query: str | None,
    category: str | None,
    limit: int,
) -> MemoryRecallPayload:
    memories = await fetch_memories(
        store,
        user_id,
        category=category,
        query=query,
        limit=limit,
    )
    return {"memories": memories, "count": len(memories)}


@tool("platform_delete_memory", extras={"is_mutating": True})
async def platform_delete_memory(
    key: str,
    category: str = "general",
    *,
    runtime: ToolRuntime[AppAgentContext],
) -> MemoryDeletePayload:
    """Delete a stored user memory by key and category."""
    return await delete_memory_tool_impl(_require_store(runtime), runtime.context.user_id, key, category)


def _require_store(runtime: ToolRuntime[AppAgentContext]) -> BaseStore:
    store = runtime.store
    if store is None:
        raise RuntimeError("ToolRuntime.store is missing. Ensure the parent agent graph is compiled with a store.")
    return store


async def delete_memory_tool_impl(
    store: BaseStore,
    user_id: str,
    key: str,
    category: str,
) -> MemoryDeletePayload:
    await remove_memory(store, user_id, key, category=category)
    return {"deleted": True, "key": key, "category": category}
