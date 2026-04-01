"""Todo plugin business logic."""

from datetime import datetime

from apps.todo.models import Task
from apps.todo.repository import TaskRepository


class TaskService:
    def __init__(self) -> None:
        self.repo = TaskRepository()

    async def list_tasks(
        self,
        user_id: str,
        status: str | None = None,
        priority: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        tasks = await self.repo.find_by_user(user_id, status, priority, limit)
        return [_task_to_dict(t) for t in tasks]

    async def create_task(
        self,
        user_id: str,
        title: str,
        description: str | None = None,
        due_date: datetime | None = None,
        priority: str = "medium",
    ) -> dict:
        if not title.strip():
            raise ValueError("Title cannot be empty")
        task = await self.repo.create(user_id, title, description, due_date, priority)
        return _task_to_dict(task)

    async def get_task(self, task_id: str, user_id: str) -> dict | None:
        """Get a single task by ID."""
        task = await self.repo.find_by_id(task_id, user_id)
        return _task_to_dict(task) if task else None

    async def toggle_task(self, task_id: str, user_id: str) -> dict:
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        new_status = "completed" if task.status == "pending" else "pending"
        updated = await self.repo.update(task, status=new_status)
        return _task_to_dict(updated)

    async def complete_task(self, task_id: str, user_id: str) -> dict:
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        if task.status == "completed":
            return _task_to_dict(task)
        updated = await self.repo.update(task, status="completed")
        return _task_to_dict(updated)

    async def get_summary(self, user_id: str) -> dict:
        today = datetime.utcnow()
        start_of_today = today.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_today = today.replace(hour=23, minute=59, second=59)

        all_tasks = await self.repo.find_by_user(user_id, limit=10000)
        pending = [t for t in all_tasks if t.status == "pending"]
        completed = [t for t in all_tasks if t.status == "completed"]
        overdue = [
            t for t in pending
            if t.due_date and t.due_date < today
        ]
        due_today = [
            t for t in pending
            if t.due_date and start_of_today <= t.due_date <= end_of_today
        ]
        return {
            "total": len(all_tasks),
            "pending": len(pending),
            "completed": len(completed),
            "overdue": len(overdue),
            "due_today": len(due_today),
        }

    async def update_task(
        self,
        task_id: str,
        user_id: str,
        title: str | None = None,
        description: str | None = None,
        due_date: datetime | None = None,
        priority: str | None = None,
        status: str | None = None,
    ) -> dict:
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        updated = await self.repo.update(task, title, description, due_date, priority, status)
        return _task_to_dict(updated)

    async def delete_task(self, task_id: str, user_id: str) -> dict:
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        await self.repo.delete(task)
        return {"success": True, "id": task_id}

    async def on_install(self, user_id: str) -> None:
        await self.repo.create(
            user_id,
            title="Welcome to To-Do!",
            description="Add your first task using chat or the widget.",
            priority="low",
        )

    async def on_uninstall(self, user_id: str) -> None:
        await self.repo.delete_all_by_user(user_id)


def _task_to_dict(t: Task) -> dict:
    return {
        "id": str(t.id),
        "title": t.title,
        "description": t.description,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "priority": t.priority,
        "status": t.status,
        "created_at": t.created_at.isoformat(),
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
    }


task_service = TaskService()
