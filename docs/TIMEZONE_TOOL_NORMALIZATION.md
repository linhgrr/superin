# Timezone Tool Normalization

## Goal

Make every agent tool timezone-correct without duplicating parsing logic in each tool.

The normalization layer sits at the tool boundary:
- agent reasoning stays in user-local semantics
- services/repositories stay semantic-type-oriented

Meaning:
- `instant` fields are normalized to UTC before they reach services/repositories
- `local_date` and `local_time` fields keep their semantic value until a specific query or derived-instant use case needs conversion

## Pattern A

Each tool declares timezone-aware fields explicitly:

```python
temporal_fields = {
    "start": "local_datetime",
    "end": "local_datetime",
    "end_date": "local_date",
}
```

Then the tool uses the shared wrapper:

```python
return await run_time_aware_tool_with_user(
    config,
    action="scheduling event",
    payload={"start": start, "end": end},
    temporal_fields={"start": "local_datetime", "end": "local_datetime"},
    operation=operation,
)
```

The `operation` callback receives:
- `user_id`
- normalized temporal values
- a `ToolTimeContext`

## Temporal Kinds

### `instant`

Absolute point in time.

Accepted input:
- offset-aware ISO strings
- aware `datetime`

Rules:
- converted to aware UTC
- naive values are rejected because they are ambiguous

### `local_datetime`

Wall-clock datetime in the user's timezone.

Accepted input:
- naive ISO datetime string like `2026-04-19T09:00`
- offset-aware ISO datetime string
- `datetime`

Rules:
- naive input is interpreted in `user.settings.timezone`
- aware input is converted to UTC
- output is aware UTC `datetime`

### `local_date`

Date-only semantic value.

Accepted input:
- `YYYY-MM-DD`
- `date`
- `datetime` with date part extracted

Rules:
- output stays as a `date`
- callers can convert to UTC day range when needed

### `local_time`

Time-of-day semantic value.

Accepted input:
- `HH:MM`
- `HH:MM:SS`
- `time`

Rules:
- output stays as a `time`
- meaningful only when combined with `local_date` or another local semantic

## ToolTimeContext

The shared wrapper builds:
- `user_id`
- `user`
- `timezone`
- `now_utc`
- `now_local`

This allows tools to:
- resolve date-only values into UTC ranges
- combine `local_date + local_time`
- format deterministic logs or errors

## Rules For Tool Authors

1. Tool implementations must not parse datetime strings manually.
2. Tool implementations must not assume naive datetimes are UTC.
3. If a field is date-only, keep it semantic until query/store boundaries require a UTC range.
4. Use `instant` only for truly absolute inputs.
5. Prefer `local_datetime` for agent-facing scheduling tools.
6. Do not turn a date-only value like `"2026-04-19"` into a fake midnight UTC timestamp and then treat that timestamp as the source of truth.

## Migration Guidance

### Good first migrations

- calendar schedule / reschedule / find
- todo add / update

### Common anti-patterns to remove

- `ensure_aware_utc(datetime.fromisoformat(value))` on naive agent input
- per-tool timezone parsing logic
- mixing browser/server timezone assumptions into backend tools

## Example

Input from agent:

```json
{
  "start": "2026-04-19T09:00",
  "end": "2026-04-19T10:00"
}
```

User timezone:

```text
Asia/Ho_Chi_Minh
```

Normalized values:

```python
{
    "start": datetime(2026, 4, 19, 2, 0, tzinfo=UTC),
    "end": datetime(2026, 4, 19, 3, 0, tzinfo=UTC),
}
```

The service layer only sees UTC.

For a `local_date` todo deadline:

```json
{
  "due_date": "2026-04-19"
}
```

Normalized values:

```python
{
    "due_date": date(2026, 4, 19),
}
```

The service layer sees a semantic calendar date, not a fabricated UTC instant.
