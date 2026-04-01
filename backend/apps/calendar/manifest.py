"""Calendar plugin manifest."""

from shared.schemas import (
    AppManifestSchema,
    ConfigFieldSchema,
    WidgetManifestSchema,
)

month_view_widget = WidgetManifestSchema(
    id="calendar.month-view",
    name="Month View",
    description="Full month calendar grid with events",
    icon="Calendar",
    size="wide",
    config_fields=[
        ConfigFieldSchema(
            name="default_calendar",
            label="Default Calendar",
            type="select",
            required=False,
            options_source="calendar.calendars",
        ),
        ConfigFieldSchema(
            name="show_time_blocked_tasks",
            label="Show Scheduled Tasks",
            type="boolean",
            default=True,
        ),
    ],
)

upcoming_widget = WidgetManifestSchema(
    id="calendar.upcoming",
    name="Upcoming Events",
    description="List of next 5-10 upcoming events",
    icon="Clock",
    size="standard",
    config_fields=[
        ConfigFieldSchema(
            name="max_items",
            label="Max Events",
            type="number",
            default=5,
        ),
        ConfigFieldSchema(
            name="calendar_filter",
            label="Filter by Calendar",
            type="select",
            required=False,
            options_source="calendar.calendars",
        ),
    ],
)

day_summary_widget = WidgetManifestSchema(
    id="calendar.day-summary",
    name="Day Summary",
    description="Today and tomorrow overview",
    icon="Sun",
    size="compact",
    config_fields=[],
)

calendar_manifest = AppManifestSchema(
    id="calendar",
    name="Calendar",
    version="1.0.0",
    description="Manage events, schedule time, and organize your calendar with Todo integration",
    icon="Calendar",
    color="oklch(0.70 0.18 250)",  # Blue-ish
    widgets=[month_view_widget, upcoming_widget, day_summary_widget],
    agent_description="Helps users create events, check availability, schedule recurring events, and time-block Todo tasks.",
    tools=[
        "calendar_list_events",
        "calendar_search_events",
        "calendar_get_event",
        "calendar_create_event",
        "calendar_update_event",
        "calendar_delete_event",
        "calendar_check_conflicts",
        "calendar_list_calendars",
        "calendar_create_recurring",
        "calendar_stop_recurring",
        "calendar_schedule_task",
    ],
    models=["Event", "Calendar", "RecurringRule"],
    category="productivity",
    tags=["calendar", "events", "schedule", "time-blocking", "recurring"],
    author="Shin Team",
)
