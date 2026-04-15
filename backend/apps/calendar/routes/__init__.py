"""Calendar plugin FastAPI routes."""

from __future__ import annotations

from fastapi import APIRouter

from apps.calendar.routes import (
    calendars,
    events,
    preferences,
    widgets,
)
from apps.calendar.routes.widgets import (
    get_day_summary_widget_data,
    get_month_view_widget_data,
    get_upcoming_widget_data,
)

router = APIRouter()
router.include_router(widgets.router, prefix="/widgets", tags=["widgets"])
router.include_router(events.router, prefix="/events", tags=["events"])
router.include_router(calendars.calendar_router, prefix="/calendars", tags=["calendars"])
router.include_router(calendars.router, tags=["calendar-misc"])
router.include_router(preferences.router, prefix="/preferences", tags=["preferences"])

__all__ = [
    "router",
    "get_month_view_widget_data",
    "get_upcoming_widget_data",
    "get_day_summary_widget_data",
]
