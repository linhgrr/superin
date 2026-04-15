"""Calendar CRUD routes."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from apps.calendar.schemas import (
    CalendarCalendarRead,
    CalendarCreateCalendarRequest,
    CalendarCreateRecurringRuleRequest,
    CalendarEventRead,
    CalendarRecurringRuleRead,
    CalendarScheduleTaskRequest,
    CalendarUpdateCalendarRequest,
)
from apps.calendar.service import calendar_service
from core.auth.dependencies import get_current_user

router = APIRouter()
calendar_router = APIRouter()


# ─── Calendars ────────────────────────────────────────────────────────────────


@calendar_router.get("/", response_model=list[CalendarCalendarRead])
async def list_calendars(user_id: str = Depends(get_current_user)):
    """List all calendars."""
    return await calendar_service.list_calendars(user_id)


@calendar_router.post("/", response_model=CalendarCalendarRead)
async def create_calendar(
    request: CalendarCreateCalendarRequest,
    user_id: str = Depends(get_current_user),
):
    """Create new calendar."""
    try:
        return await calendar_service.create_calendar(user_id, request.name, request.color)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@calendar_router.patch("/{calendar_id}", response_model=CalendarCalendarRead)
async def update_calendar(
    calendar_id: str,
    request: CalendarUpdateCalendarRequest,
    user_id: str = Depends(get_current_user),
):
    """Update calendar — only fields set in the request are updated."""
    try:
        return await calendar_service.update_calendar(
            calendar_id,
            user_id,
            name=request.name,
            color=request.color,
            is_visible=request.is_visible,
            is_default=request.is_default,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@calendar_router.delete("/{calendar_id}")
async def delete_calendar(calendar_id: str, user_id: str = Depends(get_current_user)):
    """Delete calendar and all its events."""
    try:
        return await calendar_service.delete_calendar(calendar_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Conflicts ──────────────────────────────────────────────────────────────────


@router.get("/conflicts", response_model=list[CalendarEventRead])
async def check_conflicts(
    start: datetime,
    end: datetime,
    exclude_event_id: str | None = Query(None),
    user_id: str = Depends(get_current_user),
):
    """Check for conflicting events."""
    return await calendar_service.check_conflicts(user_id, start, end, exclude_event_id)


# ─── Recurring ──────────────────────────────────────────────────────────────────


@router.post("/events/{event_id}/recurring", response_model=CalendarRecurringRuleRead)
async def create_recurring(
    event_id: str,
    request: CalendarCreateRecurringRuleRequest,
    user_id: str = Depends(get_current_user),
):
    """Make event recurring."""
    try:
        return await calendar_service.create_recurring_rule(
            user_id,
            event_id,
            request.frequency,
            request.interval,
            request.days_of_week,
            request.end_date,
            request.max_occurrences,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/recurring", response_model=list[CalendarRecurringRuleRead])
async def list_recurring_rules(user_id: str = Depends(get_current_user)):
    """List recurring rules."""
    return await calendar_service.list_recurring_rules(user_id)


@router.patch("/recurring/{rule_id}/stop", response_model=CalendarRecurringRuleRead)
async def stop_recurring(
    rule_id: str,
    user_id: str = Depends(get_current_user),
):
    """Stop recurring rule."""
    try:
        return await calendar_service.stop_recurring_rule(rule_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Todo Integration ───────────────────────────────────────────────────────────


@router.post("/tasks/{task_id}/schedule", response_model=CalendarEventRead)
async def schedule_task(
    task_id: str,
    request: CalendarScheduleTaskRequest,
    user_id: str = Depends(get_current_user),
):
    """Schedule Todo task as time-blocked event."""
    try:
        return await calendar_service.schedule_task(
            user_id,
            task_id,
            request.start_datetime,
            request.duration_minutes,
            request.calendar_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
