"""Calendar plugin manifest."""

from shared.enums import ConfigFieldType, SubscriptionTier, WidgetSize
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
    size=WidgetSize.WIDE,
    config_fields=[
        ConfigFieldSchema(
            name="default_calendar",
            label="Default Calendar",
            type=ConfigFieldType.SELECT,
            required=False,
            options_source="calendar.calendars",
        ),
        ConfigFieldSchema(
            name="show_time_blocked_tasks",
            label="Show Scheduled Tasks",
            type=ConfigFieldType.BOOLEAN,
            default=True,
        ),
    ],
)

upcoming_widget = WidgetManifestSchema(
    id="calendar.upcoming",
    name="Upcoming Events",
    description="List of next 5-10 upcoming events",
    icon="Clock",
    size=WidgetSize.STANDARD,
    config_fields=[
        ConfigFieldSchema(
            name="max_items",
            label="Max Events",
            type=ConfigFieldType.NUMBER,
            default=5,
        ),
        ConfigFieldSchema(
            name="calendar_filter",
            label="Filter by Calendar",
            type=ConfigFieldType.SELECT,
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
    size=WidgetSize.COMPACT,
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
        # Event lifecycle - consolidated design
        "calendar_schedule_event",    # Create + auto conflict check
        "calendar_reschedule_event",  # Move to new time
        "calendar_edit_event",        # Edit metadata only
        "calendar_cancel_event",      # Delete/cancel
        "calendar_find_events",       # Search + list + get
        # Calendar management
        "calendar_list_calendars",
        # Recurring events
        "calendar_make_recurring",
        "calendar_stop_recurring",
        # Todo integration
        "calendar_block_task_time",
    ],
    models=["Event", "Calendar", "RecurringRule"],
    category="productivity",
    tags=["calendar", "events", "schedule", "time-blocking", "recurring"],
    author="Shin Team",
    requires_tier=SubscriptionTier.PAID,
)
