"""Platform-wide constants and enums.

Only contains values that are structural (defined by the platform, not user data).
Values that need CRUD (app categories, etc.) belong in a Beanie Document model.

**Rule:** Every platform-wide Literal type, status value, and string constant
lives here — NOT in route/service files or app modules.
Plugin-specific types (TaskStatus, EventType, etc.) belong in the plugin's own module.

Usage:
    from shared.enums import (
        WidgetSize, ConfigFieldType, InstallationStatus,
        INSTALL_STATUS_ALREADY_INSTALLED, ChatEventType,
    )
"""

from __future__ import annotations

from enum import StrEnum

# ─── Widget ────────────────────────────────────────────────────────────────────

class WidgetSize(StrEnum):
    """Valid widget sizes for WidgetManifestSchema.size."""

    COMPACT = "compact"
    STANDARD = "standard"
    WIDE = "wide"
    TALL = "tall"
    FULL = "full"

WIDGET_SIZES: dict[WidgetSize, dict[str, int | str]] = {
    WidgetSize.COMPACT: {"width": 4, "height": "120px"},
    WidgetSize.STANDARD: {"width": 6, "height": "200px"},
    WidgetSize.WIDE: {"width": 8, "height": "200px"},
    WidgetSize.TALL: {"width": 6, "height": "300px"},
    WidgetSize.FULL: {"width": 12, "height": "auto"},
}
"""Platform widget size presets shared across validation and docs."""

VALID_WIDGET_SIZES: frozenset[str] = frozenset(size.value for size in WIDGET_SIZES)
"""Set of valid widget sizes. Used for validation."""


# ─── Config Field ───────────────────────────────────────────────────────────────

class ConfigFieldType(StrEnum):
    """Valid types for ConfigFieldSchema.type."""

    TEXT = "text"
    NUMBER = "number"
    SELECT = "select"
    MULTI_SELECT = "multi-select"
    DATE = "date"
    BOOLEAN = "boolean"


# ─── Installation ───────────────────────────────────────────────────────────────

class InstallationStatus(StrEnum):
    """Valid values for UserAppInstallation.status."""

    ACTIVE = "active"
    DISABLED = "disabled"

INSTALLATION_STATUSES: frozenset[str] = frozenset(status.value for status in InstallationStatus)

# ─── Installation (API response) ────────────────────────────────────────────────
# Distinct from InstallationStatus (DB model values above).
# Frontend/caller depends on these string values — must live here, not in routes.

INSTALL_STATUS_ALREADY_INSTALLED = "already_installed"
INSTALL_STATUS_NEW = "new"
INSTALL_STATUS_REACTIVATED = "reactivated"


# ─── Chat ──────────────────────────────────────────────────────────────────────

class ChatEventType(StrEnum):
    """Valid values for ChatStream event types."""

    TOKEN = "token"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    DONE = "done"
    ERROR = "error"


# ─── User Role ───────────────────────────────────────────────────────────────

class UserRole(StrEnum):
    """Valid values for User.role."""

    ADMIN = "admin"
    USER = "user"

USER_ROLES: frozenset[str] = frozenset(role.value for role in UserRole)


# ─── Permission Key ───────────────────────────────────────────────────────────

class PermissionKey(StrEnum):
    """Platform permission keys used by backend and frontend."""

    CHAT_AI_UNLIMITED = "chat_ai_unlimited"
    ADMIN_USERS_VIEW = "admin_users_view"
    ADMIN_SUBSCRIPTIONS_VIEW = "admin_subscriptions_view"
    ADMIN_APPS_MANAGE = "admin_apps_manage"


PERMISSION_KEYS: frozenset[str] = frozenset(permission.value for permission in PermissionKey)


# ─── Subscription ───────────────────────────────────────────────────────────

class SubscriptionTier(StrEnum):
    """Subscription tier — determines which features are accessible."""

    FREE = "free"
    PAID = "paid"

SUBSCRIPTION_TIERS: frozenset[str] = frozenset(tier.value for tier in SubscriptionTier)

class SubscriptionStatus(StrEnum):
    """Payment lifecycle status for a subscription."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    CANCELLED = "cancelled"
    PAST_DUE = "past_due"

SUBSCRIPTION_STATUSES: frozenset[str] = frozenset(
    status.value for status in SubscriptionStatus
)


# ─── Payment Provider ───────────────────────────────────────────────────────

class PaymentProvider(StrEnum):
    """Supported payment providers."""

    STRIPE = "stripe"
    PAYOS = "payos"

PAYMENT_PROVIDERS: frozenset[str] = frozenset(provider.value for provider in PaymentProvider)
