"""Widget data, config, and manifest routes."""

from __future__ import annotations

import calendar
from calendar import month_name

from fastapi import APIRouter, Depends, HTTPException

from apps.calendar.schemas import (
    CalendarMonthDaySummary,
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
from core.models import User
from core.registry import WIDGET_DATA_HANDLERS
from core.utils.timezone import get_user_timezone_context
from core.widget_config import resolve_widget_config, upsert_widget_config
from shared.schemas import (
    ConfigFieldSchema,
    SelectOption,
    WidgetDataConfigSchema,
    WidgetDataConfigUpdate,
    WidgetManifestSchema,
)

router = APIRouter()


# ─── Helpers ───────────────────────────────────────────────────────────────────


def _get_widget_manifest(widget_id: str) -> WidgetManifestSchema:
    from apps.calendar.manifest import calendar_manifest

    for widget in calendar_manifest.widgets:
        if widget.id == widget_id:
            return widget
    raise HTTPException(status_code=404, detail=f"Widget '{widget_id}' not found")


def _weekday_offset(year: int, month: int) -> int:
    """Weekday of day 1 of the given month (Mon=0)."""
    return calendar.monthrange(year, month)[0]


async def _resolve_widget_options(
    user_id: str,
    widget: WidgetManifestSchema,
) -> list[ConfigFieldSchema]:
    calendars = await calendar_service.list_calendars(user_id)
    calendar_options = [
        SelectOption(label=c["name"], value=c["id"])
        for c in calendars
    ]

    fields: list[ConfigFieldSchema] = []
    for field in widget.config_fields:
        next_field = field.model_copy(deep=True)
        if next_field.options_source == "calendar.calendars":
            next_field.options = calendar_options
        fields.append(next_field)
    return fields


# ─── Widget data handlers ──────────────────────────────────────────────────────


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
    month_index = now_local.year * 12 + (now_local.month - 1) + month_offset
    year = month_index // 12
    month = month_index % 12 + 1
    start_utc, end_utc = ctx.month_range(month_offset)

    events = await calendar_service.list_events(
        user_id,
        start_utc,
        end_utc,
        config.default_calendar,
        200,
    )
    if not config.show_time_blocked_tasks:
        events = [e for e in events if e["type"] != "time_blocked_task"]

    day_map: dict[int, list[dict]] = {}
    for event in events:
        event_day = __import__("datetime").datetime.fromisoformat(str(event["start_datetime"])).day
        day_map.setdefault(event_day, []).append(event)

    calendars = await calendar_service.list_calendars(user_id)
    days_in_month = calendar.monthrange(year, month)[1]
    return MonthViewWidgetData(
        month=month,
        year=year,
        month_label=f"{month_name[month]} {year}",
        start_offset=_weekday_offset(year, month),
        days_in_month=days_in_month,
        days=[
            CalendarMonthDaySummary(
                day=day,
                event_count=len(day_map.get(day, [])),
                event_titles=[e["title"] for e in day_map.get(day, [])[:3]],
            )
            for day in range(1, days_in_month + 1)
        ],
        calendars=calendars,
    )


async def get_upcoming_widget_data(
    user_id: str,
    config: UpcomingWidgetConfig,
) -> UpcomingWidgetData:
    from datetime import timedelta

    user = await User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    ctx = get_user_timezone_context(user)
    start = ctx.now_utc()
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
    from datetime import timedelta

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


# ─── Routes ─────────────────────────────────────────────────────────────────────


@router.get("/", response_model=list[WidgetManifestSchema])
async def list_widgets() -> list[WidgetManifestSchema]:
    from apps.calendar.manifest import calendar_manifest
    return calendar_manifest.widgets


@router.get("/{widget_id}", response_model=CalendarWidgetDataResponse)
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
    kwargs = {}
    if widget_id == "calendar.month-view":
        kwargs["month_offset"] = month_offset
    return await handler(user_id, config, **kwargs)


@router.put("/{widget_id}/config", response_model=WidgetDataConfigSchema)
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


@router.get("/{widget_id}/options", response_model=list[ConfigFieldSchema])
async def get_widget_options(
    widget_id: str,
    user_id: str = Depends(get_current_user),
) -> list[ConfigFieldSchema]:
    widget = _get_widget_manifest(widget_id)
    return await _resolve_widget_options(user_id, widget)
