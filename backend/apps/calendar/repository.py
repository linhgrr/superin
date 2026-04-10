"""Calendar plugin data access layer."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from beanie import PydanticObjectId
from pymongo.asynchronous.client_session import AsyncClientSession

from apps.calendar.enums import EventType, RecurrenceFrequency
from apps.calendar.models import Calendar, Event, RecurringRule
from core.db import get_db
from shared.normalization import normalize_name_key, to_naive_datetime

# Default color for new calendars
DEFAULT_CALENDAR_COLOR = "oklch(0.70 0.18 250)"  # Blue-ish

@asynccontextmanager
async def calendar_transaction() -> AsyncIterator[AsyncClientSession]:
    """Yield a Mongo session with an active transaction for calendar mutations."""
    async with get_db().client.start_session() as session:
        async with await session.start_transaction():
            yield session


class EventRepository:
    async def find_by_user(
        self,
        user_id: str,
        start: datetime | None = None,
        end: datetime | None = None,
        calendar_id: str | None = None,
        limit: int = 100,
        *,
        session: AsyncClientSession | None = None,
    ) -> list[Event]:
        """List events with time range filter."""
        conditions = [Event.user_id == PydanticObjectId(user_id)]

        if calendar_id:
            conditions.append(Event.calendar_id == PydanticObjectId(calendar_id))

        start_naive = to_naive_datetime(start)
        end_naive = to_naive_datetime(end)

        if start_naive and end_naive:
            conditions.append(Event.start_datetime < end_naive)
            conditions.append(Event.end_datetime > start_naive)
        elif start_naive:
            conditions.append(Event.end_datetime > start_naive)
        elif end_naive:
            conditions.append(Event.start_datetime < end_naive)

        return (
            await Event.find(*conditions, session=session)
            .sort("start_datetime")
            .limit(limit)
            .to_list()
        )

    async def find_by_id(
        self,
        event_id: str,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> Event | None:
        return await Event.find_one(
            Event.id == PydanticObjectId(event_id),
            Event.user_id == PydanticObjectId(user_id),
            session=session,
        )

    async def search(
        self,
        user_id: str,
        query: str,
        limit: int = 20,
        *,
        session: AsyncClientSession | None = None,
    ) -> list[Event]:
        """Search events by title, description, or location using MongoDB $regex."""
        return await Event.find(
            Event.user_id == PydanticObjectId(user_id),
            {
                "$or": [
                    {"title": {"$regex": query, "$options": "i"}},
                    {"description": {"$regex": query, "$options": "i"}},
                    {"location": {"$regex": query, "$options": "i"}},
                ]
            },
            session=session,
        ).limit(limit).to_list()

    async def find_conflicts(
        self,
        user_id: str,
        start: datetime,
        end: datetime,
        exclude_event_id: str | None = None,
        *,
        session: AsyncClientSession | None = None,
    ) -> list[Event]:
        """Find events overlapping with given time range."""
        conditions = [
            Event.user_id == PydanticObjectId(user_id),
            Event.start_datetime < end,
            Event.end_datetime > start,
        ]

        if exclude_event_id:
            conditions.append(Event.id != PydanticObjectId(exclude_event_id))

        return await Event.find(*conditions, session=session).sort("start_datetime").to_list()

    async def create(
        self,
        user_id: str,
        title: str,
        start_datetime: datetime,
        end_datetime: datetime,
        calendar_id: str,
        description: str | None = None,
        location: str | None = None,
        is_all_day: bool = False,
        type_: EventType = "event",
        task_id: str | None = None,
        color: str | None = None,
        reminders: list[int] | None = None,
        *,
        session: AsyncClientSession | None = None,
    ) -> Event:
        event = Event(
            user_id=PydanticObjectId(user_id),
            title=title,
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            calendar_id=PydanticObjectId(calendar_id),
            description=description,
            location=location,
            is_all_day=is_all_day,
            type=type_,
            task_id=PydanticObjectId(task_id) if task_id else None,
            color=color,
            reminders=reminders or [],
        )
        await event.insert(session=session)
        return event

    async def update(
        self,
        event: Event,
        *,
        session: AsyncClientSession | None = None,
        **kwargs,
    ) -> Event:
        for key, value in kwargs.items():
            if hasattr(event, key) and value is not None:
                setattr(event, key, value)
        event.updated_at = datetime.now(UTC)
        await event.save(session=session)
        return event

    async def delete(
        self,
        event: Event,
        *,
        session: AsyncClientSession | None = None,
    ) -> None:
        await event.delete(session=session)

    async def delete_by_calendar(
        self,
        calendar_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> int:
        """Delete all events in a calendar."""
        result = await Event.find(
            Event.calendar_id == PydanticObjectId(calendar_id),
            session=session,
        ).delete(session=session)
        return result.deleted_count if result else 0


class CalendarRepository:
    async def find_by_user(
        self,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> list[Calendar]:
        return await Calendar.find(
            Calendar.user_id == PydanticObjectId(user_id),
            session=session,
        ).to_list()

    async def count_by_user(
        self,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> int:
        return await Calendar.find(
            Calendar.user_id == PydanticObjectId(user_id),
            session=session,
        ).count()

    async def find_by_id(
        self,
        calendar_id: str,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> Calendar | None:
        return await Calendar.find_one(
            Calendar.id == PydanticObjectId(calendar_id),
            Calendar.user_id == PydanticObjectId(user_id),
            session=session,
        )

    async def find_by_name(
        self,
        user_id: str,
        name: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> Calendar | None:
        return await Calendar.find_one(
            Calendar.user_id == PydanticObjectId(user_id),
            Calendar.name_key == normalize_name_key(name),
            session=session,
        )

    async def find_default(
        self,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> Calendar | None:
        return await Calendar.find_one(
            {
                "user_id": PydanticObjectId(user_id),
                "is_default": True,
            },
            session=session,
        )

    async def find_first_other(
        self,
        user_id: str,
        excluded_calendar_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> Calendar | None:
        return await Calendar.find_one(
            Calendar.user_id == PydanticObjectId(user_id),
            Calendar.id != PydanticObjectId(excluded_calendar_id),
            session=session,
        )

    async def create(
        self,
        user_id: str,
        name: str,
        color: str | None = None,
        is_default: bool = False,
        *,
        session: AsyncClientSession | None = None,
    ) -> Calendar:
        calendar = Calendar(
            user_id=PydanticObjectId(user_id),
            name=name,
            name_key=normalize_name_key(name),
            color=color or DEFAULT_CALENDAR_COLOR,
            is_default=is_default,
        )
        await calendar.insert(session=session)
        return calendar

    async def update(
        self,
        calendar: Calendar,
        *,
        session: AsyncClientSession | None = None,
        **kwargs,
    ) -> Calendar:
        for key, value in kwargs.items():
            if hasattr(calendar, key) and value is not None:
                setattr(calendar, key, value)
        if "name" in kwargs and kwargs["name"] is not None:
            calendar.name_key = normalize_name_key(calendar.name)
        await calendar.save(session=session)
        return calendar

    async def unset_default_for_user(
        self,
        user_id: str,
        *,
        exclude_calendar_id: str | None = None,
        session: AsyncClientSession | None = None,
    ) -> None:
        query: dict[str, object] = {
            "user_id": PydanticObjectId(user_id),
            "is_default": True,
        }
        if exclude_calendar_id is not None:
            query["_id"] = {"$ne": PydanticObjectId(exclude_calendar_id)}
        await Calendar.get_pymongo_collection().update_many(
            query,
            {"$set": {"is_default": False}},
            session=session,
        )

    async def delete(
        self,
        calendar: Calendar,
        *,
        session: AsyncClientSession | None = None,
    ) -> None:
        await calendar.delete(session=session)


class RecurringRuleRepository:
    async def find_by_user(
        self,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> list[RecurringRule]:
        return await RecurringRule.find(
            RecurringRule.user_id == PydanticObjectId(user_id),
            session=session,
        ).to_list()

    async def find_by_id(
        self,
        rule_id: str,
        user_id: str,
        *,
        session: AsyncClientSession | None = None,
    ) -> RecurringRule | None:
        return await RecurringRule.find_one(
            RecurringRule.id == PydanticObjectId(rule_id),
            RecurringRule.user_id == PydanticObjectId(user_id),
            session=session,
        )

    async def create(
        self,
        user_id: str,
        event_template_id: str,
        frequency: RecurrenceFrequency,
        interval: int = 1,
        days_of_week: list[int] | None = None,
        end_date: datetime | None = None,
        max_occurrences: int | None = None,
        *,
        session: AsyncClientSession | None = None,
    ) -> RecurringRule:
        rule = RecurringRule(
            user_id=PydanticObjectId(user_id),
            event_template_id=PydanticObjectId(event_template_id),
            frequency=frequency,
            interval=interval,
            days_of_week=days_of_week,
            end_date=end_date,
            max_occurrences=max_occurrences,
        )
        await rule.insert(session=session)
        return rule

    async def update_occurrence(
        self,
        rule: RecurringRule,
        *,
        session: AsyncClientSession | None = None,
    ) -> RecurringRule:
        """Increment occurrence count and update last generated date."""
        rule.occurrence_count += 1
        rule.last_generated_date = datetime.now(UTC)
        await rule.save(session=session)
        return rule

    async def deactivate(
        self,
        rule: RecurringRule,
        *,
        session: AsyncClientSession | None = None,
    ) -> RecurringRule:
        rule.is_active = False
        await rule.save(session=session)
        return rule

    async def delete(
        self,
        rule: RecurringRule,
        *,
        session: AsyncClientSession | None = None,
    ) -> None:
        await rule.delete(session=session)
