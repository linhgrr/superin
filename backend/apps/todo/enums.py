"""Todo plugin type enums — owned by this plugin, imported by its own modules."""

from __future__ import annotations

from typing import Literal

TaskStatus = Literal["pending", "completed"]
"""Valid values for Task.status."""

TaskPriority = Literal["low", "medium", "high"]
"""Valid values for Task.priority."""

RecurrenceFrequency = Literal["daily", "weekly", "monthly", "yearly"]
"""Valid frequencies for recurring rules."""
