"""Shared Python Protocol definitions — runtime contracts between platform and plugins."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, Any, TypedDict

from fastapi import APIRouter
from langchain_core.tools import BaseTool

if TYPE_CHECKING:
    from langgraph.graph.state import CompiledStateGraph as CompiledGraph


class AgentProtocol(Protocol):
    """
    Every app agent MUST implement this protocol.

    The RootAgent reads PLUGIN_REGISTRY to find the right agent
    for each user message, then calls agent.astream() with the
    user's messages and context.
    """

    @property
    def graph(self) -> CompiledGraph | None:
        """The compiled LangGraph state graph. May be None for simple agents."""
        ...

    def tools(self) -> list[BaseTool]:
        """Domain-specific tools this agent exposes."""
        ...

    async def on_install(self, user_id: str) -> None:
        """
        Called when a user installs this app.
        Use to seed default data (wallets, categories, etc.)
        """
        ...

    async def on_uninstall(self, user_id: str) -> None:
        """
        Called when a user uninstalls this app.
        Use to clean up user-specific data.
        """
        ...


class AppPlugin(TypedDict):
    """The shape stored in PLUGIN_REGISTRY after register_plugin()."""

    manifest: "AppManifestSchema"  # type: ignore[name-defined]
    agent: AgentProtocol
    router: APIRouter
    models: list[type[Any]]


class WidgetResolverProtocol(Protocol):
    """
    Plugins register resolvers to provide dynamic options for widget config fields.
    e.g. 'finance.wallets' → returns list of user's wallets as SelectOption[]
    """

    async def resolve(self, user_id: str, field_name: str) -> list["SelectOption"]:  # type: ignore[name-defined]
        """Return options for the given field, filtered by user context."""
        ...
