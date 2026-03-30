"""Habit plugin manifest — widget and app definitions."""

from shared.schemas import (
    AppManifestSchema,
    WidgetManifestSchema,
    ConfigFieldSchema,
)

habit_default_widget = WidgetManifestSchema(
    id="habit.default",
    name="Habit",
    description="TODO: describe this widget",
    icon="Habit",
    size="medium",
    config_fields=[],
)

habit_manifest = AppManifestSchema(
    id="habit",
    name="Habit",
    version="1.0.0",
    description="TODO: describe what this app does",
    icon="Habit",
    color="oklch(0.65 0.21 280)",
    widgets=[habit_default_widget],
    agent_description="TODO: describe what the AI agent can help with for this app",
    tools=["habit_list", "habit_create", "habit_delete"],
    models=["Habit"],
    category="other",
    tags=["habit"],
    author="Shin Team",
)
