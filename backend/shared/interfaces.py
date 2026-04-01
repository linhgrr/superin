"""Shared Python interface definitions."""

from __future__ import annotations

from typing import Protocol

from shared.schemas import SelectOption


class WidgetResolverProtocol(Protocol):
    """
    Plugins register resolvers to provide dynamic options for widget config fields.
    e.g. 'finance.wallets' → returns list of user's wallets as SelectOption[]
    """

    async def resolve(self, user_id: str, field_name: str) -> list[SelectOption]:  # type: ignore[name-defined]
        """Return options for the given field, filtered by user context."""
        ...
