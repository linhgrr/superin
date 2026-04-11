"""Calendar plugin FastAPI routes."""

from calendar import month_name, monthrange
from datetime import datetime, timedelta

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from apps.calendar.schemas import (
    CalendarActionResponse,
    CalendarCalendarRead,
    CalendarCreateCalendarRequest,
    CalendarCreateEventRequest,
    CalendarCreateRecurringRuleRequest,
    CalendarEventRead,
    CalendarMonthDaySummary,
    CalendarRecurringRuleRead,
    CalendarScheduleTaskRequest,
    CalendarUpdateCalendarRequest,
    CalendarUpdateEventRequest,
    CalendarWidgetDataResponse,
    DaySummaryWidgetConfig,
    DaySummaryWidgetData,
    MonthViewWidgetConfig,
    MonthViewWidgetData,
    UpcomingWidgetConfig,
    UpcomingWidgetData,
)
from apps.calendar.service import calendar_service
from core.auth.dependencies import get_current_user
from core.models import User, WidgetPreference
from core.registry import WIDGET_DATA_HANDLERS
from core.utils.timezone import get_user_timezone_context
from core.widget_config import resolve_widget_config, upsert_widget_config
from shared.preference_utils import (
    preference_to_schema,
    update_multiple_preferences,
)
from shared.schemas import (
    ConfigFieldSchema,
    PreferenceUpdate,
    SelectOption,
    WidgetDataConfigSchema,
    WidgetDataConfigUpdate,
    WidgetManifestSchema,
    WidgetPreferenceSchema,
)

router = APIRouter()


def _get_widget_manifest(widget_id: str) -> WidgetManifestSchema:
    from apps.calendar.manifest import calendar_manifest

    for widget in calendar_manifest.widgets:
        if widget.id == widget_id:
            return widget
    raise HTTPException(status_code=404, detail=f"Widget '{widget_id}' not found")


def _add_month_offset(now_local: datetime, month_offset: int) -> tuple[int, int]:
    month_index = (now_local.year * 12 + (now_local.month - 1)) + month_offset
    year = month_index // 12
    month = month_index % 12 + 1
    return year, month


async def _resolve_widget_options(
    user_id: str,
    widget: WidgetManifestSchema,
) -> list[ConfigFieldSchema]:
    calendars = await calendar_service.list_calendars(user_id)
    calendar_options = [
        SelectOption(label=calendar["name"], value=calendar["id"])
        for calendar in calendars
    ]

    fields: list[ConfigFieldSchema] = []
    for field in widget.config_fields:
        next_field = field.model_copy(deep=True)
        if next_field.options_source == "calendar.calendars":
            next_field.options = calendar_options
        fields.append(next_field)
    return fields


async def get_month_view_widget_data(
    user_id: str,
    config: MonthViewWidgetConfig,
    month_offset: int = 0,
) -> MonthViewWidgetData:
    user = await User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    ctx = get_user_timezone_context(user)
    now_local = ctx.now_local()
    year, month = _add_month_offset(now_local, month_offset)
    start_local = now_local.replace(
        year=year,
        month=month,
        day=1,
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )
    days_in_month = monthrange(year, month)[1]
    if month == 12:
        next_month_start = start_local.replace(year=year + 1, month=1)
    else:
        next_month_start = start_local.replace(month=month + 1)
    end_local = next_month_start - timedelta(microseconds=1)

    events = await calendar_service.list_events(
        user_id,
        start_local.astimezone().astimezone(start_local.tzinfo),
        end_local.astimezone().astimezone(end_local.tzinfo),
        config.default_calendar,
        200,
    )
    if not config.show_time_blocked_tasks:
        events = [event for event in events if event["type"] != "time_blocked_task"]

    day_map: dict[int, list[dict]] = {}
    for event in events:
        event_day = datetime.fromisoformat(str(event["start_datetime"])).day
        day_map.setdefault(event_day, []).append(event)

    calendars = await calendar_service.list_calendars(user_id)
    first_day = datetime(year, month, 1).weekday()
    return MonthViewWidgetData(
        month=month,
        year=year,
        month_label=f"{month_name[month]} {year}",
        start_offset=first_day,
        days_in_month=days_in_month,
        days=[
            CalendarMonthDaySummary(
                day=day,
                event_count=len(day_map.get(day, [])),
                event_titles=[event["title"] for event in day_map.get(day, [])[:3]],
            )
            for day in range(1, days_in_month + 1)
        ],
        calendars=calendars,
    )


async def get_upcoming_widget_data(
    user_id: str,
    config: UpcomingWidgetConfig,
) -> UpcomingWidgetData:
    start = datetime.utcnow()
    end = start + timedelta(days=30)
    items = await calendar_service.list_events(
        user_id,
        start,
        end,
        config.calendar_filter,
        config.max_items,
    )
    return UpcomingWidgetData(items=items[: config.max_items])


async def get_day_summary_widget_data(
    user_id: str,
    config: DaySummaryWidgetConfig,
) -> DaySummaryWidgetData:
    user = await User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    ctx = get_user_timezone_context(user)
    today = ctx.today_range()
    horizon_end = today.end + timedelta(days=max(config.horizon_days - 1, 0))
    today_events = await calendar_service.list_events(user_id, today.start, today.end, None, 100)
    upcoming = await calendar_service.list_events(user_id, today.start, horizon_end, None, 1)
    return DaySummaryWidgetData(
        today_count=len(today_events),
        next_event=upcoming[0] if upcoming else None,
    )


# ─── Widgets ──────────────────────────────────────────────────────────────────

@router.get("/widgets", response_model=list[WidgetManifestSchema])
async def list_widgets() -> list[WidgetManifestSchema]:
    from apps.calendar.manifest import calendar_manifest
    return calendar_manifest.widgets


@router.get("/widgets/{widget_id}", response_model=CalendarWidgetDataResponse)
async def get_widget_data(
    widget_id: str,
    month_offset: int = 0,
    user_id: str = Depends(get_current_user),
) -> CalendarWidgetDataResponse:
    _get_widget_manifest(widget_id)
    handler = WIDGET_DATA_HANDLERS.get(widget_id)
    if handler is None:
        raise HTTPException(status_code=404, detail=f"Widget '{widget_id}' is not registered")
    config = await resolve_widget_config(user_id, widget_id)
    # Pass transient query params to handler if supported
    kwargs = {}
    if widget_id == "calendar.month-view":
        kwargs["month_offset"] = month_offset
    return await handler(user_id, config, **kwargs)


@router.put("/widgets/{widget_id}/config", response_model=WidgetDataConfigSchema)
async def update_widget_config(
    widget_id: str,
    update: WidgetDataConfigUpdate,
    user_id: str = Depends(get_current_user),
) -> WidgetDataConfigSchema:
    _get_widget_manifest(widget_id)
    if update.widget_id != widget_id:
        raise HTTPException(status_code=400, detail="Payload widget_id must match path widget_id")

    doc = await upsert_widget_config(user_id, widget_id, update.config)
    return WidgetDataConfigSchema(
        id=str(doc.id),
        user_id=str(doc.user_id),
        widget_id=doc.widget_id,
        config=doc.config,
    )


@router.get("/widgets/{widget_id}/options", response_model=list[ConfigFieldSchema])
async def get_widget_options(
    widget_id: str,
    user_id: str = Depends(get_current_user),
) -> list[ConfigFieldSchema]:
    widget = _get_widget_manifest(widget_id)
    return await _resolve_widget_options(user_id, widget)


# ─── Events ───────────────────────────────────────────────────────────────────

@router.get("/events", response_model=list[CalendarEventRead])
async def list_events(
    user_id: str = Depends(get_current_user),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    calendar_id: str | None = Query(None),
    limit: int = Query(100, le=500),
):
    """List events with optional filters."""
    return await calendar_service.list_events(user_id, start, end, calendar_id, limit)


@router.get("/events/search", response_model=list[CalendarEventRead])
async def search_events(
    q: str,
    user_id: str = Depends(get_current_user),
    limit: int = Query(20, le=100),
):
    """Search events by query."""
    return await calendar_service.search_events(user_id, q, limit)


@router.get("/events/{event_id}", response_model=CalendarEventRead)
async def get_event(event_id: str, user_id: str = Depends(get_current_user)):
    """Get single event."""
    event = await calendar_service.get_event(event_id, user_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.post("/events", response_model=CalendarEventRead)
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


@router.patch("/events/{event_id}", response_model=CalendarEventRead)
async def update_event(
    event_id: str,
    request: CalendarUpdateEventRequest,
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


@router.delete("/events/{event_id}", response_model=CalendarActionResponse)
async def delete_event(event_id: str, user_id: str = Depends(get_current_user)):
    """Delete event."""
    try:
        return await calendar_service.delete_event(event_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Conflicts ────────────────────────────────────────────────────────────────

@router.get("/conflicts/check", response_model=list[CalendarEventRead])
async def check_conflicts(
    start: datetime,
    end: datetime,
    exclude_event_id: str | None = Query(None),
    user_id: str = Depends(get_current_user),
):
    """Check for conflicting events."""
    return await calendar_service.check_conflicts(user_id, start, end, exclude_event_id)


# ─── Calendars ──────────────────────────────────────────────────────────────

@router.get("/calendars", response_model=list[CalendarCalendarRead])
async def list_calendars(user_id: str = Depends(get_current_user)):
    """List all calendars."""
    return await calendar_service.list_calendars(user_id)


@router.post("/calendars", response_model=CalendarCalendarRead)
async def create_calendar(
    request: CalendarCreateCalendarRequest,
    user_id: str = Depends(get_current_user),
):
    """Create new calendar."""
    try:
        return await calendar_service.create_calendar(user_id, request.name, request.color)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/calendars/{calendar_id}", response_model=CalendarCalendarRead)
async def update_calendar(
    calendar_id: str,
    request: CalendarUpdateCalendarRequest,
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


@router.delete("/calendars/{calendar_id}", response_model=CalendarActionResponse)
async def delete_calendar(calendar_id: str, user_id: str = Depends(get_current_user)):
    """Delete calendar and all its events."""
    try:
        return await calendar_service.delete_calendar(calendar_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Recurring ────────────────────────────────────────────────────────────────

@router.post("/events/{event_id}/recurring", response_model=CalendarRecurringRuleRead)
async def create_recurring(
    event_id: str,
    request: CalendarCreateRecurringRuleRequest,
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


# ─── Todo Integration ─────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/schedule", response_model=CalendarEventRead)
async def schedule_task(
    task_id: str,
    request: CalendarScheduleTaskRequest,
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
    return [preference_to_schema(p) for p in prefs]


@router.put("/preferences")
async def update_preferences(
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    await update_multiple_preferences(user_id, updates, "calendar")
    return await get_preferences(user_id)
