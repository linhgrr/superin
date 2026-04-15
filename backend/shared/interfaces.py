"""Shared Python interface definitions."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from shared.schemas import SelectOption

if TYPE_CHECKING:
    from apps.todo.models import Task  # noqa: F401 — used only in protocol type hints


class WidgetResolverProtocol(Protocol):
    """
    Plugins register resolvers to provide dynamic options for widget config fields.
    e.g. 'finance.wallets' → returns list of user's wallets as SelectOption[]
    """

    async def resolve(self, user_id: str, field_name: str) -> list[SelectOption]:
        """Return options for the given field, filtered by user context."""
        ...


class TaskFinder(Protocol):
    """Interface for looking up tasks by ID — used by calendar to schedule task events."""

    async def find_by_id(self, task_id: str, user_id: str) -> Task | None:
        """Find a task by ID for a given user, or None if not found."""
        ...
