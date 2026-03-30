"""Habit plugin registration — auto-discovered at startup."""

from core.registry import register_plugin
from .manifest import habit_manifest
from .agent import HabitAgent
from .routes import router
from .models import Habit

register_plugin(
    manifest=habit_manifest,
    agent=HabitAgent(),
    router=router,
    models=[Habit],
)
