"""Shared normalization helpers used across plugin repositories."""

from datetime import datetime


def normalize_name_key(name: str) -> str:
    """Normalize user-provided names for case-insensitive unique keys."""
    return name.strip().casefold()


from core.utils.timezone import ensure_naive_utc

def to_naive_datetime(dt: datetime | None) -> datetime | None:
    """Convert timezone-aware datetimes to naive datetimes in UTC for Mongo comparisons."""
    if dt is None:
        return None
    return ensure_naive_utc(dt)
