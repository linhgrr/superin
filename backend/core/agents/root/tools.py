"""
Tools used by the orchestrator agent.
"""

from typing import Any

from langchain_core.tools import BaseTool, tool

from core.agents.base_app import BaseAppAgent
from core.catalog.service import (
    UnknownAppError,
    install_app_for_user,
    uninstall_app_for_user,
)
from shared.agent_context import get_thread_context, get_user_context
from shared.enums import INSTALL_STATUS_ALREADY_INSTALLED
from shared.tool_results import safe_tool_call


def _unwrap_safe_tool_result(result: dict[str, Any]) -> dict[str, Any]:
    """Preserve existing tool response shapes while still using safe_tool_call."""
    if not result.get("ok"):
        return result

    data = result.get("data")
    if isinstance(data, dict):
        return data
    return {"ok": True, "data": data}


def _build_ask_tool(app_id: str, agent: BaseAppAgent, agent_description: str) -> BaseTool:
    """
    Wrap an installed app agent as a tool the root agent can call.

    The LLM only supplies the domain question; thread context is injected by
    the runtime so models never need to fabricate internal execution ids.
    """

    @tool(f"ask_{app_id}", description=agent_description)
    async def ask_app(question: str) -> dict[str, Any]:
        async def operation() -> dict[str, Any]:
            thread_id = get_thread_context()
            if not thread_id:
                raise ValueError(f"Missing thread context for ask_{app_id}")
            return await agent.delegate(question, thread_id)

        result = await safe_tool_call(operation, action=f"delegating to {app_id}")
        return _unwrap_safe_tool_result(result)

    return ask_app


def _build_install_app_tool() -> BaseTool:
    """Build a root-level tool that installs an app for the current user."""

    @tool(
        "install_app_for_user",
        description=(
            "Install an app from the Superin app catalog into the current user's workspace. "
            "Use only when the user explicitly asks to install an app or confirms your recommendation. "
            "Input must be the exact app_id from the system catalog. "
            "New ask_* tools for the installed app become available on the next user message."
        ),
    )
    async def install_app(app_id: str) -> dict[str, Any]:
        async def operation() -> dict[str, Any]:
            user_id = get_user_context()
            if not user_id:
                raise ValueError("Missing user context for install_app_for_user")

            try:
                result = await install_app_for_user(user_id, app_id)
            except UnknownAppError as exc:
                return {
                    "ok": False,
                    "status": "not_found",
                    "app_id": exc.app_id,
                    "message": (
                        f"App '{exc.app_id}' does not exist in the current catalog. "
                        "Use one of the app_ids listed in the system catalog."
                    ),
                }

            status = result["status"]
            app_name = result["app_name"]
            message = (
                f"Installed {app_name}. Its app-specific tools will be available starting from the next user message."
                if status != INSTALL_STATUS_ALREADY_INSTALLED
                else f"{app_name} is already installed."
            )
            return {
                "ok": True,
                "status": status,
                "app_id": result["app_id"],
                "app_name": app_name,
                "message": message,
            }

        result = await safe_tool_call(operation, action="installing an app")
        return _unwrap_safe_tool_result(result)

    return install_app


def _build_uninstall_app_tool() -> BaseTool:
    """Build a root-level tool that uninstalls an app for the current user."""

    @tool(
        "uninstall_app_for_user",
        description=(
            "Uninstall an app from the current user's workspace. "
            "Use only when the user explicitly asks to remove an app or confirms removal. "
            "Input must be the exact app_id from the system catalog. "
            "Removed ask_* tools disappear starting from the next user message."
        ),
    )
    async def uninstall_app(app_id: str) -> dict[str, Any]:
        async def operation() -> dict[str, Any]:
            user_id = get_user_context()
            if not user_id:
                raise ValueError("Missing user context for uninstall_app_for_user")

            try:
                result = await uninstall_app_for_user(user_id, app_id)
            except UnknownAppError as exc:
                return {
                    "ok": False,
                    "status": "not_found",
                    "app_id": exc.app_id,
                    "message": (
                        f"App '{exc.app_id}' does not exist in the current catalog. "
                        "Use one of the app_ids listed in the system catalog."
                    ),
                }

            status = result["status"]
            app_name = result["app_name"]
            message = (
                f"Uninstalled {app_name}. Its app-specific tools will disappear starting from the next user message."
                if status == "uninstalled"
                else f"{app_name} is already not installed."
            )
            return {
                "ok": True,
                "status": status,
                "app_id": result["app_id"],
                "app_name": app_name,
                "message": message,
            }

        result = await safe_tool_call(operation, action="uninstalling an app")
        return _unwrap_safe_tool_result(result)

    return uninstall_app


def _build_platform_info_tool() -> BaseTool:
    @tool("get_platform_info", description="Get basic information about the Superin platform")
    async def get_platform_info() -> str:
        async def operation() -> str:
            return "Superin is an AI platform with an app store. Users can install apps to add capabilities."

        result = await safe_tool_call(operation, action="getting platform info")
        if result.get("ok"):
            return str(result.get("data", ""))

        error = result.get("error", {})
        message = (
            error.get("message") if isinstance(error, dict) else "Unexpected platform info error."
        )
        return str(message)

    return get_platform_info


def _build_memory_tools() -> list[BaseTool]:
    """Build tools for long-term user memory backed by MongoDBStore.

    The store uses namespaces (user_id, "memories", category) to organize
    facts per user.  Content is sanitized before storage (ASI06 defense).
    """

    @tool(
        "save_memory",
        description=(
            "Save an important fact or preference about the user for future conversations. "
            "Use this proactively when the user shares personal preferences, important dates, "
            "habits, goals, or any information worth remembering long-term. "
            "Provide a clear, concise content string and a category to organize it "
            "(e.g. 'preferences', 'personal', 'work', 'goals')."
        ),
    )
    async def save_memory(content: str, category: str = "general") -> dict[str, Any]:
        from datetime import UTC, datetime
        from uuid import uuid4

        from core.db import get_store
        from core.utils.sanitizer import sanitize_for_memory

        async def operation() -> dict[str, Any]:
            user_id = get_user_context()
            if not user_id:
                raise ValueError("Missing user context for save_memory")

            store = get_store()
            namespace = (user_id, "memories", category)
            key = f"mem_{uuid4().hex[:8]}"
            sanitized = sanitize_for_memory(content)
            await store.aput(
                namespace,
                key,
                {
                    "content": sanitized,
                    "category": category,
                    "saved_at": datetime.now(UTC).isoformat(),
                },
            )
            return {
                "ok": True,
                "message": f"Memory saved in category '{category}'.",
                "key": key,
            }

        result = await safe_tool_call(operation, action="saving a memory")
        return _unwrap_safe_tool_result(result)

    @tool(
        "recall_memories",
        description=(
            "Recall previously saved information about the user. "
            "Use this to check for relevant context before answering questions "
            "about user preferences, history, or previously discussed topics. "
            "Optionally filter by category (e.g. 'preferences', 'personal', 'work'). "
            "Omit category to recall all saved memories. "
            "Use the offset parameter to paginate through results if count reaches 20."
        ),
    )
    async def recall_memories(category: str | None = None, offset: int = 0) -> dict[str, Any]:
        from core.db import get_store

        async def operation() -> dict[str, Any]:
            user_id = get_user_context()
            if not user_id:
                raise ValueError("Missing user context for recall_memories")

            store = get_store()
            if category:
                namespace: tuple[str, ...] = (user_id, "memories", category)
            else:
                namespace = (user_id, "memories")
            items = await store.asearch(namespace, limit=20, offset=offset)
            memories = [{"key": item.key, **(item.value if isinstance(item.value, dict) else {"content": item.value})} for item in items]
            return {
                "ok": True,
                "memories": memories,
                "count": len(memories),
            }

        result = await safe_tool_call(operation, action="recalling memories")
        return _unwrap_safe_tool_result(result)

    @tool(
        "delete_memory",
        description=(
            "Delete a specific saved memory by its key and category. "
            "Use when the user asks to forget something or correct previously saved information."
        ),
    )
    async def delete_memory(key: str, category: str = "general") -> dict[str, Any]:
        from core.db import get_store

        async def operation() -> dict[str, Any]:
            user_id = get_user_context()
            if not user_id:
                raise ValueError("Missing user context for delete_memory")

            store = get_store()
            namespace = (user_id, "memories", category)
            await store.adelete(namespace, key)
            return {
                "ok": True,
                "message": f"Memory '{key}' deleted from category '{category}'.",
            }

        result = await safe_tool_call(operation, action="deleting a memory")
        return _unwrap_safe_tool_result(result)

    return [save_memory, recall_memories, delete_memory]
