from __future__ import annotations

import asyncio

import pytest

from core.registry import get_task_finder


class _StubTodoAgent:
    def __init__(self, finder: object) -> None:
        self._finder = finder

    def get_task_finder(self) -> object:
        return self._finder


def test_get_task_finder_returns_none_when_todo_not_installed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    finder = object()

    async def _list_installed_app_ids(_user_id: str) -> list[str]:
        return []

    monkeypatch.setattr(
        "core.registry.PLUGIN_REGISTRY",
        {"todo": {"agent": _StubTodoAgent(finder)}},
    )
    monkeypatch.setattr(
        "core.workspace.service.list_installed_app_ids",
        _list_installed_app_ids,
    )

    result = asyncio.run(get_task_finder("user-1"))

    assert result is None


def test_get_task_finder_returns_finder_when_todo_installed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    finder = object()

    async def _list_installed_app_ids(_user_id: str) -> list[str]:
        return ["todo", "calendar"]

    monkeypatch.setattr(
        "core.registry.PLUGIN_REGISTRY",
        {"todo": {"agent": _StubTodoAgent(finder)}},
    )
    monkeypatch.setattr(
        "core.workspace.service.list_installed_app_ids",
        _list_installed_app_ids,
    )

    result = asyncio.run(get_task_finder("user-1"))

    assert result is finder
