"""Calendar plugin registration — auto-discovered at startup."""

from apps.calendar.agent import CalendarAgent
from apps.calendar.manifest import calendar_manifest
from apps.calendar.models import Calendar, Event, RecurringRule
from apps.calendar.routes import (
    get_day_summary_widget_data,
    get_month_view_widget_data,
    get_upcoming_widget_data,
    router,
)
from apps.calendar.schemas import (
    DaySummaryWidgetConfig,
    MonthViewWidgetConfig,
    UpcomingWidgetConfig,
)
from core.registry import (
    register_plugin,
    register_widget_config_model,
    register_widget_data_handler,
)

register_plugin(
    manifest=calendar_manifest,
    agent=CalendarAgent(),
    router=router,
    models=[Event, Calendar, RecurringRule],
)

register_widget_config_model("calendar.month-view", MonthViewWidgetConfig)
register_widget_config_model("calendar.upcoming", UpcomingWidgetConfig)
register_widget_config_model("calendar.day-summary", DaySummaryWidgetConfig)

register_widget_data_handler("calendar.month-view", get_month_view_widget_data)
register_widget_data_handler("calendar.upcoming", get_upcoming_widget_data)
register_widget_data_handler("calendar.day-summary", get_day_summary_widget_data)
