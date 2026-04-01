"""Platform-wide constants.

Only contains values that are structural (defined by the platform, not user data).
Values that need CRUD (app categories, etc.) belong in a Beanie Document model.

Usage:
    from shared.enums import WidgetSize, ConfigFieldType, InstallationStatus
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


# ─── Installation ────────────────────────────────────────────────────────────────

InstallationStatus = Literal["active", "disabled"]
"""Valid values for UserAppInstallation.status."""

INSTALLATION_STATUSES: frozenset[str] = frozenset({"active", "disabled"})


# ─── Chat ──────────────────────────────────────────────────────────────────────

ChatEventType = Literal["token", "tool_call", "tool_result", "done", "error"]
"""Valid values for ChatStream event types."""
