"""Core platform Beanie document models.

These are always loaded regardless of which plugins are installed.
Plugin-specific models live in backend/apps/{app_id}/models.py.
"""

from datetime import UTC, datetime

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

from shared.enums import InstallationStatus, UserRole


def utc_now() -> datetime:
    return datetime.now(UTC)


class User(Document):
    """Platform user account."""

    email: str
    hashed_password: str
    name: str
    avatar_url: str | None = None
    role: UserRole = UserRole.USER
    created_at: datetime = Field(default_factory=utc_now)
    settings: dict = Field(default_factory=dict)

    class Settings:
        name = "users"
        indexes = [
            IndexModel([("email", 1)], name="users_email_unique", unique=True),
            IndexModel([("role", 1)], name="users_role_index"),
        ]


class UserAppInstallation(Document):
    """Tracks which apps a user has installed."""

    user_id: PydanticObjectId
    app_id: str
    status: InstallationStatus = InstallationStatus.ACTIVE
    installed_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "user_app_installations"
        indexes = [
            IndexModel(
                [("user_id", 1), ("app_id", 1)],
                name="user_app_installations_user_id_app_id_unique",
                unique=True,
            ),
        ]


class WidgetPreference(Document):
    """User-specific widget layout state on dashboard."""

    user_id: PydanticObjectId
    widget_id: str  # e.g. "finance.total-balance"
    app_id: str
    enabled: bool = False
    sort_order: int = 0  # Sequential ordering for widget list (not grid position)
    grid_x: int = Field(default=0, ge=0)
    grid_y: int = Field(default=0, ge=0)
    size_w: int | None = Field(default=None, ge=2, le=12)
    size_h: int | None = Field(default=None, ge=1, le=6)

    class Settings:
        name = "widget_preferences"
        indexes = [
            IndexModel(
                [("user_id", 1), ("widget_id", 1)],
                name="widget_preferences_user_id_widget_id_unique",
                unique=True,
            ),
        ]


class WidgetDataConfig(Document):
    """Per-widget data configuration validated against registered widget schemas."""

    user_id: PydanticObjectId
    widget_id: str
    config: dict = Field(default_factory=dict)

    class Settings:
        name = "widget_data_configs"
        indexes = [
            IndexModel(
                [("user_id", 1), ("widget_id", 1)],
                name="widget_data_configs_user_widget_unique",
                unique=True,
            ),
        ]


class TokenBlacklist(Document):
    """Revoked JWT tokens (for logout / token invalidation)."""

    jti: str  # JWT ID — unique per token
    revoked_at: datetime = Field(default_factory=utc_now)
    expires_at: datetime

    class Settings:
        name = "token_blacklist"
        indexes = [
            IndexModel([("jti", 1)], name="token_blacklist_jti_unique", unique=True),
            IndexModel([("expires_at", 1)], name="token_blacklist_expires_at"),
        ]


class AppCategory(Document):
    """App store category used to group plugins in the catalog UI."""

    name: str
    icon: str = "Folder"
    color: str = "oklch(0.65 0.21 280)"
    order: int = 0

    class Settings:
        name = "app_categories"
        indexes = [
            IndexModel([("name", 1)], name="app_categories_name_unique", unique=True),
        ]

