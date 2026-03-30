"""Core platform Beanie document models.

These are always loaded regardless of which plugins are installed.
Plugin-specific models live in backend/apps/{app_id}/models.py.
"""

from datetime import datetime
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field


class User(Document):
    """Platform user account."""

    email: str
    hashed_password: str
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    settings: dict = {}

    class Settings:
        name = "users"
        indexes = [["email"]]


class UserAppInstallation(Document):
    """Tracks which apps a user has installed."""

    user_id: PydanticObjectId
    app_id: str
    status: Literal["active", "disabled"] = "active"
    installed_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "user_app_installations"
        indexes = [
            [("user_id", 1), ("app_id", 1)],  # unique
        ]


class WidgetPreference(Document):
    """User-specific widget configuration and position on dashboard."""

    user_id: PydanticObjectId
    widget_id: str  # e.g. "finance.total-balance"
    app_id: str
    enabled: bool = False
    position: int = 0
    config: dict = {}

    class Settings:
        name = "widget_preferences"
        indexes = [
            [("user_id", 1), ("widget_id", 1)],  # unique
        ]


class TokenBlacklist(Document):
    """Revoked JWT tokens (for logout / token invalidation)."""

    jti: str  # JWT ID — unique per token
    revoked_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
