"""Todo plugin Pydantic request schemas."""

from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, Field


class CreateTaskRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    due_date: datetime | None = None
    due_time: time | None = None
    priority: Literal["low", "medium", "high"] = "medium"
    tags: list[str] = Field(default_factory=list)
    reminder_minutes: int | None = Field(None, ge=0, le=10080)  # Max 1 week


class UpdateTaskRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    due_date: datetime | None = None
    due_time: time | None = None
    priority: Literal["low", "medium", "high"] | None = None
    status: Literal["pending", "completed"] | None = None
    tags: list[str] | None = None
    reminder_minutes: int | None = Field(None, ge=0, le=10080)


class CreateSubTaskRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class CreateRecurringRuleRequest(BaseModel):
    frequency: Literal["daily", "weekly", "monthly", "yearly"]
    interval: int = Field(default=1, ge=1, le=52)
    days_of_week: list[int] | None = None  # 0=Monday, 6=Sunday
    end_date: datetime | None = None
    max_occurrences: int | None = Field(None, ge=1, le=1000)
