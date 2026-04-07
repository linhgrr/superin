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

from typing import Literal

# ─── Widget ────────────────────────────────────────────────────────────────────

WidgetSize = Literal["compact", "standard", "wide", "tall", "full"]
"""Valid widget sizes for WidgetManifestSchema.size."""

WIDGET_SIZES: dict[str, dict[str, int | str]] = {
    "compact": {"width": 4, "height": "120px"},
    "standard": {"width": 6, "height": "200px"},
    "wide": {"width": 8, "height": "200px"},
    "tall": {"width": 6, "height": "300px"},
    "full": {"width": 12, "height": "auto"},
}
"""Platform widget size presets shared across validation and docs."""

VALID_WIDGET_SIZES: frozenset[str] = frozenset(WIDGET_SIZES.keys())
"""Set of valid widget sizes. Used for validation."""


# ─── Config Field ───────────────────────────────────────────────────────────────

ConfigFieldType = Literal["text", "number", "select", "multi-select", "date", "boolean"]
"""Valid types for ConfigFieldSchema.type."""


# ─── Installation ───────────────────────────────────────────────────────────────

InstallationStatus = Literal["active", "disabled"]
"""Valid values for UserAppInstallation.status."""

INSTALLATION_STATUSES: frozenset[str] = frozenset({"active", "disabled"})

# ─── Installation (API response) ────────────────────────────────────────────────
# Distinct from InstallationStatus (DB model values above).
# Frontend/caller depends on these string values — must live here, not in routes.

INSTALL_STATUS_ALREADY_INSTALLED = "already_installed"
INSTALL_STATUS_NEW = "new"
INSTALL_STATUS_REACTIVATED = "reactivated"


# ─── Chat ──────────────────────────────────────────────────────────────────────

ChatEventType = Literal["token", "tool_call", "tool_result", "done", "error"]
"""Valid values for ChatStream event types."""
