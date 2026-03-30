"""Calendar plugin registration — auto-discovered at startup."""

from core.registry import register_plugin
from .manifest import calendar_manifest
from .agent import CalendarAgent
from .routes import router
from .models import Calendar

register_plugin(
    manifest=calendar_manifest,
    agent=CalendarAgent(),
    router=router,
    models=[Calendar],
)
