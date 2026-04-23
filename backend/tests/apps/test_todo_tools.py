from datetime import date, time
from types import SimpleNamespace
from typing import Any, cast

import pytest

from apps.todo import tools as todo_tools
from apps.todo.agent import TodoAgent
from core.models import User
from tests.tool_runtime import build_app_tool_runtime


@pytest.mark.asyncio
async def test_todo_add_task_uses_user_timezone_for_due_date_and_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"})

    async def fake_get(_user_id: str) -> User:
        return cast(User, user)

    observed: dict[str, Any] = {}

    async def fake_create_task(
        user_id: str,
        title: str,
        description: str | None,
        due_date: date | None,
        due_time: time | None,
        priority: str,
        tags: list[str] | None,
        reminder_minutes: int | None,
    ) -> dict[str, str | None]:
        observed["user_id"] = user_id
        observed["title"] = title
        observed["due_date"] = due_date
        observed["due_time"] = due_time
        return {
            "id": "task-1",
            "title": title,
            "due_date": due_date.isoformat() if due_date else None,
            "due_time": due_time.isoformat() if due_time else None,
        }

    monkeypatch.setattr(User, "get", fake_get)
    monkeypatch.setattr(todo_tools.task_service, "create_task", fake_create_task)

    result = await todo_tools.todo_add_task.ainvoke(
        {
            "title": "Call mom",
            "due_date": "2026-04-20",
            "due_time": "15:30",
            "runtime": build_app_tool_runtime("507f1f77bcf86cd799439011"),
        },
    )

    assert result["id"] == "task-1"
    assert observed["user_id"] == "507f1f77bcf86cd799439011"
    assert observed["due_date"] == date(2026, 4, 20)
    assert observed["due_time"] == time(15, 30)


@pytest.mark.asyncio
async def test_todo_update_task_uses_local_date_semantics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"})

    async def fake_get(_user_id: str) -> User:
        return cast(User, user)

    observed: dict[str, Any] = {}

    async def fake_update_task(*args: object) -> dict[str, object]:
        observed["args"] = args
        return {"id": "task-1", "updated": True}

    monkeypatch.setattr(User, "get", fake_get)
    monkeypatch.setattr(todo_tools.task_service, "update_task", fake_update_task)

    result = await todo_tools.todo_update_task.ainvoke(
        {
            "task_id": "task-1",
            "due_date": "2026-04-21",
            "due_time": "08:00",
            "runtime": build_app_tool_runtime("507f1f77bcf86cd799439011"),
        },
    )

    assert result == {"id": "task-1", "updated": True}
    assert observed["args"][2] is None
    assert observed["args"][3] is None
    assert observed["args"][4] == date(2026, 4, 21)
    assert observed["args"][5] == time(8, 0)


@pytest.mark.asyncio
async def test_todo_create_recurring_task_uses_local_date_semantics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(settings={"timezone": "Asia/Ho_Chi_Minh"})

    async def fake_get(_user_id: str) -> User:
        return cast(User, user)

    observed: dict[str, Any] = {}

    async def fake_create_recurring_rule(
        user_id: str,
        task_template_id: str,
        frequency: str,
        interval: int,
        days_of_week: list[int] | None,
        end_date: date | None,
        max_occurrences: int | None,
    ) -> dict[str, str]:
        observed["end_date"] = end_date
        return {"id": "rule-1"}

    monkeypatch.setattr(User, "get", fake_get)
    monkeypatch.setattr(todo_tools.task_service, "create_recurring_rule", fake_create_recurring_rule)

    result = await todo_tools.todo_create_recurring_task.ainvoke(
        {
            "task_template_id": "task-1",
            "frequency": "weekly",
            "end_date": "2026-04-30",
            "runtime": build_app_tool_runtime("507f1f77bcf86cd799439011"),
        },
    )

    assert result == {"id": "rule-1"}
    assert observed["end_date"] == date(2026, 4, 30)


def test_todo_agent_does_not_expose_toggle_task_to_llm() -> None:
    tool_names = {tool.name for tool in TodoAgent().tools()}
    assert "todo_toggle_task" not in tool_names
