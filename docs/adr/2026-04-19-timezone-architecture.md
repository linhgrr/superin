# ADR 2026-04-19: Per-User Timezone Architecture

## Status

Accepted

## Context

Superin is a multi-user web app with:
- per-user timezone settings
- backend-only agent execution
- multiple sub-apps with date/time semantics
- UTC persistence in MongoDB and UTC API contracts

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

## Decision

We split all temporal values into two categories:

1. `Instant`
- Absolute point in time
- Canonical representation: UTC datetime / UTC ISO string
- Used for DB storage, API payloads, checkpoint timestamps, audit timestamps

2. `Local Calendar Value`
- Semantic value in the user's configured IANA timezone
- Canonical forms:
  - `local_date`: `YYYY-MM-DD`
  - `local_time`: `HH:MM[:SS]`
  - `local_datetime`: `YYYY-MM-DDTHH:MM[:SS]` without offset
- Used for UI interactions, agent reasoning, and tool inputs that originate from user intent

## Source Of Truth

- `user.settings.timezone` is the only business source of truth for timezone semantics.
- Browser timezone is only a pre-auth/default fallback.
- Backend process timezone must never affect business logic.
- MongoDB stores UTC datetimes only.

## Boundary Rules

### Frontend

- UI may render or collect local calendar values.
- Any request crossing the API boundary must be normalized to UTC if the endpoint expects instants.
- Day identity must not rely on raw `Date` local methods.
- Calendar state should prefer stable local models like `date_key + minutes` over mutable `Date` objects.

### Backend Services / Repositories

- Service and repository layers operate on UTC datetimes for persisted/queryable time.
- Date-range semantics like "today" or "this week" are computed from `user.settings.timezone`, then converted to UTC before querying MongoDB.

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

### Costs

- tools must explicitly declare temporal field metadata
- some existing tools and prompts need migration
- tests must cover timezone-sensitive boundaries, including DST zones

## Migration Plan

1. Add shared backend temporal normalization utilities and wrapper.
2. Migrate calendar tools first.
3. Migrate todo tools with date-only + time-only semantics.
4. Audit finance and remaining sub-apps for date field kinds.
5. Keep UTC as the only persisted/API contract throughout migration.
