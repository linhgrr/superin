"""Todo plugin Pydantic request schemas."""

from __future__ import annotations

from datetime import datetime, time

from pydantic import BaseModel, Field

from apps.todo.enums import RecurrenceFrequency, TaskPriority, TaskStatus


class CreateTaskRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    due_date: datetime | None = None
    due_time: time | None = None
    priority: TaskPriority = "medium"
    tags: list[str] = Field(default_factory=list)
    reminder_minutes: int | None = Field(None, ge=0, le=10080)  # Max 1 week


class UpdateTaskRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    due_date: datetime | None = None
    due_time: time | None = None
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    tags: list[str] | None = None
    reminder_minutes: int | None = Field(None, ge=0, le=10080)


class CreateSubTaskRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class CreateRecurringRuleRequest(BaseModel):
    frequency: RecurrenceFrequency
    interval: int = Field(default=1, ge=1, le=52)
    days_of_week: list[int] | None = None  # 0=Monday, 6=Sunday
    end_date: datetime | None = None
    max_occurrences: int | None = Field(None, ge=1, le=1000)
