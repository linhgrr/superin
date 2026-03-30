"""Todo plugin Beanie document models."""

from datetime import datetime
from typing import Literal, Optional

from beanie import Document, PydanticObjectId
from pydantic import Field


class Task(Document):
    """A single to-do item."""

    user_id: PydanticObjectId
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Literal["low", "medium", "high"] = "medium"
    status: Literal["pending", "completed"] = "pending"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

    class Settings:
        name = "todo_tasks"
        indexes = [
            [("user_id", 1), ("status", 1)],
            [("user_id", 1), ("due_date", 1)],
            [("user_id", 1), ("priority", 1)],
        ]
