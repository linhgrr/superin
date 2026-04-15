"""Tool scoping — resolves which tools are available for a given user."""

from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool

    from .root_agent import RootAgent


class ToolScoper:
    """
    Resolves the tool set available to a user based on their installed apps.

    Fail-closed: if installed-app scoping cannot be resolved (DB/network error),
    only platform-safe base tools are exposed. App-delegation tools are withheld
    until scoping is confirmed.
    """

    def __init__(self, root_agent: RootAgent) -> None:
        self._root = root_agent

    async def get_user_tools(self, user_id: str) -> list[BaseTool]:
        """
        Return tools scoped to the user's installed apps plus platform base tools.

        Fail-closed on any error: unknown installation state → base tools only.
        """
        try:
            from . import agent as root_agent_module

            installed_app_ids = set(await root_agent_module.list_installed_app_ids(user_id))
        except (ConnectionError, TimeoutError):
            # Database or network unavailable — degrade gracefully, fail closed.
            logger.warning(
                "ToolScoper: DB unavailable, falling back to platform base tools only "
                "(app-delegation tools withheld for user_id=%s)",
                user_id,
                exc_info=True,
            )
            return self._root._base_tools
        except Exception:
            # Programming error (schema drift, invalid data) — also fail closed.
            logger.error(
                "ToolScoper: unexpected error loading installed apps, "
                "falling back to platform base tools only for user_id=%s",
                user_id,
                exc_info=True,
            )
            return self._root._base_tools

        tools = [
            t
            for app_id, t in self._root._all_ask_tools.items()
            if app_id in installed_app_ids
        ]
        tools.extend(self._root._base_tools)

        logger.debug(
            "ToolScoper.get_user_tools  user_id=%s  installed=%s  total_tools=%d",
            user_id,
            sorted(installed_app_ids),
            len(tools),
        )
        return tools
