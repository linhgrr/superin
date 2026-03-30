"""Calendar plugin manifest — widget and app definitions."""

from shared.schemas import (
    AppManifestSchema,
    WidgetManifestSchema,
    ConfigFieldSchema,
)

calendar_default_widget = WidgetManifestSchema(
    id="calendar.default",
    name="Calendar",
    description="TODO: describe this widget",
    icon="Calendar",
    size="medium",
    config_fields=[],
)

calendar_manifest = AppManifestSchema(
    id="calendar",
    name="Calendar",
    version="1.0.0",
    description="TODO: describe what this app does",
    icon="Calendar",
    color="oklch(0.65 0.21 280)",
    widgets=[calendar_default_widget],
    agent_description="TODO: describe what the AI agent can help with for this app",
    tools=["calendar_list", "calendar_create", "calendar_delete"],
    models=["Calendar"],
    category="other",
    tags=["calendar"],
    author="Shin Team",
)
