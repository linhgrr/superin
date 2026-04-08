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


def _build_ask_tool(app_id: str, agent: BaseAppAgent, agent_description: str) -> BaseTool:
    """
    Wrap an installed app agent as a tool the root agent can call.

    The LLM only supplies the domain question; thread context is injected by
    the runtime so models never need to fabricate internal execution ids.
    """

    @tool(f"ask_{app_id}", description=agent_description)
    async def ask_app(question: str) -> dict[str, Any]:
        thread_id = get_thread_context()
        if not thread_id:
            raise RuntimeError(f"Missing thread context for ask_{app_id}")
        return await agent.delegate(question, thread_id)

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
        user_id = get_user_context()
        if not user_id:
            raise RuntimeError("Missing user context for install_app_for_user")

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
        user_id = get_user_context()
        if not user_id:
            raise RuntimeError("Missing user context for uninstall_app_for_user")

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

    return uninstall_app
