"""Calendar plugin Beanie document models."""

from datetime import datetime
from typing import Optional, Literal

from beanie import Document, PydanticObjectId
from pydantic import Field


class Calendar(Document):
    """TODO: document this model."""

    user_id: PydanticObjectId
    # ── fields ──────────────────────────────────────────────────────────────
    # TODO: add your fields here, e.g.:
    # title: str
    # description: Optional[str] = None
    # ─────────────
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "calendar_calendars"
        indexes = [
            [("user_id", 1)],
            # TODO: add additional indexes, e.g.:
            # [("user_id", 1), ("status", 1)],
        ]
