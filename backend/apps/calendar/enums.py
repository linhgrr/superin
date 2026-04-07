"""Calendar plugin type enums — owned by this plugin, imported by its own modules."""

from __future__ import annotations

from typing import Literal

EventType = Literal["event", "time_blocked_task"]
"""Valid values for Event.type."""

RecurrenceFrequency = Literal["daily", "weekly", "monthly", "yearly"]
"""Valid frequencies for recurring rules."""

AttendeeStatus = Literal["pending", "accepted", "declined", "tentative"]
"""Valid values for Attendee.status."""
