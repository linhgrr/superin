"""Platform-wide constants.

Only contains values that are structural (defined by the platform, not user data).
Values that need CRUD (app categories, etc.) belong in a Beanie Document model.

Usage:
    from shared.enums import WidgetSize, ConfigFieldType, InstallationStatus
"""

from __future__ import annotations

from typing import Literal


# ─── Widget ────────────────────────────────────────────────────────────────────

WidgetSize = Literal["small", "medium", "large", "full-width"]
"""Valid widget sizes for WidgetManifestSchema.size."""

WIDGET_SIZES: frozenset[str] = frozenset({"small", "medium", "large", "full-width"})
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
