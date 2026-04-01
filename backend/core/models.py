"""Core platform Beanie document models.

These are always loaded regardless of which plugins are installed.
Plugin-specific models live in backend/apps/{app_id}/models.py.
"""

from datetime import UTC, datetime
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field


def utc_now() -> datetime:
    return datetime.now(UTC)


def get_user_local_time(user: "User") -> tuple[str, str]:
    """Get current date and time in user's timezone.

    Returns:
        tuple of (date_str, time_str) in user's local timezone.
        Defaults to UTC if user has no timezone set.
    """
    import pytz

    tz_name = user.settings.get("timezone", "UTC")
    try:
        tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        tz = pytz.UTC

    now = datetime.now(UTC).astimezone(tz)
    return now.strftime("%Y-%m-%d"), now.strftime("%H:%M")


class User(Document):
    """Platform user account."""

    email: str
    hashed_password: str
    name: str
    created_at: datetime = Field(default_factory=utc_now)
    settings: dict = {}

    class Settings:
        name = "users"
        indexes = [["email"]]



class UserAppInstallation(Document):
    """Tracks which apps a user has installed."""

    user_id: PydanticObjectId
    app_id: str
    status: Literal["active", "disabled"] = "active"
    installed_at: datetime = Field(default_factory=utc_now)

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
    # Custom dimensions - override manifest default
    size_w: int | None = None  # Grid width (2-12)
    size_h: int | None = None  # Grid height (1-6)

    class Settings:
        name = "widget_preferences"
        indexes = [
            [("user_id", 1), ("widget_id", 1)],  # unique
        ]


class TokenBlacklist(Document):
    """Revoked JWT tokens (for logout / token invalidation)."""

    jti: str  # JWT ID — unique per token
    revoked_at: datetime = Field(default_factory=utc_now)
    expires_at: datetime


class AppCategory(Document):
    """App store category used to group plugins in the catalog UI."""

    name: str
    icon: str = "Folder"
    color: str = "oklch(0.65 0.21 280)"
    order: int = 0

    class Settings:
        name = "app_categories"
        indexes = [[("name", 1)]]


class ConversationMessage(Document):
    """Persisted chat history for the root agent orchestrator."""

    user_id: PydanticObjectId
    thread_id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "conversation_messages"
        indexes = [
            [("user_id", 1), ("thread_id", 1), ("created_at", 1)],
            [("thread_id", 1), ("created_at", 1)],
        ]
