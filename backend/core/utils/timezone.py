"""Timezone utilities for user-aware datetime handling.

All datetime operations should go through these utilities to ensure
consistent timezone handling across the application.

Usage:
    # Get user's timezone context
    ctx = get_user_timezone_context(user)

    # Convert UTC to local time
    local_dt = ctx.utc_to_local(utc_datetime)

    # Get start/end of today in user's timezone
    start, end = ctx.today_range()

    # Format for display
    date_str = ctx.format_date(utc_datetime)
"""

from datetime import UTC, datetime, time, timedelta
from typing import NamedTuple

import pytz
from pytz.tzinfo import DstTzInfo, StaticTzInfo

from core.models import User


def ensure_aware_utc(dt: datetime) -> datetime:
    """Ensure a datetime is timezone-aware and set to UTC.
    
    If the datetime is naive (missing timezone info), it is assumed to be UTC
    and made aware. If it already has timezone info, it is converted to UTC.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def ensure_naive_utc(dt: datetime) -> datetime:
    """Ensure a datetime is timezone-naive but based on UTC time.
    
    This is useful for MongoDB/Beanie queries where stored times might
    be naive UTC. If it has timezone info, it converts to UTC then strips it.
    """
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


# Common timezone names for reference
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


def get_user_timezone(user: User | None) -> DstTzInfo | StaticTzInfo:
    """Get pytz timezone object for a user.

    Args:
        user: User document, or None for default UTC

    Returns:
        pytz timezone object
    """
    if user is None:
        return pytz.UTC

    tz_name = user.settings.get("timezone", DEFAULT_TIMEZONE)
    try:
        return pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        return pytz.UTC


class DayRange(NamedTuple):
    """Start and end of a day in UTC."""
    start: datetime  # Inclusive, 00:00:00 local time
    end: datetime    # Inclusive, 23:59:59 local time


class UserTimezoneContext:
    """Context for performing timezone-aware operations for a specific user.

    This class encapsulates all timezone logic and provides a clean API
    for converting between UTC (storage) and local time (display/comparison).

    All stored datetimes should be in UTC. Use this class to:
    - Convert UTC to local time for display
    - Calculate date ranges (today, this week, this month) in local time
    - Format dates/times according to user preference
    """

    def __init__(self, user: User | None):
        self.user = user
        self.tz = get_user_timezone(user)
        self.tz_name = user.settings.get("timezone", DEFAULT_TIMEZONE) if user else DEFAULT_TIMEZONE

    def now_utc(self) -> datetime:
        """Get current time in UTC."""
        return datetime.now(UTC)

    def now_local(self) -> datetime:
        """Get current time in user's local timezone."""
        return datetime.now(UTC).astimezone(self.tz)

    def utc_to_local(self, dt: datetime | None) -> datetime | None:
        """Convert UTC datetime to user's local timezone.

        Args:
            dt: UTC datetime, or None

        Returns:
            Local datetime, or None if input was None
        """
        if dt is None:
            return None
        # Ensure the datetime is timezone-aware (assume UTC if naive)
        dt = ensure_aware_utc(dt)
        return dt.astimezone(self.tz)

    def local_to_utc(self, dt: datetime) -> datetime:
        """Convert local datetime to UTC for storage.

        Args:
            dt: Datetime in user's local timezone (can be naive or aware)

        Returns:
            UTC datetime
        """
        if dt.tzinfo is None:
            # Assume dt is in user's local timezone
            dt = self.tz.localize(dt)
        return dt.astimezone(UTC)

    def today_range(self) -> DayRange:
        """Get start and end of today in user's timezone, converted to UTC.

        This is useful for querying "tasks due today" - get the UTC range
        that corresponds to the user's local "today".

        Returns:
            DayRange with start (00:00:00) and end (23:59:59.999999) in UTC
        """
        now_local = self.now_local()

        start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        end_local = now_local.replace(hour=23, minute=59, second=59, microsecond=999999)

        return DayRange(
            start=start_local.astimezone(UTC),
            end=end_local.astimezone(UTC)
        )

    def month_range(self) -> tuple[datetime, datetime]:
        """Get start and end of current month in user's timezone, converted to UTC.

        This is useful for monthly reports and analytics (e.g., "income this month").

        Returns:
            Tuple of (start_of_month_utc, end_of_month_utc) as aware datetimes
        """
        now_local = self.now_local()

        # Start of month in local time
        start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # End of month: last day of month at 23:59:59.999999
        # Move to first day of next month, then subtract 1 microsecond
        if now_local.month == 12:
            next_month_start = start_local.replace(year=now_local.year + 1, month=1)
        else:
            next_month_start = start_local.replace(month=now_local.month + 1)

        end_local = next_month_start - timedelta(microseconds=1)

        return (
            start_local.astimezone(UTC),
            end_local.astimezone(UTC)
        )

    def date_range(self, local_date: datetime) -> DayRange:
        """Get UTC range for a specific local date.

        Args:
            local_date: A datetime representing the date (time component ignored)

        Returns:
            DayRange for that date in UTC
        """
        # Extract just the date component
        date_part = local_date.date() if hasattr(local_date, 'date') else local_date

        # Create start and end in local timezone
        start_local = datetime.combine(date_part, time.min)
        end_local = datetime.combine(date_part, time.max)

        # Localize and convert to UTC
        start_utc = self.tz.localize(start_local).astimezone(UTC)
        end_utc = self.tz.localize(end_local).astimezone(UTC)

        return DayRange(start=start_utc, end=end_utc)

    def is_today(self, utc_dt: datetime | None) -> bool:
        """Check if a UTC datetime falls within the user's local "today".

        Args:
            utc_dt: UTC datetime to check (can be naive or aware)

        Returns:
            True if utc_dt is within today's range in user's timezone
        """
        if utc_dt is None:
            return False

        today = self.today_range()
        # Convert to naive for comparison if needed
        start = ensure_naive_utc(today.start)
        end = ensure_naive_utc(today.end)
        utc_dt_naive = ensure_naive_utc(utc_dt)
        return start <= utc_dt_naive <= end

    def is_past(self, utc_dt: datetime | None) -> bool:
        """Check if a UTC datetime is in the past relative to user's local time.

        Args:
            utc_dt: UTC datetime to check (can be naive or aware)

        Returns:
            True if utc_dt is before now in user's local time
        """
        if utc_dt is None:
            return False

        # Convert both to local time for comparison
        local_dt = self.utc_to_local(utc_dt)
        now_local = self.now_local()

        # Convert to naive for comparison
        local_dt_naive = local_dt.replace(tzinfo=None) if local_dt.tzinfo else local_dt
        now_local_naive = now_local.replace(tzinfo=None) if now_local.tzinfo else now_local

        return local_dt_naive < now_local_naive

    def format_date(self, utc_dt: datetime | None, format_str: str = "%Y-%m-%d") -> str:
        """Format a UTC datetime for display in user's local timezone.

        Args:
            utc_dt: UTC datetime, or None
            format_str: strftime format string

        Returns:
            Formatted date string, or empty string if utc_dt is None
        """
        if utc_dt is None:
            return ""

        local_dt = self.utc_to_local(utc_dt)
        return local_dt.strftime(format_str)

    def format_time(self, utc_dt: datetime | None, format_str: str = "%H:%M") -> str:
        """Format a UTC datetime time component for display.

        Args:
            utc_dt: UTC datetime, or None
            format_str: strftime format string

        Returns:
            Formatted time string, or empty string if utc_dt is None
        """
        if utc_dt is None:
            return ""

        local_dt = self.utc_to_local(utc_dt)
        return local_dt.strftime(format_str)

    def format_datetime(self, utc_dt: datetime | None, format_str: str = "%Y-%m-%d %H:%M") -> str:
        """Format a UTC datetime for display in user's local timezone.

        Args:
            utc_dt: UTC datetime, or None
            format_str: strftime format string

        Returns:
            Formatted datetime string, or empty string if utc_dt is None
        """
        if utc_dt is None:
            return ""

        local_dt = self.utc_to_local(utc_dt)
        return local_dt.strftime(format_str)

    def get_date_time_tuple(self) -> tuple[str, str]:
        """Get current date and time strings for the user.

        Returns:
            Tuple of (date_str, time_str) in user's local timezone
        """
        now_local = self.now_local()
        return now_local.strftime("%Y-%m-%d"), now_local.strftime("%H:%M")


def get_user_timezone_context(user: User | None) -> UserTimezoneContext:
    """Factory function to create a timezone context for a user.

    Args:
        user: User document, or None for UTC context

    Returns:
        UserTimezoneContext configured for the user
    """
    return UserTimezoneContext(user)


# Legacy compatibility - keep for existing code
def get_user_local_time(user: User) -> tuple[str, str]:
    """Get current date and time in user's timezone.

    This is a legacy wrapper maintained for backward compatibility.
    New code should use UserTimezoneContext directly.

    Returns:
        tuple of (date_str, time_str) in user's local timezone.
        Defaults to UTC if user has no timezone set.
    """
    ctx = get_user_timezone_context(user)
    return ctx.get_date_time_tuple()
