# Calendar App Design

**Version:** 1.0
**Date:** 2026-04-01
**Status:** Design Validated

## Overview

Calendar App for Superin platform - Personal Advanced tier with Todo integration. Focus on individual productivity with clean separation between Events (time-specific) and Tasks (actionable items).

## Design Decisions

### Core Philosophy: Clean Separation

- **Events** live in Calendar App (meetings, appointments, time blocks)
- **Tasks** live in Todo App (actionable work)
- **Integration** via reference: Event can reference Task when scheduled

This avoids data duplication and confusion between "what to do" vs "when to do it".

## Data Models

### Event
Core entity representing a time-blocked item.

```python
class Event(Document):
    user_id: PydanticObjectId
    title: str
    description: str | None = None
    location: str | None = None

    # Time
    start_datetime: datetime
    end_datetime: datetime
    is_all_day: bool = False
    timezone: str = "UTC"  # User's timezone

    # Classification
    calendar_id: PydanticObjectId  # Reference to Calendar
    type: Literal["event", "time_blocked_task"] = "event"
    task_id: PydanticObjectId | None = None  # Only if type=time_blocked_task

    # Appearance
    color: str | None = None  # Override calendar color

    # Recurrence
    is_recurring: bool = False
    recurring_rule_id: PydanticObjectId | None = None

    # Reminders
    reminders: list[int] = []  # Minutes before event

    # Attendees (basic, Phase 2)
    attendees: list[Attendee] = []

    # Metadata
    ics_uid: str | None = None  # For ICS export
    created_at: datetime
    updated_at: datetime
```

### Calendar
Grouping mechanism for events.

```python
class Calendar(Document):
    user_id: PydanticObjectId
    name: str  # "Personal", "Work", "Family"
    color: str  # Hex color for UI
    is_visible: bool = True
    is_default: bool = False
    created_at: datetime
```

### RecurringRule
Pattern for generating recurring events.

```python
class RecurringRule(Document):
    user_id: PydanticObjectId
    event_template_id: PydanticObjectId  # Original event

    # Pattern
    frequency: Literal["daily", "weekly", "monthly", "yearly"]
    interval: int = 1  # Every N frequencies
    days_of_week: list[int] | None = None  # 0=Monday, for weekly

    # Limits
    end_date: datetime | None = None
    max_occurrences: int | None = None
    occurrence_count: int = 0

    # State
    is_active: bool = True
    last_generated_date: datetime | None = None

    created_at: datetime
```

## Tool Design (10 Tools)

Following consolidation principle - comprehensive tools over narrow ones.

### Core Event Tools

1. **calendar_list_events** - Comprehensive list with filters
   - Parameters: start, end, calendar_id, query, include_completed_tasks
   - Returns: List of events with task references if applicable

2. **calendar_create_event** - Create with conflict detection
   - Parameters: title, start, end, calendar_id, type, task_id (optional)
   - Auto-checks conflicts, returns warning if found

3. **calendar_update_event** - Update with conflict re-check
   - Parameters: event_id + fields to update
   - Re-checks conflicts if time changed

4. **calendar_delete_event** - Delete single or series
   - Parameters: event_id, delete_series (bool)

5. **calendar_get_event** - Full details
   - Parameters: event_id
   - Returns: Event with attendees, recurrence info

### Calendar Management

6. **calendar_list_calendars** - List user's calendars
7. **calendar_check_conflicts** - Preview availability
   - Parameters: start, end, exclude_event_id (optional)
   - Returns: Conflicting events if any

### Todo Integration

8. **calendar_schedule_task** - Convert Todo task to time-blocked event
   - Parameters: task_id, start, duration_minutes
   - Creates Event type="time_blocked_task" with task reference
   - Updates Todo task's scheduled_start/scheduled_end

### Recurrence

9. **calendar_create_recurring** - Setup repeating pattern
10. **calendar_stop_recurring** - Stop future occurrences

## API Routes

### Events
- `GET /api/apps/calendar/events` - List with query params
- `POST /api/apps/calendar/events` - Create
- `GET /api/apps/calendar/events/{id}` - Get single
- `PATCH /api/apps/calendar/events/{id}` - Update
- `DELETE /api/apps/calendar/events/{id}` - Delete

### Calendar Management
- `GET /api/apps/calendar/calendars` - List calendars
- `POST /api/apps/calendar/calendars` - Create
- `PATCH /api/apps/calendar/calendars/{id}` - Update

### Conflicts
- `GET /api/apps/calendar/conflicts/check` - Check availability

### Todo Integration
- `POST /api/apps/calendar/tasks/{task_id}/schedule` - Schedule task

### Recurring
- `POST /api/apps/calendar/events/{id}/recurring` - Make recurring
- `PATCH /api/apps/calendar/recurring/{id}/stop` - Stop recurring

## Widgets

1. **calendar.month-view** - Full month grid
   - Size: wide
   - Config: default_calendar, show_tasks

2. **calendar.upcoming** - List of next 5-10 events
   - Size: standard
   - Config: max_items, calendar_filter

3. **calendar.day-summary** - Today + tomorrow overview
   - Size: compact
   - Config: show_completed_tasks

## Integration with Todo App

### Data Flow

**Scheduling a Task:**
```
User: "Schedule my Write Report task for Friday 9am"
→ Agent: calendar_schedule_task(task_id, start, duration)
   → 1. Get task from Todo
   → 2. Check conflicts
   → 3. Create Event(type="time_blocked_task", task_id)
   → 4. Update Task.scheduled_start/end
→ Response: Task scheduled as 2-hour block
```

**View Integration:**
- Calendar widget queries Events (includes time-blocked tasks)
- Task display: title + checkbox from Todo state
- Click task → navigate to Todo detail

## Future Phases

### Phase 2 (Post-MVP)
- ICS export/import
- Shared calendars (view-only links)
- Timezone handling for travelers
- Attendee email notifications

### Phase 3 (Advanced)
- Google Calendar sync
- Outlook sync
- Meeting poll scheduling

## Testing Strategy

1. **Conflict Detection**: Unit tests for overlapping events
2. **Recurring Generation**: Test pattern generation for various frequencies
3. **Todo Integration**: Verify task reference integrity
4. **Timezone**: Test edge cases (DST transitions)

## Security Considerations

- All events user-scoped (user_id filter on all queries)
- Calendar visibility: private by default
- Sharing (Phase 2): view-only tokens, no edit permissions initially

## Open Questions

1. Should we auto-complete time-blocked task when Event ends? (No - keep manual)
2. What happens when referenced Task is deleted? (Event becomes orphaned or auto-deleted?)
3. Should recurring events be generated upfront or on-demand? (On-demand for scalability)

---

**Next Steps:** Implementation via superpowers:writing-plans
