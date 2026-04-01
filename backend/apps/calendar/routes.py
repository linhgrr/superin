"""Calendar plugin FastAPI routes."""

from datetime import datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from apps.calendar.schemas import (
    CreateCalendarRequest,
    CreateEventRequest,
    CreateRecurringRuleRequest,
    ScheduleTaskRequest,
    UpdateCalendarRequest,
    UpdateEventRequest,
)
from apps.calendar.service import calendar_service
from core.auth import get_current_user
from core.models import WidgetPreference
from shared.schemas import PreferenceUpdate, WidgetPreferenceSchema

router = APIRouter()


# ─── Widgets ──────────────────────────────────────────────────────────────────

@router.get("/widgets")
async def list_widgets():
    from apps.calendar.manifest import calendar_manifest
    return calendar_manifest.widgets


# ─── Events ───────────────────────────────────────────────────────────────────

@router.get("/events")
async def list_events(
    user_id: str = Depends(get_current_user),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    calendar_id: str | None = Query(None),
    limit: int = Query(100, le=500),
):
    """List events with optional filters."""
    return await calendar_service.list_events(user_id, start, end, calendar_id, limit)


@router.get("/events/search")
async def search_events(
    q: str,
    user_id: str = Depends(get_current_user),
    limit: int = Query(20, le=100),
):
    """Search events by query."""
    return await calendar_service.search_events(user_id, q, limit)


@router.get("/events/{event_id}")
async def get_event(event_id: str, user_id: str = Depends(get_current_user)):
    """Get single event."""
    event = await calendar_service.get_event(event_id, user_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.post("/events")
async def create_event(
    request: CreateEventRequest,
    user_id: str = Depends(get_current_user),
):
    """Create new event."""
    try:
        return await calendar_service.create_event(
            user_id,
            request.title,
            request.start_datetime,
            request.end_datetime,
            request.calendar_id,
            request.description,
            request.location,
            request.is_all_day,
            request.type,
            request.task_id,
            request.color,
            request.reminders,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/events/{event_id}")
async def update_event(
    event_id: str,
    request: UpdateEventRequest,
    user_id: str = Depends(get_current_user),
):
    """Update event."""
    try:
        kwargs = {}
        if request.title is not None:
            kwargs["title"] = request.title
        if request.start_datetime is not None:
            kwargs["start_datetime"] = request.start_datetime
        if request.end_datetime is not None:
            kwargs["end_datetime"] = request.end_datetime
        if request.calendar_id is not None:
            kwargs["calendar_id"] = request.calendar_id
        if request.description is not None:
            kwargs["description"] = request.description
        if request.location is not None:
            kwargs["location"] = request.location
        if request.color is not None:
            kwargs["color"] = request.color
        if request.reminders is not None:
            kwargs["reminders"] = request.reminders
        return await calendar_service.update_event(event_id, user_id, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/events/{event_id}")
async def delete_event(event_id: str, user_id: str = Depends(get_current_user)):
    """Delete event."""
    try:
        return await calendar_service.delete_event(event_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Conflicts ────────────────────────────────────────────────────────────────

@router.get("/conflicts/check")
async def check_conflicts(
    start: datetime,
    end: datetime,
    exclude_event_id: str | None = Query(None),
    user_id: str = Depends(get_current_user),
):
    """Check for conflicting events."""
    return await calendar_service.check_conflicts(user_id, start, end, exclude_event_id)


# ─── Calendars ──────────────────────────────────────────────────────────────

@router.get("/calendars")
async def list_calendars(user_id: str = Depends(get_current_user)):
    """List all calendars."""
    return await calendar_service.list_calendars(user_id)


@router.post("/calendars")
async def create_calendar(
    request: CreateCalendarRequest,
    user_id: str = Depends(get_current_user),
):
    """Create new calendar."""
    try:
        return await calendar_service.create_calendar(user_id, request.name, request.color)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/calendars/{calendar_id}")
async def update_calendar(
    calendar_id: str,
    request: UpdateCalendarRequest,
    user_id: str = Depends(get_current_user),
):
    """Update calendar."""
    try:
        kwargs = {}
        if request.name is not None:
            kwargs["name"] = request.name
        if request.color is not None:
            kwargs["color"] = request.color
        if request.is_visible is not None:
            kwargs["is_visible"] = request.is_visible
        if request.is_default is not None:
            kwargs["is_default"] = request.is_default
        return await calendar_service.update_calendar(calendar_id, user_id, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/calendars/{calendar_id}")
async def delete_calendar(calendar_id: str, user_id: str = Depends(get_current_user)):
    """Delete calendar and all its events."""
    try:
        return await calendar_service.delete_calendar(calendar_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Recurring ────────────────────────────────────────────────────────────────

@router.post("/events/{event_id}/recurring")
async def create_recurring(
    event_id: str,
    request: CreateRecurringRuleRequest,
    user_id: str = Depends(get_current_user),
):
    """Make event recurring."""
    try:
        return await calendar_service.create_recurring_rule(
            user_id, event_id, request.frequency, request.interval,
            request.days_of_week, request.end_date, request.max_occurrences
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/recurring")
async def list_recurring_rules(user_id: str = Depends(get_current_user)):
    """List recurring rules."""
    return await calendar_service.list_recurring_rules(user_id)


@router.patch("/recurring/{rule_id}/stop")
async def stop_recurring(
    rule_id: str,
    user_id: str = Depends(get_current_user),
):
    """Stop recurring rule."""
    try:
        return await calendar_service.stop_recurring_rule(rule_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Todo Integration ─────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/schedule")
async def schedule_task(
    task_id: str,
    request: ScheduleTaskRequest,
    user_id: str = Depends(get_current_user),
):
    """Schedule Todo task as time-blocked event."""
    try:
        return await calendar_service.schedule_task(
            user_id, task_id, request.start_datetime, request.duration_minutes, request.calendar_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Preferences ──────────────────────────────────────────────────────────────

@router.get("/preferences")
async def get_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        WidgetPreference.app_id == "calendar",
    ).to_list()
    return [
        WidgetPreferenceSchema(
            id=str(p.id),
            user_id=str(p.user_id),
            widget_id=p.widget_id,
            app_id=p.app_id,
            enabled=p.enabled,
            position=p.position,
            config=p.config,
        )
        for p in prefs
    ]


@router.put("/preferences")
async def update_preferences(
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    for u in updates:
        pref = await WidgetPreference.find_one(
            WidgetPreference.user_id == PydanticObjectId(user_id),
            WidgetPreference.app_id == "calendar",
            WidgetPreference.widget_id == u.widget_id,
        )
        if pref:
            if u.enabled is not None:
                pref.enabled = u.enabled
            if u.position is not None:
                pref.position = u.position
            if u.config is not None:
                pref.config = u.config
            if u.size_w is not None:
                pref.size_w = u.size_w
            if u.size_h is not None:
                pref.size_h = u.size_h
            await pref.save()
    return await get_preferences(user_id)
