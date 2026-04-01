"""Todo plugin data access layer."""

from datetime import datetime
from typing import Literal

from beanie import PydanticObjectId

from apps.todo.models import RecurringRule, SubTask, Task


class TaskRepository:
    async def find_by_user(
        self,
        user_id: str,
        status: Literal["pending", "completed"] | None = None,
        priority: Literal["low", "medium", "high"] | None = None,
        tag: str | None = None,
        include_archived: bool = False,
        limit: int = 20,
    ) -> list[Task]:
        # Build conditions as separate arguments for Beanie
        conditions: list = [
            Task.user_id == PydanticObjectId(user_id),
        ]

        if not include_archived:
            conditions.append(Task.is_archived == False)  # noqa: E712

        if status:
            conditions.append(Task.status == status)
        if priority:
            conditions.append(Task.priority == priority)
        if tag:
            conditions.append(tag in Task.tags)

        return (
            await Task.find(*conditions)
            .sort("-created_at")
            .limit(limit)
            .to_list()
        )

    async def search(
        self,
        user_id: str,
        query: str,
        include_archived: bool = False,
        limit: int = 20,
    ) -> list[Task]:
        """Search tasks by title or description."""
        search_lower = query.lower()

        # Get all non-archived tasks for the user
        conditions = [Task.user_id == PydanticObjectId(user_id)]
        if not include_archived:
            conditions.append(Task.is_archived == False)  # noqa: E712

        all_tasks = await Task.find(*conditions).to_list()

        # Filter by search term
        filtered = [
            t for t in all_tasks
            if search_lower in t.title.lower()
            or (t.description and search_lower in t.description.lower())
            or any(search_lower in tag.lower() for tag in t.tags)
        ]

        return filtered[:limit]

    async def find_by_id(self, task_id: str, user_id: str) -> Task | None:
        return await Task.find_one(
            Task.id == PydanticObjectId(task_id),
            Task.user_id == PydanticObjectId(user_id),
        )

    async def find_archived(self, user_id: str, limit: int = 20) -> list[Task]:
        """Find archived tasks."""
        return await Task.find(
            Task.user_id == PydanticObjectId(user_id),
            Task.is_archived == True,  # noqa: E712
        ).sort("-created_at").limit(limit).to_list()

    async def create(
        self,
        user_id: str,
        title: str,
        description: str | None = None,
        due_date: datetime | None = None,
        due_time: datetime | None = None,
        priority: str = "medium",
        tags: list[str] | None = None,
        parent_task_id: str | None = None,
        reminder_minutes: int | None = None,
    ) -> Task:
        task = Task(
            user_id=PydanticObjectId(user_id),
            title=title,
            description=description,
            due_date=due_date,
            due_time=due_time.time() if due_time else None,
            priority=priority,  # type: ignore[arg-type]
            tags=tags or [],
            parent_task_id=PydanticObjectId(parent_task_id) if parent_task_id else None,
            reminder_minutes=reminder_minutes,
        )
        await task.insert()
        return task

    async def update(
        self,
        task: Task,
        title: str | None = None,
        description: str | None = None,
        due_date: datetime | None = None,
        due_time: datetime | None = None,
        priority: str | None = None,
        status: str | None = None,
        tags: list[str] | None = None,
        reminder_minutes: int | None = None,
    ) -> Task:
        if title is not None:
            task.title = title
        if description is not None:
            task.description = description
        if due_date is not None:
            task.due_date = due_date
        if due_time is not None:
            task.due_time = due_time.time() if due_time else None
        if priority is not None:
            task.priority = priority  # type: ignore[assignment]
        if status is not None:
            task.status = status  # type: ignore[assignment]
            if status == "completed":
                task.completed_at = datetime.utcnow()
            else:
                task.completed_at = None
        if tags is not None:
            task.tags = tags
        if reminder_minutes is not None:
            task.reminder_minutes = reminder_minutes
        await task.save()
        return task

    async def archive(self, task: Task) -> Task:
        """Soft delete/archive a task."""
        task.is_archived = True
        await task.save()
        return task

    async def restore(self, task: Task) -> Task:
        """Restore an archived task."""
        task.is_archived = False
        await task.save()
        return task

    async def add_tag(self, task: Task, tag: str) -> Task:
        """Add a tag to task if not exists."""
        if tag not in task.tags:
            task.tags.append(tag)
            await task.save()
        return task

    async def remove_tag(self, task: Task, tag: str) -> Task:
        """Remove a tag from task."""
        if tag in task.tags:
            task.tags.remove(tag)
            await task.save()
        return task

    async def delete(self, task: Task) -> None:
        await task.delete()

    async def delete_all_by_user(self, user_id: str) -> int:
        count = 0
        async for t in Task.find(Task.user_id == PydanticObjectId(user_id)):
            await t.delete()
            count += 1
        return count


class SubTaskRepository:
    async def find_by_parent(self, parent_task_id: str, user_id: str) -> list[SubTask]:
        """Get all subtasks for a parent task."""
        return await SubTask.find(
            SubTask.parent_task_id == PydanticObjectId(parent_task_id),
            SubTask.user_id == PydanticObjectId(user_id),
        ).sort("created_at").to_list()

    async def find_by_id(self, subtask_id: str, user_id: str) -> SubTask | None:
        return await SubTask.find_one(
            SubTask.id == PydanticObjectId(subtask_id),
            SubTask.user_id == PydanticObjectId(user_id),
        )

    async def create(
        self,
        user_id: str,
        parent_task_id: str,
        title: str,
    ) -> SubTask:
        subtask = SubTask(
            user_id=PydanticObjectId(user_id),
            parent_task_id=PydanticObjectId(parent_task_id),
            title=title,
        )
        await subtask.insert()
        return subtask

    async def complete(self, subtask: SubTask) -> SubTask:
        """Mark subtask as completed."""
        subtask.completed = True
        subtask.completed_at = datetime.utcnow()
        await subtask.save()
        return subtask

    async def uncomplete(self, subtask: SubTask) -> SubTask:
        """Mark subtask as not completed."""
        subtask.completed = False
        subtask.completed_at = None
        await subtask.save()
        return subtask

    async def delete(self, subtask: SubTask) -> None:
        await subtask.delete()

    async def delete_all_by_parent(self, parent_task_id: str) -> int:
        """Delete all subtasks for a parent task."""
        count = 0
        async for st in SubTask.find(SubTask.parent_task_id == PydanticObjectId(parent_task_id)):
            await st.delete()
            count += 1
        return count

    async def get_progress(self, parent_task_id: str) -> dict:
        """Get completion progress for a task's subtasks."""
        subtasks = await SubTask.find(
            SubTask.parent_task_id == PydanticObjectId(parent_task_id),
        ).to_list()

        if not subtasks:
            return {"total": 0, "completed": 0, "percentage": 0}

        total = len(subtasks)
        completed = sum(1 for st in subtasks if st.completed)
        percentage = round((completed / total) * 100)

        return {"total": total, "completed": completed, "percentage": percentage}


class RecurringRuleRepository:
    async def find_by_user(self, user_id: str) -> list[RecurringRule]:
        return await RecurringRule.find(
            RecurringRule.user_id == PydanticObjectId(user_id),
        ).to_list()

    async def find_by_id(self, rule_id: str, user_id: str) -> RecurringRule | None:
        return await RecurringRule.find_one(
            RecurringRule.id == PydanticObjectId(rule_id),
            RecurringRule.user_id == PydanticObjectId(user_id),
        )

    async def create(
        self,
        user_id: str,
        task_template_id: str,
        frequency: Literal["daily", "weekly", "monthly", "yearly"],
        interval: int = 1,
        days_of_week: list[int] | None = None,
        end_date: datetime | None = None,
        max_occurrences: int | None = None,
    ) -> RecurringRule:
        rule = RecurringRule(
            user_id=PydanticObjectId(user_id),
            task_template_id=PydanticObjectId(task_template_id),
            frequency=frequency,
            interval=interval,
            days_of_week=days_of_week,
            end_date=end_date,
            max_occurrences=max_occurrences,
        )
        await rule.insert()
        return rule

    async def update_occurrence(self, rule: RecurringRule) -> RecurringRule:
        """Increment occurrence count and update last generated date."""
        rule.occurrence_count += 1
        rule.last_generated_date = datetime.utcnow()
        await rule.save()
        return rule

    async def deactivate(self, rule: RecurringRule) -> RecurringRule:
        rule.is_active = False
        await rule.save()
        return rule

    async def delete(self, rule: RecurringRule) -> None:
        await rule.delete()
