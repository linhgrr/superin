"""Shared normalization helpers used across plugin repositories."""

from datetime import datetime


def normalize_name_key(name: str) -> str:
    """Normalize user-provided names for case-insensitive unique keys."""
    return name.strip().casefold()


def to_naive_datetime(dt: datetime | None) -> datetime | None:
    """Convert timezone-aware datetimes to naive datetimes for Mongo comparisons."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone().replace(tzinfo=None)
    return dt
