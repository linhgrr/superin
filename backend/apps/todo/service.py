"""Todo plugin business logic."""

from datetime import date, datetime, time

from motor.motor_asyncio import AsyncIOMotorClientSession

from apps.todo.enums import RecurrenceFrequency, TaskPriority, TaskStatus
from apps.todo.mappers import recurring_rule_to_read, subtask_to_read, task_to_read
from apps.todo.models import Task
from apps.todo.repository import RecurringRuleRepository, SubTaskRepository, TaskRepository
from apps.todo.schemas import (
    TodoActionResponse,
    TodoActivitySummaryResponse,
    TodoRecurringRuleRead,
    TodoSubTaskProgress,
    TodoSubTaskRead,
    TodoSummaryResponse,
    TodoTaskDetailRead,
    TodoTaskRead,
)
from core.models import User
from core.utils.timezone import get_user_timezone_context


class TaskService:
    def __init__(self) -> None:
        self.repo = TaskRepository()
        self.subtasks = SubTaskRepository()
        self.recurring = RecurringRuleRepository()

    # ─── Tasks ───────────────────────────────────────────────────────────────────

    async def list_tasks(
        self,
        user_id: str,
        status: TaskStatus | None = None,
        priority: TaskPriority | None = None,
        tag: str | None = None,
        include_archived: bool = False,
        limit: int = 20,
    ) -> list[TodoTaskRead]:
        tasks = await self.repo.find_by_user(user_id, status, priority, tag, include_archived, limit)
        return [task_to_read(t) for t in tasks]

    async def search_tasks(
        self,
        user_id: str,
        query: str,
        include_archived: bool = False,
        limit: int = 20,
    ) -> list[TodoTaskRead]:
        """Search tasks by title, description, or tags."""
        tasks = await self.repo.search(user_id, query, include_archived, limit)
        return [task_to_read(t) for t in tasks]

    async def create_task(
        self,
        user_id: str,
        title: str,
        description: str | None = None,
        due_date: date | None = None,
        due_time: time | None = None,
        priority: TaskPriority = "medium",
        tags: list[str] | None = None,
        reminder_minutes: int | None = None,
    ) -> TodoTaskRead:
        if not title.strip():
            raise ValueError("Title cannot be empty")
        task = await self.repo.create(
            user_id, title, description, due_date, due_time, priority, tags, None, reminder_minutes
        )
        return task_to_read(task)

    async def get_task(self, task_id: str, user_id: str) -> TodoTaskRead | None:
        """Get a single task by ID."""
        task = await self.repo.find_by_id(task_id, user_id)
        return task_to_read(task) if task else None

    async def get_tasks(self, ids: list[str], user_id: str) -> list[Task]:
        """Fetch multiple tasks by their IDs, scoped to a user."""
        if not ids:
            return []
        from beanie import PydanticObjectId

        tasks = await Task.find(
            {
                "_id": {"$in": [PydanticObjectId(tid) for tid in ids]},
                "user_id": PydanticObjectId(user_id),
            }
        ).to_list()
        return tasks

    async def get_task_with_subtasks(self, task_id: str, user_id: str) -> TodoTaskDetailRead | None:
        """Get task with its subtasks."""
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            return None

        task_read = task_to_read(task)
        subtasks = await self.subtasks.find_by_parent(task_id, user_id)
        progress = await self.subtasks.get_progress(task_id)
        return TodoTaskDetailRead(
            **task_read.model_dump(),
            subtasks=[subtask_to_read(st) for st in subtasks],
            subtask_progress=TodoSubTaskProgress.model_validate(progress),
        )

    async def update_task(
        self,
        task_id: str,
        user_id: str,
        title: str | None = None,
        description: str | None = None,
        due_date: date | None = None,
        due_time: time | None = None,
        priority: TaskPriority | None = None,
        status: TaskStatus | None = None,
        tags: list[str] | None = None,
        reminder_minutes: int | None = None,
    ) -> TodoTaskRead:
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        updated = await self.repo.update(task, title, description, due_date, due_time, priority, status, tags, reminder_minutes)
        return task_to_read(updated)

    async def toggle_task(self, task_id: str, user_id: str) -> TodoTaskRead:
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        new_status: TaskStatus = "completed" if task.status == "pending" else "pending"
        updated = await self.repo.update(task, status=new_status)
        return task_to_read(updated)

    async def complete_task(self, task_id: str, user_id: str) -> TodoTaskRead:
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        if task.status == "completed":
            return task_to_read(task)
        updated = await self.repo.update(task, status="completed")
        return task_to_read(updated)

    # ─── Archive / Soft Delete ────────────────────────────────────────────────────

    async def archive_task(self, task_id: str, user_id: str) -> TodoTaskRead:
        """Archive (soft delete) a task."""
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        archived = await self.repo.archive(task)
        return task_to_read(archived)

    async def restore_task(self, task_id: str, user_id: str) -> TodoTaskRead:
        """Restore an archived task."""
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        restored = await self.repo.restore(task)
        return task_to_read(restored)

    async def list_archived(self, user_id: str, limit: int = 20) -> list[TodoTaskRead]:
        """List archived tasks."""
        tasks = await self.repo.find_archived(user_id, limit)
        return [task_to_read(t) for t in tasks]

    # ─── Tags ─────────────────────────────────────────────────────────────────────

    async def add_task_tag(self, task_id: str, user_id: str, tag: str) -> TodoTaskRead:
        """Add a tag to a task."""
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        updated = await self.repo.add_tag(task, tag)
        return task_to_read(updated)

    async def remove_task_tag(self, task_id: str, user_id: str, tag: str) -> TodoTaskRead:
        """Remove a tag from a task."""
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        updated = await self.repo.remove_tag(task, tag)
        return task_to_read(updated)

    # ─── Subtasks ────────────────────────────────────────────────────────────────

    async def add_subtask(self, task_id: str, user_id: str, title: str) -> TodoSubTaskRead:
        """Add a subtask to a parent task."""
        # Verify parent task exists
        parent = await self.repo.find_by_id(task_id, user_id)
        if not parent:
            raise ValueError("Parent task not found")

        subtask = await self.subtasks.create(user_id, task_id, title)
        return subtask_to_read(subtask)

    async def complete_subtask(self, subtask_id: str, user_id: str) -> TodoSubTaskRead:
        """Mark a subtask as completed."""
        subtask = await self.subtasks.find_by_id(subtask_id, user_id)
        if not subtask:
            raise ValueError("Subtask not found")
        completed = await self.subtasks.complete(subtask)
        return subtask_to_read(completed)

    async def uncomplete_subtask(self, subtask_id: str, user_id: str) -> TodoSubTaskRead:
        """Mark a subtask as not completed."""
        subtask = await self.subtasks.find_by_id(subtask_id, user_id)
        if not subtask:
            raise ValueError("Subtask not found")
        uncompleted = await self.subtasks.uncomplete(subtask)
        return subtask_to_read(uncompleted)

    async def delete_subtask(self, subtask_id: str, user_id: str) -> TodoActionResponse:
        """Delete a subtask."""
        subtask = await self.subtasks.find_by_id(subtask_id, user_id)
        if not subtask:
            raise ValueError("Subtask not found")
        await self.subtasks.delete(subtask)
        return TodoActionResponse(success=True, id=subtask_id)

    async def get_subtasks(self, task_id: str, user_id: str) -> list[TodoSubTaskRead]:
        """Get all subtasks for a task."""
        subtasks = await self.subtasks.find_by_parent(task_id, user_id)
        return [subtask_to_read(st) for st in subtasks]

    async def get_subtask_progress(self, task_id: str) -> TodoSubTaskProgress:
        """Get completion progress for subtasks."""
        return TodoSubTaskProgress.model_validate(await self.subtasks.get_progress(task_id))

    # ─── Recurring Tasks ─────────────────────────────────────────────────────────

    async def create_recurring_rule(
        self,
        user_id: str,
        task_template_id: str,
        frequency: RecurrenceFrequency,
        interval: int = 1,
        days_of_week: list[int] | None = None,
        end_date: date | None = None,
        max_occurrences: int | None = None,
    ) -> TodoRecurringRuleRead:
        """Create a recurring rule based on a task template."""
        # Verify task template exists
        template = await self.repo.find_by_id(task_template_id, user_id)
        if not template:
            raise ValueError("Task template not found")

        rule = await self.recurring.create(
            user_id, task_template_id, frequency, interval, days_of_week, end_date, max_occurrences
        )
        return recurring_rule_to_read(rule)

    async def list_recurring_rules(self, user_id: str) -> list[TodoRecurringRuleRead]:
        """List all recurring rules for a user."""
        rules = await self.recurring.find_by_user(user_id)
        return [recurring_rule_to_read(r) for r in rules]

    async def deactivate_recurring_rule(self, rule_id: str, user_id: str) -> TodoRecurringRuleRead:
        """Deactivate a recurring rule."""
        rule = await self.recurring.find_by_id(rule_id, user_id)
        if not rule:
            raise ValueError("Recurring rule not found")
        deactivated = await self.recurring.deactivate(rule)
        return recurring_rule_to_read(deactivated)

    async def delete_recurring_rule(self, rule_id: str, user_id: str) -> TodoActionResponse:
        """Delete a recurring rule."""
        rule = await self.recurring.find_by_id(rule_id, user_id)
        if not rule:
            raise ValueError("Recurring rule not found")
        await self.recurring.delete(rule)
        return TodoActionResponse(success=True, id=rule_id)

    # ─── Summary ─────────────────────────────────────────────────────────────────

    async def get_summary(self, user: User) -> TodoSummaryResponse:
        user_id = str(user.id)
        ctx = get_user_timezone_context(user)
        tasks = await self.repo.find_by_user(user_id, include_archived=True, limit=None)
        today_local = ctx.now_local().date()

        total = len(tasks)
        pending = 0
        completed = 0
        overdue = 0
        due_today = 0
        archived = 0
        tags: set[str] = set()

        for task in tasks:
            if task.is_archived:
                archived += 1
                continue

            tags.update(task.tags)

            if task.status == "pending":
                pending += 1
                if task.due_date is not None:
                    if task.due_date < today_local:
                        overdue += 1
                    elif task.due_date == today_local:
                        due_today += 1
            elif task.status == "completed":
                completed += 1

        tag_list = sorted(tags)

        return TodoSummaryResponse(
            total=total,
            pending=pending,
            completed=completed,
            overdue=overdue,
            due_today=due_today,
            archived=archived,
            total_tags=len(tag_list),
            tag_list=tag_list,
        )

    async def summarize_activity(
        self,
        user_id: str,
        start: datetime,
        end: datetime,
        *,
        limit: int = 10,
    ) -> TodoActivitySummaryResponse:
        created_tasks = await self.repo.find_created_between(user_id, start, end, limit=None)
        completed_tasks = await self.repo.find_completed_between(user_id, start, end, limit=None)

        return TodoActivitySummaryResponse(
            start_datetime=start,
            end_datetime=end,
            created_count=len(created_tasks),
            completed_count=len(completed_tasks),
            created_tasks=[task_to_read(task) for task in created_tasks[:limit]],
            completed_tasks=[task_to_read(task) for task in completed_tasks[:limit]],
            unsupported_activity=[
                "task_updates_not_tracked",
                "task_deletions_not_tracked",
                "task_archivals_not_tracked",
            ],
        )

    async def delete_task(self, task_id: str, user_id: str) -> TodoActionResponse:
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            raise ValueError("Task not found")
        # Also delete subtasks
        await self.subtasks.delete_all_by_parent(task_id)
        await self.repo.delete(task)
        return TodoActionResponse(success=True, id=task_id)

    async def on_install(self, user_id: str, session: AsyncIOMotorClientSession | None = None) -> None:
        existing_tasks = await self.repo.find_by_user(user_id, limit=1, session=session)
        if existing_tasks:
            return

        await self.repo.create(
            user_id,
            title="Welcome to To-Do!",
            description="Add your first task using chat or the widget.",
            priority="low",
            session=session,
        )

    async def on_uninstall(self, user_id: str, session: AsyncIOMotorClientSession | None = None) -> None:
        await self.repo.delete_all_by_user(user_id, session=session)

# Singleton
task_service = TaskService()
