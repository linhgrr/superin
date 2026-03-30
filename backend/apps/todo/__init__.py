"""Todo plugin registration — auto-discovered at startup."""

from core.registry import register_plugin
from apps.todo.manifest import todo_manifest
from apps.todo.agent import TodoAgent
from apps.todo.routes import router
from apps.todo.models import Task

register_plugin(
    manifest=todo_manifest,
    agent=TodoAgent(),
    router=router,
    models=[Task],
)
