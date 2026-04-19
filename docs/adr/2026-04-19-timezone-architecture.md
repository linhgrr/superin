# ADR 2026-04-19: Per-User Timezone Architecture

## Status

Accepted

## Context

Superin is a multi-user web app with:
- per-user timezone settings
- backend-only agent execution
- multiple sub-apps with date/time semantics
- UTC persistence for absolute instants
- date-only and time-only business concepts in apps like Todo and Calendar

Recent bugs came from mixing:
- absolute instants (`2026-04-19T02:00:00Z`)
- local calendar semantics (`2026-04-19`, `09:00`, `today`, `tomorrow`)
- browser timezone
- server timezone

That made the system inconsistent across:
- frontend calendar rendering
- agent tool inputs
- "today / this week / tomorrow" queries
- date-only task and event flows
- API contracts
- raw DB/debug views

## Decision

We split all temporal values into four categories:

1. `Instant`
- Absolute point in time
- Canonical representation: UTC datetime / UTC ISO string
- Used for DB storage, API payloads, checkpoint timestamps, audit timestamps

2. `Local Date`
- Day on the user's calendar, not a timeline instant
- Canonical representation: `YYYY-MM-DD`
- Used for todo deadlines, all-day event semantics, billing dates, period anchors

3. `Local Time`
- Wall-clock time without date or offset context
- Canonical representation: `HH:MM[:SS]`
- Used for values like reminder clock time or todo due time

4. `Local DateTime`
- Wall-clock date+time in the user's configured IANA timezone
- Canonical representation: `YYYY-MM-DDTHH:MM[:SS]` without offset
- Used only at input/reasoning boundaries before being normalized according to field semantic

The system does **not** use "UTC for everything" as a blanket rule. It uses:
- UTC for `instant`
- semantic local representations for date-only and time-only values

## Source Of Truth

- `user.settings.timezone` is the only business source of truth for timezone semantics.
- Browser timezone is only a pre-auth/default fallback.
- Backend process timezone must never affect business logic.
- MongoDB stores:
  - naive UTC datetimes for `instant` fields
  - semantic ISO strings for `local_date` and `local_time` fields unless/until a better dedicated representation is adopted

## Boundary Rules

### Frontend

- UI may render or collect local calendar values.
- Requests crossing the API boundary must preserve the field semantic:
  - `instant` fields -> UTC ISO strings
  - `local_date` -> `YYYY-MM-DD`
  - `local_time` -> `HH:MM[:SS]`
  - `local_datetime` -> local wall-clock string only when the endpoint explicitly expects that kind
- Day identity must not rely on raw `Date` local methods.
- Calendar state should prefer stable local models like `date_key + minutes` over mutable `Date` objects.

### Backend Services / Repositories

- Service and repository layers operate on:
  - UTC datetimes for `instant` fields
  - semantic date/time values for `local_date` / `local_time`
- Date-range semantics like "today" or "this week" are computed from `user.settings.timezone`, then converted to UTC before querying MongoDB.
- `date-only` business fields must not be converted into fake midnight UTC timestamps and then treated as source of truth.

### Agent Runtime

- Agent reasoning works in the user's timezone.
- Each turn must inject:
  - `user_timezone`
  - `now_local`
  - `today_local`
- Relative time expressions are resolved against the user's timezone, never server UTC.

## Tool Design

Agent tools use Pattern A:
- each tool declares `temporal_fields={field_name: kind}`
- a shared backend wrapper normalizes those fields using the current user's timezone
- the tool implementation receives already-normalized values

Examples of field kinds:
- `instant`
- `local_datetime`
- `local_date`
- `local_time`

## Critical Rule

Naive datetime strings from agents are **not UTC**.

If a tool field is declared `local_datetime`, then:
- `"2026-04-19T09:00"` means `09:00` in `user.settings.timezone`
- it must be converted to UTC in the shared normalization layer before it reaches services/repositories

If a tool field is declared `local_date`, then:
- `"2026-04-19"` means the user's calendar day
- it must remain a date semantic, not be converted into `"2026-04-18T17:00:00Z"` and treated as source of truth

If a tool field is declared `local_time`, then:
- `"15:00"` means a wall-clock time
- it cannot be converted to UTC by itself because date + timezone context are required

Only offset-aware strings such as:
- `2026-04-19T09:00:00+07:00`
- `2026-04-19T02:00:00Z`

are treated as absolute instants directly.

## Consequences

### Benefits

- consistent semantics across frontend, backend, and agent system
- one normalization path for all tools
- no accidental dependence on browser/server timezone
- cleaner migrations for calendar, todo, finance, and future apps
- aligns with production API patterns used by systems like Todoist (`due_date` vs `due_datetime`) and Google Calendar (`date` vs `dateTime`)

### Costs

- tools must explicitly declare temporal field metadata
- some existing tools and prompts need migration
- tests must cover timezone-sensitive boundaries, including DST zones
- some existing docs that claimed "UTC API contract everywhere" must be corrected

## Migration Plan

1. Add shared backend temporal normalization utilities and wrapper.
2. Migrate calendar tools first.
3. Migrate todo tools, schemas, and storage to real date-only + time-only semantics.
4. Audit finance and remaining sub-apps for date field kinds.
5. Keep UTC as the only persisted/API contract for `instant` fields, while preserving semantic contracts for `local_date` and `local_time`.
