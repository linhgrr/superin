"""Todo plugin Beanie document models."""

from datetime import datetime, time
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field


class Task(Document):
    """A single to-do item."""

    user_id: PydanticObjectId
    title: str
    description: str | None = None
    due_date: datetime | None = None
    due_time: time | None = None  # New: specific time for the task
    reminder_minutes: int | None = None  # New: remind X minutes before due
    priority: Literal["low", "medium", "high"] = "medium"
    status: Literal["pending", "completed"] = "pending"
    tags: list[str] = Field(default_factory=list)  # New: labels/tags
    is_archived: bool = False  # New: soft delete/archive
    parent_task_id: PydanticObjectId | None = None  # New: for subtasks
    recurring_rule_id: PydanticObjectId | None = None  # New: link to recurring rule
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None

    class Settings:
        name = "todo_tasks"
        indexes = [
            [("user_id", 1), ("status", 1)],
            [("user_id", 1), ("due_date", 1)],
            [("user_id", 1), ("priority", 1)],
            [("user_id", 1), ("tags", 1)],  # New: index for tag queries
            [("user_id", 1), ("is_archived", 1)],  # New: index for archive
            [("parent_task_id", 1)],  # New: index for subtasks
        ]


class SubTask(Document):
    """A subtask belonging to a parent task."""

    user_id: PydanticObjectId
    parent_task_id: PydanticObjectId  # Reference to parent Task
    title: str
    completed: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None

    class Settings:
        name = "todo_subtasks"
        indexes = [
            [("user_id", 1), ("parent_task_id", 1)],
            [("parent_task_id", 1), ("completed", 1)],
        ]


class RecurringRule(Document):
    """Defines how a task should recur."""

    user_id: PydanticObjectId
    task_template_id: PydanticObjectId  # Original task that defines the pattern
    frequency: Literal["daily", "weekly", "monthly", "yearly"]
    interval: int = 1  # Every N days/weeks/months
    days_of_week: list[int] | None = None  # For weekly: 0=Monday, 6=Sunday
    end_date: datetime | None = None  # When to stop recurring
    max_occurrences: int | None = None  # Max number of times to recur
    occurrence_count: int = 0  # How many times has occurred
    last_generated_date: datetime | None = None  # Last time a task was created
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "todo_recurring_rules"
        indexes = [
            [("user_id", 1), ("is_active", 1)],
            [("frequency", 1), ("last_generated_date", 1)],  # For background job
        ]
