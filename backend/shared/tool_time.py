"""Shared temporal normalization for agent tools.

Pattern A:
- each tool declares ``temporal_fields={field_name: kind}``
- the wrapper resolves the current user's timezone
- tool inputs are normalized before the domain operation runs
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from typing import Any, Literal

from core.models import User
from core.utils.timezone import get_user_timezone_context, utc_now

TemporalFieldKind = Literal["instant", "local_datetime", "local_date", "local_time"]


@dataclass(frozen=True)
class ToolTimeContext:
    """Per-request timezone context for time-aware tools."""

    user_id: str
    user: User | None
    timezone: str
    now_utc: datetime
    now_local: datetime

    def local_date_range_utc(self, value: date) -> tuple[datetime, datetime]:
        """Convert a local calendar date into an inclusive UTC day range."""
        context = get_user_timezone_context(self.user)
        day_range = context.day_range(datetime.combine(value, time.min))
        return day_range.start, day_range.end

    def combine_local_date_and_time_to_utc(
        self,
        local_date: date,
        local_time: time,
    ) -> datetime:
        """Combine local date/time semantics and convert to an aware UTC instant."""
        context = get_user_timezone_context(self.user)
        return context.local_to_utc(datetime.combine(local_date, local_time))


def _parse_datetime_value(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _parse_date_value(value: str | date | datetime) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _parse_time_value(value: str | time) -> time:
    if isinstance(value, time):
        return value
    return time.fromisoformat(value)


def normalize_temporal_value(
    value: Any,
    kind: TemporalFieldKind,
    time_context: ToolTimeContext,
) -> Any:
    """Normalize one declared temporal field according to the tool contract."""
    if value is None:
        return None

    if kind == "instant":
        dt = _parse_datetime_value(value)
        if dt.tzinfo is None:
            raise ValueError("Absolute instants must include a UTC offset or Z suffix.")
        return dt.astimezone(UTC)

    if kind == "local_datetime":
        dt = _parse_datetime_value(value)
        if dt.tzinfo is not None:
            return dt.astimezone(UTC)
        context = get_user_timezone_context(time_context.user)
        return context.local_to_utc(dt)

    if kind == "local_date":
        return _parse_date_value(value)

    if kind == "local_time":
        return _parse_time_value(value)

    raise ValueError(f"Unsupported temporal field kind: {kind}")


def normalize_temporal_payload(
    payload: dict[str, Any],
    temporal_fields: dict[str, TemporalFieldKind],
    time_context: ToolTimeContext,
) -> dict[str, Any]:
    """Normalize all declared temporal fields in a tool payload."""
    normalized: dict[str, Any] = {}
    for field_name, kind in temporal_fields.items():
        if field_name not in payload:
            continue
        normalized[field_name] = normalize_temporal_value(
            payload[field_name],
            kind,
            time_context,
        )
    return normalized


async def build_tool_time_context(user_id: str) -> ToolTimeContext:
    """Build per-user timezone context for tool normalization."""
    user = await User.get(user_id)
    context = get_user_timezone_context(user)
    now_utc_value = utc_now()
    return ToolTimeContext(
        user_id=user_id,
        user=user,
        timezone=context.tz_name,
        now_utc=now_utc_value,
        now_local=context.utc_to_local(now_utc_value) or now_utc_value,
    )
