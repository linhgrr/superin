"""Todo plugin registration — auto-discovered at startup."""

from apps.todo.agent import TodoAgent
from apps.todo.manifest import todo_manifest
from apps.todo.models import RecurringRule, SubTask, Task
from apps.todo.routes import router
from core.registry import register_plugin

register_plugin(
    manifest=todo_manifest,
    agent=TodoAgent(),
    router=router,
    models=[Task, SubTask, RecurringRule],
)
