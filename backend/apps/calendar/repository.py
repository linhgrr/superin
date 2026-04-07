"""Calendar plugin data access layer."""

from datetime import UTC, datetime

from beanie import PydanticObjectId

from apps.calendar.enums import EventType, RecurrenceFrequency
from apps.calendar.models import Calendar, Event, RecurringRule

# Default color for new calendars
DEFAULT_CALENDAR_COLOR = "oklch(0.70 0.18 250)"  # Blue-ish


def _to_naive(dt: datetime | None) -> datetime | None:
    """Convert timezone-aware datetime to naive UTC for DB comparison."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone().replace(tzinfo=None)
    return dt


class EventRepository:
    async def find_by_user(
        self,
        user_id: str,
        start: datetime | None = None,
        end: datetime | None = None,
        calendar_id: str | None = None,
        limit: int = 100,
    ) -> list[Event]:
        """List events with time range filter."""
        conditions = [Event.user_id == PydanticObjectId(user_id)]

        if calendar_id:
            conditions.append(Event.calendar_id == PydanticObjectId(calendar_id))

        # Convert to naive for comparison with DB (which stores naive UTC)
        start_naive = _to_naive(start)
        end_naive = _to_naive(end)

        if start_naive and end_naive:
            # Events overlapping with range: (start1 < end2) AND (end1 > start2)
            conditions.append(Event.start_datetime < end_naive)
            conditions.append(Event.end_datetime > start_naive)
        elif start_naive:
            conditions.append(Event.end_datetime > start_naive)
        elif end_naive:
            conditions.append(Event.start_datetime < end_naive)

        return await Event.find(*conditions).sort("start_datetime").limit(limit).to_list()

    async def find_by_id(self, event_id: str, user_id: str) -> Event | None:
        return await Event.find_one(
            Event.id == PydanticObjectId(event_id),
            Event.user_id == PydanticObjectId(user_id),
        )

    async def search(
        self,
        user_id: str,
        query: str,
        limit: int = 20,
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
        ).limit(limit).to_list()

    async def find_conflicts(
        self,
        user_id: str,
        start: datetime,
        end: datetime,
        exclude_event_id: str | None = None,
    ) -> list[Event]:
        """Find events overlapping with given time range."""
        # Overlap condition: (start1 < end2) and (end1 > start2)
        conditions = [
            Event.user_id == PydanticObjectId(user_id),
            Event.start_datetime < end,
            Event.end_datetime > start,
        ]

        if exclude_event_id:
            conditions.append(Event.id != PydanticObjectId(exclude_event_id))

        return await Event.find(*conditions).sort("start_datetime").to_list()

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
        await event.insert()
        return event

    async def update(self, event: Event, **kwargs) -> Event:
        for key, value in kwargs.items():
            if hasattr(event, key) and value is not None:
                setattr(event, key, value)
        event.updated_at = datetime.now(UTC)
        await event.save()
        return event

    async def delete(self, event: Event) -> None:
        await event.delete()

    async def delete_by_calendar(self, calendar_id: str) -> int:
        """Delete all events in a calendar."""
        count = 0
        async for e in Event.find(Event.calendar_id == PydanticObjectId(calendar_id)):
            await e.delete()
            count += 1
        return count


class CalendarRepository:
    async def find_by_user(self, user_id: str) -> list[Calendar]:
        return await Calendar.find(
            Calendar.user_id == PydanticObjectId(user_id)
        ).to_list()

    async def find_by_id(self, calendar_id: str, user_id: str) -> Calendar | None:
        return await Calendar.find_one(
            Calendar.id == PydanticObjectId(calendar_id),
            Calendar.user_id == PydanticObjectId(user_id),
        )

    async def find_default(self, user_id: str) -> Calendar | None:
        return await Calendar.find_one(
            Calendar.user_id == PydanticObjectId(user_id),
            Calendar.is_default,
        )

    async def create(
        self,
        user_id: str,
        name: str,
        color: str | None = None,
        is_default: bool = False,
    ) -> Calendar:
        calendar = Calendar(
            user_id=PydanticObjectId(user_id),
            name=name,
            color=color or DEFAULT_CALENDAR_COLOR,
            is_default=is_default,
        )
        await calendar.insert()
        return calendar

    async def update(self, calendar: Calendar, **kwargs) -> Calendar:
        for key, value in kwargs.items():
            if hasattr(calendar, key) and value is not None:
                setattr(calendar, key, value)
        await calendar.save()
        return calendar

    async def delete(self, calendar: Calendar) -> None:
        await calendar.delete()


class RecurringRuleRepository:
    async def find_by_user(self, user_id: str) -> list[RecurringRule]:
        return await RecurringRule.find(
            RecurringRule.user_id == PydanticObjectId(user_id)
        ).to_list()

    async def find_by_id(self, rule_id: str, user_id: str) -> RecurringRule | None:
        return await RecurringRule.find_one(
            RecurringRule.id == PydanticObjectId(rule_id),
            RecurringRule.user_id == PydanticObjectId(user_id),
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
        await rule.insert()
        return rule

    async def update_occurrence(self, rule: RecurringRule) -> RecurringRule:
        """Increment occurrence count and update last generated date."""
        rule.occurrence_count += 1
        rule.last_generated_date = datetime.now(UTC)
        await rule.save()
        return rule

    async def deactivate(self, rule: RecurringRule) -> RecurringRule:
        rule.is_active = False
        await rule.save()
        return rule

    async def delete(self, rule: RecurringRule) -> None:
        await rule.delete()
