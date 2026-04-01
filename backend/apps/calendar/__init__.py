"""Calendar plugin registration — auto-discovered at startup."""

from apps.calendar.agent import CalendarAgent
from apps.calendar.manifest import calendar_manifest
from apps.calendar.models import Calendar, Event, RecurringRule
from apps.calendar.routes import router
from core.registry import register_plugin

register_plugin(
    manifest=calendar_manifest,
    agent_class=CalendarAgent,
    router=router,
    models=[Event, Calendar, RecurringRule],
)
