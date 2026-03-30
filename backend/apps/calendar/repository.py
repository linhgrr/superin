"""Calendar plugin data access layer — Beanie queries only, no business logic."""

from datetime import datetime
from typing import Optional, Literal

from beanie import PydanticObjectId

from .models import Calendar


class CalendarRepository:
    """All DB queries for Calendar. Filter by user_id on EVERY query (Rule R2)."""

    async def find_by_user(
        self,
        user_id: str,
        # TODO: add filter params, e.g.: status: Optional[str] = None,
        limit: int = 20,
    ) -> list[Calendar]:
        query = Calendar.user_id == PydanticObjectId(user_id)
        # TODO: add filter conditions, e.g.:
        # if status:
        #     query = query and Calendar.status == status
        return (
            await Calendar.find(query)
            .sort("-created_at")
            .limit(limit)
            .to_list()
        )

    async def find_by_id(self, id_: str, user_id: str) -> Calendar | None:
        return await Calendar.find_one(
            Calendar.id == PydanticObjectId(id_),
            Calendar.user_id == PydanticObjectId(user_id),
        )

    async def create(self, user_id: str, # TODO: add params) -> Calendar:
        doc = Calendar(
            user_id=PydanticObjectId(user_id),
            # TODO: assign your fields, e.g.:
            # title=title,
        )
        await doc.insert()
        return doc

    async def update(self, doc: Calendar, # TODO: add params) -> Calendar:
        # TODO: set fields on doc, then await doc.save()
        await doc.save()
        return doc

    async def delete(self, doc: Calendar) -> None:
        await doc.delete()

    async def delete_all_by_user(self, user_id: str) -> None:
        await Calendar.find(Calendar.user_id == PydanticObjectId(user_id)).delete()


calendar_service = CalendarRepository()
