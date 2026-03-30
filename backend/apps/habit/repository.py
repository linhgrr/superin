"""Habit plugin data access layer — Beanie queries only, no business logic."""

from datetime import datetime
from typing import Optional, Literal

from beanie import PydanticObjectId

from .models import Habit


class HabitRepository:
    """All DB queries for Habit. Filter by user_id on EVERY query (Rule R2)."""

    async def find_by_user(
        self,
        user_id: str,
        # TODO: add filter params, e.g.: status: Optional[str] = None,
        limit: int = 20,
    ) -> list[Habit]:
        query = Habit.user_id == PydanticObjectId(user_id)
        # TODO: add filter conditions, e.g.:
        # if status:
        #     query = query and Habit.status == status
        return (
            await Habit.find(query)
            .sort("-created_at")
            .limit(limit)
            .to_list()
        )

    async def find_by_id(self, id_: str, user_id: str) -> Habit | None:
        return await Habit.find_one(
            Habit.id == PydanticObjectId(id_),
            Habit.user_id == PydanticObjectId(user_id),
        )

    async def create(self, user_id: str, # TODO: add params) -> Habit:
        doc = Habit(
            user_id=PydanticObjectId(user_id),
            # TODO: assign your fields, e.g.:
            # title=title,
        )
        await doc.insert()
        return doc

    async def update(self, doc: Habit, # TODO: add params) -> Habit:
        # TODO: set fields on doc, then await doc.save()
        await doc.save()
        return doc

    async def delete(self, doc: Habit) -> None:
        await doc.delete()

    async def delete_all_by_user(self, user_id: str) -> None:
        await Habit.find(Habit.user_id == PydanticObjectId(user_id)).delete()


habit_service = HabitRepository()
