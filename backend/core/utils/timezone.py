"""Timezone utilities for user-aware datetime handling.

Architecture — UTC storage, user-tz display:
- All datetime storage is UTC (naive in MongoDB, aware in Python).
- All display/comparison is done in the user's configured timezone.
- BE NEVER stores user-local datetimes without converting to UTC first.

Usage:
    # Get current time in UTC
    now = utc_now()

    # Normalize any input (naive, aware, any timezone) to aware UTC
    aware_utc = ensure_aware_utc(dt)

    # Normalize any input to naive UTC for MongoDB queries/storage
    naive_utc = ensure_naive_utc(dt)

    # User-aware context (for display, date ranges, per-user queries)
    ctx = get_user_timezone_context(user)
    local_now = ctx.now_local()
    today_range = ctx.today_range()       # DayRange(start_utc, end_utc)
    month_range = ctx.month_range()        # (start_utc, end_utc)
    local_dt = ctx.utc_to_local(utc_dt)   # for display

Tool Layer Rule:
    Every datetime input from LLM MUST be normalized via ensure_aware_utc()
    before passing to service. Never trust LLM-sent datetimes to have offset.

    # ❌ WRONG — datetime.fromisoformat returns naive if no offset
    dt = datetime.fromisoformat(date)

    # ✅ CORRECT — always normalize
    dt = ensure_aware_utc(datetime.fromisoformat(date))
"""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from typing import TYPE_CHECKING, Any, NamedTuple
from zoneinfo import ZoneInfo

if TYPE_CHECKING:
    from core.models import User


def utc_now() -> datetime:
    """Get the current time in UTC as a timezone-aware datetime."""
    return datetime.now(UTC)


def ensure_aware_utc(dt: datetime) -> datetime:
    """Normalize a datetime to timezone-aware UTC.

    If the datetime is naive (missing timezone info), it is ASSUMED to be UTC
    and made aware. If it already has timezone info, it is converted to UTC.

    Use this for:
    - All tool/LLM input normalization
    - Any datetime coming from external sources (API, user input, LLM)
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def ensure_naive_utc(dt: datetime) -> datetime:
    """Convert a datetime to naive UTC (for MongoDB/Beanie storage and queries).

    If the datetime has timezone info, it is converted to UTC first, then the
    tzinfo is stripped. If it is already naive, it is returned as-is (assumed UTC).

    Use this for:
    - All MongoDB comparisons
    - All model field storage
    """
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


# ─── Common timezones (reference list) ───────────────────────────────────────

COMMON_TIMEZONES = {
    "UTC": "UTC",
    "Asia/Ho_Chi_Minh": "Asia/Ho_Chi_Minh",
    "Asia/Bangkok": "Asia/Bangkok",
    "Asia/Singapore": "Asia/Singapore",
    "Asia/Tokyo": "Asia/Tokyo",
    "Asia/Seoul": "Asia/Seoul",
    "Asia/Shanghai": "Asia/Shanghai",
    "Asia/Hong_Kong": "Asia/Hong_Kong",
    "Asia/Kolkata": "Asia/Kolkata",
    "Asia/Dubai": "Asia/Dubai",
    "Europe/London": "Europe/London",
    "Europe/Paris": "Europe/Paris",
    "Europe/Berlin": "Europe/Berlin",
    "America/New_York": "America/New_York",
    "America/Los_Angeles": "America/Los_Angeles",
    "America/Chicago": "America/Chicago",
    "America/Toronto": "America/Toronto",
    "America/Sao_Paulo": "America/Sao_Paulo",
    "Australia/Sydney": "Australia/Sydney",
    "Australia/Melbourne": "Australia/Melbourne",
}

DEFAULT_TIMEZONE = "UTC"


def normalize_name_key(name: str) -> str:
    """Normalize a user-provided name for case-insensitive unique keys.

    Used by repositories to ensure name uniqueness per user regardless of case.
    """
    return name.strip().casefold()


def _get_zone(tz_name: str) -> ZoneInfo:
    """Get a ZoneInfo for the given timezone name. Falls back to UTC."""
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("UTC")


# ─── Day range ─────────────────────────────────────────────────────────────────

class DayRange(NamedTuple):
    """Start and end of a day in UTC (aware datetimes)."""
    start: datetime
    end: datetime


# ─── User timezone context ────────────────────────────────────────────────────

class UserTimezoneContext:
    """Context for performing timezone-aware operations for a specific user.

    All stored datetimes are in UTC. Use this class to:
    - Convert UTC to local time for display
    - Calculate date ranges (today, this week, this month) in local time
    - Format dates/times according to user preference

    Usage:
        ctx = get_user_timezone_context(user)
        today_range = ctx.today_range()          # for DB queries
        local_dt = ctx.utc_to_local(utc_dt)      # for display
        current_month = ctx.month_range()        # for reports
    """

    def __init__(self, user: User | None):
        self.user = user
        self.tz_name = user.settings.get("timezone", DEFAULT_TIMEZONE) if user else DEFAULT_TIMEZONE
        self.tz: ZoneInfo = _get_zone(self.tz_name)

    def now_utc(self) -> datetime:
        """Get current time in UTC."""
        return datetime.now(UTC)

    def now_local(self) -> datetime:
        """Get current time in the user's local timezone."""
        return datetime.now(UTC).astimezone(self.tz)

    def utc_to_local(self, dt: datetime | None) -> datetime | None:
        """Convert a UTC datetime to the user's local timezone.

        Args:
            dt: UTC datetime (can be naive or aware). If naive, assumed UTC.

        Returns:
            Local datetime, or None if input was None.
        """
        if dt is None:
            return None
        dt = ensure_aware_utc(dt)
        return dt.astimezone(self.tz)

    def local_to_utc(self, dt: datetime) -> datetime:
        """Convert a local datetime (user's timezone) to UTC for storage.

        Args:
            dt: Datetime in the user's local timezone (can be naive or aware).

        Returns:
            UTC datetime (aware).
        """
        if dt.tzinfo is None:
            # Naive datetime — interpret as user's local time
            aware_local = dt.replace(tzinfo=self.tz)
        else:
            aware_local = dt.astimezone(self.tz)
        return aware_local.astimezone(UTC)

    def today_range(self) -> DayRange:
        """Get start and end of today in the user's timezone, converted to UTC.

        This is the correct way to query "tasks due today" — use the UTC range
        that corresponds to the user's local "today".

        Returns:
            DayRange with start (00:00:00 local) and end (23:59:59 local) in UTC.
        """
        now_local = self.now_local()

        start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        end_local = now_local.replace(hour=23, minute=59, second=59, microsecond=999999)

        return DayRange(
            start=start_local.astimezone(UTC),
            end=end_local.astimezone(UTC)
        )

    def month_range(self, month_offset: int = 0) -> tuple[datetime, datetime]:
        """Get start and end of a month in the user's timezone, converted to UTC.

        Use this instead of manual datetime arithmetic — it encapsulates the
        conversion so callers never forget .astimezone(UTC).

        Args:
            month_offset: Months relative to current month.
                          0 = this month, 1 = next month, -1 = last month.

        Returns:
            Tuple of (start_of_month_utc, end_of_month_utc) as aware UTC datetimes.
        """
        now_local = self.now_local()

        month_index = now_local.year * 12 + (now_local.month - 1) + month_offset
        target_year = month_index // 12
        target_month = month_index % 12 + 1

        start_local = now_local.replace(
            year=target_year, month=target_month, day=1,
            hour=0, minute=0, second=0, microsecond=0,
        )

        if target_month == 12:
            next_month_start = start_local.replace(year=target_year + 1, month=1)
        else:
            next_month_start = start_local.replace(month=target_month + 1)

        end_local = next_month_start - timedelta(microseconds=1)

        return start_local.astimezone(UTC), end_local.astimezone(UTC)

    def day_range(self, local_date: datetime) -> DayRange:
        """Get UTC range for a specific local calendar date.

        Args:
            local_date: Any datetime; only its date component is used.

        Returns:
            DayRange for that date in UTC.
        """
        date_part = local_date.date() if hasattr(local_date, 'date') else local_date

        # Construct start (00:00) and end (23:59:59.999999) in local time
        start_local = datetime.combine(date_part, time.min, tzinfo=self.tz)
        end_local = datetime.combine(date_part, time.max, tzinfo=self.tz)

        return DayRange(
            start=start_local.astimezone(UTC),
            end=end_local.astimezone(UTC)
        )

    def is_today(self, utc_dt: datetime | None) -> bool:
        """Check if a UTC datetime falls within the user's local "today"."""
        if utc_dt is None:
            return False
        today = self.today_range()
        start = ensure_naive_utc(today.start)
        end = ensure_naive_utc(today.end)
        utc_dt_naive = ensure_naive_utc(utc_dt)
        return start <= utc_dt_naive <= end

    def is_past(self, utc_dt: datetime | None) -> bool:
        """Check if a UTC datetime is in the past relative to user's local time."""
        if utc_dt is None:
            return False
        local_dt = self.utc_to_local(utc_dt)
        now_local = self.now_local()
        local_dt_naive = local_dt.replace(tzinfo=None)
        now_local_naive = now_local.replace(tzinfo=None)
        return local_dt_naive < now_local_naive

    def format_date(self, utc_dt: datetime | None, format_str: str = "%Y-%m-%d") -> str:
        """Format a UTC datetime for display in the user's local timezone."""
        if utc_dt is None:
            return ""
        local_dt = self.utc_to_local(utc_dt)
        return local_dt.strftime(format_str)

    def format_time(self, utc_dt: datetime | None, format_str: str = "%H:%M") -> str:
        """Format a UTC datetime time component for display."""
        if utc_dt is None:
            return ""
        local_dt = self.utc_to_local(utc_dt)
        return local_dt.strftime(format_str)

    def format_datetime(self, utc_dt: datetime | None, format_str: str = "%Y-%m-%d %H:%M") -> str:
        """Format a UTC datetime for display in the user's local timezone."""
        if utc_dt is None:
            return ""
        local_dt = self.utc_to_local(utc_dt)
        return local_dt.strftime(format_str)

    def get_date_time_tuple(self) -> tuple[str, str]:
        """Get current date and time strings for the user in local time.

        Returns:
            Tuple of (date_str, time_str) in YYYY-MM-DD and HH:MM format.
        """
        now_local = self.now_local()
        return now_local.strftime("%Y-%m-%d"), now_local.strftime("%H:%M")


def get_user_timezone_context(user: User | None) -> UserTimezoneContext:
    """Factory function to create a timezone context for a user.

    Args:
        user: User document, or None for UTC context.

    Returns:
        UserTimezoneContext configured for the user's timezone.
    """
    return UserTimezoneContext(user)


def convert_utc_strings_to_local(obj: Any, formatter: Any) -> Any:
    """Recursively convert ISO UTC datetime strings in nested data to local strings."""
    if isinstance(obj, str):
        if "T" not in obj:
            return obj
        try:
            dt = datetime.fromisoformat(obj.replace("Z", "+00:00"))
        except ValueError:
            return obj
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return formatter(dt)

    if isinstance(obj, dict):
        return {k: convert_utc_strings_to_local(v, formatter) for k, v in obj.items()}

    if isinstance(obj, list):
        return [convert_utc_strings_to_local(item, formatter) for item in obj]

    return obj


def get_user_local_time(user: User | None) -> tuple[str, str]:
    """Get current date and time in the user's timezone.

    Convenience wrapper for code that only needs date/time strings
    (e.g., injecting into LLM system prompts). For richer operations,
    use UserTimezoneContext directly.

    Returns:
        Tuple of (date_str, time_str) in YYYY-MM-DD and HH:MM format.
    """
    ctx = get_user_timezone_context(user)
    return ctx.get_date_time_tuple()
