"""Todo plugin Pydantic request/response schemas."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field

from apps.todo.enums import RecurrenceFrequency, TaskPriority, TaskStatus


class TodoCreateTaskRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    due_date: date | None = None
    due_time: time | None = None
    priority: TaskPriority = "medium"
    tags: list[str] = Field(default_factory=list)
    reminder_minutes: int | None = Field(None, ge=0, le=10080)  # Max 1 week


class TodoUpdateTaskRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    due_date: date | None = None
    due_time: time | None = None
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    tags: list[str] | None = None
    reminder_minutes: int | None = Field(None, ge=0, le=10080)


class TodoCreateSubTaskRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class TodoCreateRecurringRuleRequest(BaseModel):
    frequency: RecurrenceFrequency
    interval: int = Field(default=1, ge=1, le=52)
    days_of_week: list[int] | None = None  # 0=Monday, 6=Sunday
    end_date: date | None = None
    max_occurrences: int | None = Field(None, ge=1, le=1000)


class TodoTaskRead(BaseModel):
    id: str
    title: str
    description: str | None = None
    due_date: date | None = None
    due_time: time | None = None
    reminder_minutes: int | None = None
    priority: TaskPriority
    status: TaskStatus
    tags: list[str] = Field(default_factory=list)
    is_archived: bool = False
    parent_task_id: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class TodoSubTaskRead(BaseModel):
    id: str
    parent_task_id: str
    title: str
    completed: bool
    created_at: datetime
    completed_at: datetime | None = None


class TodoSubTaskProgress(BaseModel):
    total: int
    completed: int
    percentage: int


class TodoTaskDetailRead(TodoTaskRead):
    subtasks: list[TodoSubTaskRead] = Field(default_factory=list)
    subtask_progress: TodoSubTaskProgress


class TodoRecurringRuleRead(BaseModel):
    id: str
    task_template_id: str
    frequency: RecurrenceFrequency
    interval: int
    days_of_week: list[int] | None = None
    end_date: date | None = None
    max_occurrences: int | None = None
    occurrence_count: int
    is_active: bool
    last_generated_date: datetime | None = None
    created_at: datetime


class TodoSummaryResponse(BaseModel):
    total: int
    pending: int
    completed: int
    overdue: int
    due_today: int
    archived: int
    total_tags: int
    tag_list: list[str] = Field(default_factory=list)


class TodoActivitySummaryResponse(BaseModel):
    start_datetime: datetime
    end_datetime: datetime
    created_count: int
    completed_count: int
    created_tasks: list[TodoTaskRead] = Field(default_factory=list)
    completed_tasks: list[TodoTaskRead] = Field(default_factory=list)
    unsupported_activity: list[str] = Field(default_factory=list)


class TodoActionResponse(BaseModel):
    success: bool
    id: str
    message: str | None = None


class TaskListWidgetConfig(BaseModel):
    filter: Literal["all", "today", "high"] = "all"
    limit: int = Field(default=5, ge=1, le=20)


class TaskListWidgetData(BaseModel):
    filter: Literal["all", "today", "high"]
    items: list[TodoTaskRead] = Field(default_factory=list)
    total: int


class TodayWidgetConfig(BaseModel):
    include_overdue: bool = True


class TodayWidgetData(BaseModel):
    due_today: int
    overdue: int
    next_due_task: TodoTaskRead | None = None


TodoWidgetDataResponse = TaskListWidgetData | TodayWidgetData
