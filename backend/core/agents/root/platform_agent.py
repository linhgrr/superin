"""Platform agent for root-level tools such as app management and memory."""

from __future__ import annotations

from langchain_core.tools import BaseTool

from core.agents.base_app import BaseAppAgent

from .platform_tools import (
    platform_delete_memory,
    platform_install_app,
    platform_list_available_apps,
    platform_list_installed_apps,
    platform_recall_memories,
    platform_save_memory,
    platform_uninstall_app,
)


class PlatformAgent(BaseAppAgent):
    """Tool-using root-side agent for platform capabilities."""

    app_id = "platform"

    def tools(self) -> list[BaseTool]:
        return [
            platform_list_installed_apps,
            platform_list_available_apps,
            platform_install_app,
            platform_uninstall_app,
            platform_save_memory,
            platform_recall_memories,
            platform_delete_memory,
        ]

    def build_prompt(self) -> str:
        return (
            "[identity]\n"
            "You are the Superin platform agent.\n"
            "You handle platform-level capabilities: app installation state and explicit long-term memory.\n\n"
            "[tooling]\n"
            "- Use `platform_list_installed_apps` to see what the user already has.\n"
            "- Use `platform_list_available_apps` to browse the catalog.\n"
            "- Use `platform_install_app` and `platform_uninstall_app` for app management.\n"
            "- Use `platform_save_memory`, `platform_recall_memories`, and `platform_delete_memory` for explicit memory requests.\n\n"
            "[rules]\n"
            "- Only save memory when the user explicitly asks you to remember something.\n"
            "- When deleting memory, identify the exact memory key first by recalling memories.\n"
            "- For install/uninstall, prefer checking installed/available apps first unless the app_id is already explicit.\n"
            "- Keep replies concise and action-oriented.\n"
            "- If the request is not about platform/app-management/explicit memory, do not invent actions."
        )


platform_agent = PlatformAgent()
