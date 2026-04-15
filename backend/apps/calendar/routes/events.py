"""Event CRUD routes."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from apps.calendar.schemas import (
    CalendarActionResponse,
    CalendarCreateEventRequest,
    CalendarEventRead,
    CalendarUpdateEventRequest,
)
from apps.calendar.service import calendar_service
from core.auth.dependencies import get_current_user

router = APIRouter()


@router.get("/", response_model=list[CalendarEventRead])
async def list_events(
    user_id: str = Depends(get_current_user),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    calendar_id: str | None = Query(None),
    limit: int = Query(100, le=500),
):
    """List events with optional filters."""
    return await calendar_service.list_events(user_id, start, end, calendar_id, limit)


@router.get("/search", response_model=list[CalendarEventRead])
async def search_events(
    q: str,
    user_id: str = Depends(get_current_user),
    limit: int = Query(20, le=100),
):
    """Search events by query."""
    return await calendar_service.search_events(user_id, q, limit)


@router.get("/{event_id}", response_model=CalendarEventRead)
async def get_event(event_id: str, user_id: str = Depends(get_current_user)):
    """Get single event."""
    event = await calendar_service.get_event(event_id, user_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.post("/", response_model=CalendarEventRead)
async def create_event(
    request: CalendarCreateEventRequest,
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


@router.patch("/{event_id}", response_model=CalendarEventRead)
async def update_event(
    event_id: str,
    request: CalendarUpdateEventRequest,
    user_id: str = Depends(get_current_user),
):
    """Update event — only fields set in the request are updated."""
    try:
        return await calendar_service.update_event(
            event_id,
            user_id,
            title=request.title,
            start_datetime=request.start_datetime,
            end_datetime=request.end_datetime,
            calendar_id=request.calendar_id,
            description=request.description,
            location=request.location,
            color=request.color,
            reminders=request.reminders,
            is_all_day=request.is_all_day,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{event_id}", response_model=CalendarActionResponse)
async def delete_event(event_id: str, user_id: str = Depends(get_current_user)):
    """Delete event."""
    try:
        return await calendar_service.delete_event(event_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
