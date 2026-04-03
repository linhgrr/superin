"""Todo plugin business logic."""

from datetime import datetime
from typing import Literal

from apps.todo.models import RecurringRule, SubTask, Task
from apps.todo.repository import RecurringRuleRepository, SubTaskRepository, TaskRepository
from core.models import User
from core.timezone import get_user_timezone_context


class TaskService:
    def __init__(self) -> None:
        self.repo = TaskRepository()
        self.subtasks = SubTaskRepository()
        self.recurring = RecurringRuleRepository()

    # ─── Tasks ───────────────────────────────────────────────────────────────────

    async def list_tasks(
        self,
        user_id: str,
        status: str | None = None,
        priority: str | None = None,
        tag: str | None = None,
        include_archived: bool = False,
        limit: int = 20,
    ) -> list[dict]:
        tasks = await self.repo.find_by_user(user_id, status, priority, tag, include_archived, limit)
        return [_task_to_dict(t) for t in tasks]

    async def search_tasks(
        self,
        user_id: str,
        query: str,
        include_archived: bool = False,
        limit: int = 20,
    ) -> list[dict]:
        """Search tasks by title, description, or tags."""
        tasks = await self.repo.search(user_id, query, include_archived, limit)
        return [_task_to_dict(t) for t in tasks]

    async def create_task(
        self,
        user_id: str,
        title: str,
        description: str | None = None,
        due_date: datetime | None = None,
        due_time: datetime | None = None,
        priority: str = "medium",
        tags: list[str] | None = None,
        reminder_minutes: int | None = None,
    ) -> dict:
        if not title.strip():
            raise ValueError("Title cannot be empty")
        task = await self.repo.create(
            user_id, title, description, due_date, due_time, priority, tags, None, reminder_minutes
        )
        return _task_to_dict(task)

    async def get_task(self, task_id: str, user_id: str) -> dict | None:
        """Get a single task by ID."""
        task = await self.repo.find_by_id(task_id, user_id)
        return _task_to_dict(task) if task else None

    async def get_task_with_subtasks(self, task_id: str, user_id: str) -> dict | None:
        """Get task with its subtasks."""
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            return None

        result = _task_to_dict(task)
        subtasks = await self.subtasks.find_by_parent(task_id, user_id)
        result["subtasks"] = [_subtask_to_dict(st) for st in subtasks]
        result["subtask_progress"] = await self.subtasks.get_progress(task_id)
        return result

    async def update_task(
        self,
        task_id: str,
        user_id: str,
        title: str | None = None,
        description: str | None = None,
        due_date: datetime | None = None,
        due_time: datetime | None = None,
        priority: str | None = None,
        status: str | None = None,
        tags: list[str] | None = None,
        reminder_minutes: int | None = None,
    ) -> dict:
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        updated = await self.repo.update(task, title, description, due_date, due_time, priority, status, tags, reminder_minutes)
        return _task_to_dict(updated)

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

    # ─── Archive / Soft Delete ────────────────────────────────────────────────────

    async def archive_task(self, task_id: str, user_id: str) -> dict:
        """Archive (soft delete) a task."""
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        archived = await self.repo.archive(task)
        return _task_to_dict(archived)

    async def restore_task(self, task_id: str, user_id: str) -> dict:
        """Restore an archived task."""
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        restored = await self.repo.restore(task)
        return _task_to_dict(restored)

    async def list_archived(self, user_id: str, limit: int = 20) -> list[dict]:
        """List archived tasks."""
        tasks = await self.repo.find_archived(user_id, limit)
        return [_task_to_dict(t) for t in tasks]

    # ─── Tags ─────────────────────────────────────────────────────────────────────

    async def add_task_tag(self, task_id: str, user_id: str, tag: str) -> dict:
        """Add a tag to a task."""
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        updated = await self.repo.add_tag(task, tag)
        return _task_to_dict(updated)

    async def remove_task_tag(self, task_id: str, user_id: str, tag: str) -> dict:
        """Remove a tag from a task."""
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        updated = await self.repo.remove_tag(task, tag)
        return _task_to_dict(updated)

    # ─── Subtasks ────────────────────────────────────────────────────────────────

    async def add_subtask(self, task_id: str, user_id: str, title: str) -> dict:
        """Add a subtask to a parent task."""
        # Verify parent task exists
        parent = await self.repo.find_by_id(task_id, user_id)
        if not parent:
            raise ValueError("Parent task not found")

        subtask = await self.subtasks.create(user_id, task_id, title)
        return _subtask_to_dict(subtask)

    async def complete_subtask(self, subtask_id: str, user_id: str) -> dict:
        """Mark a subtask as completed."""
        subtask = await self.subtasks.find_by_id(subtask_id, user_id)
        if not subtask:
            raise ValueError("Subtask not found")
        completed = await self.subtasks.complete(subtask)
        return _subtask_to_dict(completed)

    async def uncomplete_subtask(self, subtask_id: str, user_id: str) -> dict:
        """Mark a subtask as not completed."""
        subtask = await self.subtasks.find_by_id(subtask_id, user_id)
        if not subtask:
            raise ValueError("Subtask not found")
        uncompleted = await self.subtasks.uncomplete(subtask)
        return _subtask_to_dict(uncompleted)

    async def delete_subtask(self, subtask_id: str, user_id: str) -> dict:
        """Delete a subtask."""
        subtask = await self.subtasks.find_by_id(subtask_id, user_id)
        if not subtask:
            raise ValueError("Subtask not found")
        await self.subtasks.delete(subtask)
        return {"success": True, "id": subtask_id}

    async def get_subtasks(self, task_id: str, user_id: str) -> list[dict]:
        """Get all subtasks for a task."""
        subtasks = await self.subtasks.find_by_parent(task_id, user_id)
        return [_subtask_to_dict(st) for st in subtasks]

    async def get_subtask_progress(self, task_id: str) -> dict:
        """Get completion progress for subtasks."""
        return await self.subtasks.get_progress(task_id)

    # ─── Recurring Tasks ─────────────────────────────────────────────────────────

    async def create_recurring_rule(
        self,
        user_id: str,
        task_template_id: str,
        frequency: Literal["daily", "weekly", "monthly", "yearly"],
        interval: int = 1,
        days_of_week: list[int] | None = None,
        end_date: datetime | None = None,
        max_occurrences: int | None = None,
    ) -> dict:
        """Create a recurring rule based on a task template."""
        # Verify task template exists
        template = await self.repo.find_by_id(task_template_id, user_id)
        if not template:
            raise ValueError("Task template not found")

        rule = await self.recurring.create(
            user_id, task_template_id, frequency, interval, days_of_week, end_date, max_occurrences
        )
        return _recurring_rule_to_dict(rule)

    async def list_recurring_rules(self, user_id: str) -> list[dict]:
        """List all recurring rules for a user."""
        rules = await self.recurring.find_by_user(user_id)
        return [_recurring_rule_to_dict(r) for r in rules]

    async def deactivate_recurring_rule(self, rule_id: str, user_id: str) -> dict:
        """Deactivate a recurring rule."""
        rule = await self.recurring.find_by_id(rule_id, user_id)
        if not rule:
            raise ValueError("Recurring rule not found")
        deactivated = await self.recurring.deactivate(rule)
        return _recurring_rule_to_dict(deactivated)

    async def delete_recurring_rule(self, rule_id: str, user_id: str) -> dict:
        """Delete a recurring rule."""
        rule = await self.recurring.find_by_id(rule_id, user_id)
        if not rule:
            raise ValueError("Recurring rule not found")
        await self.recurring.delete(rule)
        return {"success": True, "id": rule_id}

    # ─── Summary ─────────────────────────────────────────────────────────────────

    async def get_summary(self, user: User) -> dict:
        user_id = str(user.id)
        # Use user's timezone context
        ctx = get_user_timezone_context(user)
        today_range = ctx.today_range()
        now_utc = ctx.now_utc()

        all_tasks = await self.repo.find_by_user(user_id, limit=10000)
        pending = [t for t in all_tasks if t.status == "pending"]
        completed = [t for t in all_tasks if t.status == "completed"]

        now_naive = now_utc.replace(tzinfo=None)
        overdue = [
            t for t in pending
            if t.due_date and t.due_date < now_naive
        ]

        today_start_naive = today_range.start.replace(tzinfo=None)
        today_end_naive = today_range.end.replace(tzinfo=None)
        due_today = [
            t for t in pending
            if t.due_date and today_start_naive <= t.due_date <= today_end_naive
        ]

        # Tag summary
        all_tags = set()
        for t in all_tasks:
            all_tags.update(t.tags)

        return {
            "total": len(all_tasks),
            "pending": len(pending),
            "completed": len(completed),
            "overdue": len(overdue),
            "due_today": len(due_today),
            "archived": len([t for t in all_tasks if t.is_archived]),
            "total_tags": len(all_tags),
            "tag_list": sorted(list(all_tags)),
        }

    async def delete_task(self, task_id: str, user_id: str) -> dict:
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        # Also delete subtasks
        await self.subtasks.delete_all_by_parent(task_id)
        await self.repo.delete(task)
        return {"success": True, "id": task_id}

    async def on_install(self, user_id: str) -> None:
        existing_tasks = await self.repo.find_by_user(user_id, limit=1)
        if existing_tasks:
            return

        await self.repo.create(
            user_id,
            title="Welcome to To-Do!",
            description="Add your first task using chat or the widget.",
            priority="low",
        )

    async def on_uninstall(self, user_id: str) -> None:
        await self.repo.delete_all_by_user(user_id)


# ─── DTO helpers ───────────────────────────────────────────────────────────────

def _task_to_dict(t: Task) -> dict:
    return {
        "id": str(t.id),
        "title": t.title,
        "description": t.description,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "due_time": t.due_time.isoformat() if t.due_time else None,
        "reminder_minutes": t.reminder_minutes,
        "priority": t.priority,
        "status": t.status,
        "tags": t.tags,
        "is_archived": t.is_archived,
        "parent_task_id": str(t.parent_task_id) if t.parent_task_id else None,
        "created_at": t.created_at.isoformat(),
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
    }


def _subtask_to_dict(st: SubTask) -> dict:
    return {
        "id": str(st.id),
        "parent_task_id": str(st.parent_task_id),
        "title": st.title,
        "completed": st.completed,
        "created_at": st.created_at.isoformat(),
        "completed_at": st.completed_at.isoformat() if st.completed_at else None,
    }


def _recurring_rule_to_dict(r: RecurringRule) -> dict:
    return {
        "id": str(r.id),
        "task_template_id": str(r.task_template_id),
        "frequency": r.frequency,
        "interval": r.interval,
        "days_of_week": r.days_of_week,
        "end_date": r.end_date.isoformat() if r.end_date else None,
        "max_occurrences": r.max_occurrences,
        "occurrence_count": r.occurrence_count,
        "is_active": r.is_active,
        "last_generated_date": r.last_generated_date.isoformat() if r.last_generated_date else None,
        "created_at": r.created_at.isoformat(),
    }


# Singleton
task_service = TaskService()
