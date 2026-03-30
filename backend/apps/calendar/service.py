"""Calendar plugin business logic — NO FastAPI imports here."""

from typing import Optional

from .repository import calendar_service, CalendarRepository


class CalendarService:
    """All business logic. Calls repository only. No FastAPI/Depends."""

    def __init__(self) -> None:
        self.repo: CalendarRepository = calendar_service

    async def list(self, user_id: str, # TODO: add params) -> list[dict]:
        docs = await self.repo.find_by_user(user_id, # TODO: pass params)
        return [_calendar_to_dict(d) for d in docs]

    async def create(self, user_id: str, # TODO: add params) -> dict:
        # TODO: validation, e.g.: if not title.strip(): raise ValueError("title required")
        doc = await self.repo.create(user_id, # TODO: pass params)
        return _calendar_to_dict(doc)

    async def get(self, id_: str, user_id: str) -> dict | None:
        doc = await self.repo.find_by_id(id_, user_id)
        return _calendar_to_dict(doc) if doc else None

    async def update(self, id_: str, user_id: str, # TODO: add params) -> dict:
        doc = await self.repo.find_by_id(id_, user_id)
        if not doc:
            raise ValueError("Calendar not found")
        updated = await self.repo.update(doc, # TODO: pass params)
        return _calendar_to_dict(updated)

    async def delete(self, id_: str, user_id: str) -> dict:
        doc = await self.repo.find_by_id(id_, user_id)
        if not doc:
            raise ValueError("Calendar not found")
        await self.repo.delete(doc)
        return {"success": True, "id": id_}

    async def on_install(self, user_id: str) -> None:
        """Seed default data for a new user."""
        # TODO: e.g., await self.repo.create(user_id, title="Welcome!")

    async def on_uninstall(self, user_id: str) -> None:
        await self.repo.delete_all_by_user(user_id)


def _calendar_to_dict(d: Calendar) -> dict:
    """Convert document to plain dict for JSON serialization."""
    return {
        "id": str(d.id),
        # TODO: add all fields, e.g.:
        # "title": d.title,
        "created_at": d.created_at.isoformat(),
    }


# Singleton — imported by routes.py and tools.py
calendar_service = CalendarService()
