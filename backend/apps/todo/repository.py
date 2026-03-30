"""Todo plugin data access layer."""

from datetime import datetime
from typing import Literal, Optional

from beanie import PydanticObjectId

from apps.todo.models import Task


class TaskRepository:
    async def find_by_user(
        self,
        user_id: str,
        status: Optional[Literal["pending", "completed"]] = None,
        priority: Optional[Literal["low", "medium", "high"]] = None,
        limit: int = 20,
    ) -> list[Task]:
        query = Task.user_id == PydanticObjectId(user_id)
        if status:
            query = query and Task.status == status
        if priority:
            query = query and Task.priority == priority
        return (
            await Task.find(query)
            .sort("-created_at")
            .limit(limit)
            .to_list()
        )

    async def find_by_id(self, task_id: str, user_id: str) -> Task | None:
        return await Task.find_one(
            Task.id == PydanticObjectId(task_id),
            Task.user_id == PydanticObjectId(user_id),
        )

    async def create(
        self,
        user_id: str,
        title: str,
        description: str | None = None,
        due_date: datetime | None = None,
        priority: str = "medium",
    ) -> Task:
        task = Task(
            user_id=PydanticObjectId(user_id),
            title=title,
            description=description,
            due_date=due_date,
            priority=priority,  # type: ignore[arg-type]
        )
        await task.insert()
        return task

    async def update(
        self,
        task: Task,
        title: str | None = None,
        description: str | None = None,
        due_date: datetime | None = None,
        priority: str | None = None,
        status: str | None = None,
    ) -> Task:
        if title is not None:
            task.title = title
        if description is not None:
            task.description = description
        if due_date is not None:
            task.due_date = due_date
        if priority is not None:
            task.priority = priority  # type: ignore[assignment]
        if status is not None:
            task.status = status  # type: ignore[assignment]
            if status == "completed":
                task.completed_at = datetime.utcnow()
            else:
                task.completed_at = None
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
