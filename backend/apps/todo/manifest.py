"""Todo plugin manifest."""

from shared.schemas import (
    AppManifestSchema,
    ConfigFieldSchema,
    WidgetManifestSchema,
)

task_list_widget = WidgetManifestSchema(
    id="todo.task-list",
    name="Task List",
    description="Shows pending tasks grouped by priority",
    icon="CheckSquare",
    size="standard",
    config_fields=[
        ConfigFieldSchema(
            name="filter",
            label="Show",
            type="select",
            required=False,
            default="all",
            options=[
                {"label": "All tasks", "value": "all"},
                {"label": "Due today", "value": "today"},
                {"label": "High priority", "value": "high"},
            ],
        ),
    ],
)

today_widget = WidgetManifestSchema(
    id="todo.today",
    name="Today's Tasks",
    description="Tasks due today or overdue",
    icon="Calendar",
    size="compact",
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
    tools=[
        "todo_add_task",
        "todo_list_tasks",
        "todo_search_tasks",
        "todo_get_task",
        "todo_update_task",
        "todo_toggle_task",
        "todo_complete_task",
        "todo_archive_task",
        "todo_restore_task",
        "todo_delete_task",
        "todo_list_archived",
        "todo_get_summary",
        "todo_add_tag",
        "todo_remove_tag",
        "todo_add_subtask",
        "todo_complete_subtask",
        "todo_uncomplete_subtask",
        "todo_delete_subtask",
        "todo_create_recurring_task",
        "todo_list_recurring_tasks",
        "todo_stop_recurring_task",
    ],
    models=["Task", "SubTask", "RecurringRule"],
    category="productivity",
    tags=["tasks", "productivity", "reminders", "todo", "subtasks", "recurring"],
    author="Shin Team",
)
