"""Todo plugin registration — auto-discovered at startup."""

from apps.todo.agent import TodoAgent
from apps.todo.manifest import todo_manifest
from apps.todo.models import RecurringRule, SubTask, Task
from apps.todo.routes import get_task_list_widget_data, get_today_widget_data, router
from apps.todo.schemas import TaskListWidgetConfig, TodayWidgetConfig
from core.registry import (
    register_plugin,
    register_widget_config_model,
    register_widget_data_handler,
)

register_plugin(
    manifest=todo_manifest,
    agent=TodoAgent(),
    router=router,
    models=[Task, SubTask, RecurringRule],
)

register_widget_config_model("todo.task-list", TaskListWidgetConfig)
register_widget_config_model("todo.today", TodayWidgetConfig)

register_widget_data_handler("todo.task-list", get_task_list_widget_data)
register_widget_data_handler("todo.today", get_today_widget_data)
