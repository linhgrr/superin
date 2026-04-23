"""Todo plugin manifest."""

from shared.enums import ConfigFieldType, WidgetSize
from shared.schemas import (
    AppManifestSchema,
    ConfigFieldSchema,
    SelectOption,
    WidgetManifestSchema,
)

task_list_widget = WidgetManifestSchema(
    id="todo.task-list",
    name="Task List",
    description="Shows pending tasks grouped by priority",
    icon="CheckSquare",
    size=WidgetSize.STANDARD,
    config_fields=[
        ConfigFieldSchema(
            name="filter",
            label="Show",
            type=ConfigFieldType.SELECT,
            required=False,
            default="all",
            options=[
                SelectOption(label="All tasks", value="all"),
                SelectOption(label="Due today", value="today"),
                SelectOption(label="High priority", value="high"),
            ],
        ),
    ],
)

today_widget = WidgetManifestSchema(
    id="todo.today",
    name="Today's Tasks",
    description="Tasks due today or overdue",
    icon="Calendar",
    size=WidgetSize.COMPACT,
    config_fields=[],
)

todo_manifest = AppManifestSchema(
    id="todo",
    name="To-Do",
    version="1.1.0",
    description="Manage tasks, subtasks, recurring tasks, tags, and reminders",
    icon="CheckSquare",
    color="oklch(0.70 0.18 145)",
    widgets=[task_list_widget, today_widget],
    agent_description="Helps users manage tasks, subtasks, recurring tasks, organize with tags, and track productivity.",
    models=["Task", "SubTask", "RecurringRule"],
    category="productivity",
    tags=["tasks", "productivity", "reminders", "todo", "subtasks", "recurring"],
    author="Superin Team",
)
