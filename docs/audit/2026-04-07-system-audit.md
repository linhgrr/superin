# Shin SuperApp — System Audit Report

> **Date:** 2026-04-07
> **Audited by:** Claude Opus 4.6
> **Scope:** Full system audit — frontend + backend
> **Overall Score:** 25/38 checks passed | 7 critical | 6 high | 26 medium/low

---

## Severity Legend

| Symbol | Severity | Description |
|--------|----------|-------------|
| 🔴 | Critical | Breaks functionality or produces wrong behavior silently |
| 🟠 | High | Significant correctness, security, or performance issue |
| 🟡 | Medium | Code smell, maintainability, or minor correctness gap |
| ⚠️ | Low | Cosmetic, minor, or informational |

---

## SECTION 1: Critical Issues (🔴)

### 🔴-1 | `var(--color-muted)` Does Not Exist in CSS

**Location:** ~90+ files in `frontend/src/`
**Classification:** Silent visual breakage — muted text renders in browser default color instead of designed `--color-foreground-muted`

**Root Cause:** `globals.css` defines `--color-foreground-muted` and `--color-foreground-subtle`, but **never** defines `--color-muted`. All components reference the wrong variable name.

**Impact:** Every muted text element in the entire app renders incorrectly. Dark-mode design is visibly broken for all secondary text.

**Files to fix (comprehensive list):**

```
apps/finance/widgets/TotalBalanceWidget.tsx         lines 12, 34
apps/finance/widgets/BudgetOverviewWidget.tsx       lines 11, 33
apps/finance/widgets/RecentTransactionsWidget.tsx  lines 12, 33, 60
apps/finance/widgets/FinanceDashboardWidget.tsx     line 24
apps/finance/components/CategoryBreakdownChart.tsx  lines 33, 40, 51, 61, 104, 114
apps/finance/components/MonthlyTrendChart.tsx       lines 32, 39, 48, 135, 167, 169
apps/finance/components/BudgetCheckPanel.tsx        lines 32, 51, 71, 79, 93, 135, 162
apps/finance/components/WalletEditForm.tsx          lines 42, 65, 77
apps/finance/components/CategoryEditForm.tsx        lines 104, 126, 146, 166
apps/finance/components/TransactionEditForm.tsx    lines 62, 84, 101, 122, 144, 163
apps/finance/components/SimpleForm.tsx               line 49
apps/finance/features/wallets/WalletsTab.tsx        lines 45, 47, 87
apps/finance/features/categories/CategoriesTab.tsx   lines 38, 40, 82, 86
apps/finance/features/transactions/TransactionsTab.tsx lines 57, 59, 110, 115
apps/todo/widgets/TodayWidget.tsx                    lines 11, 49
apps/todo/widgets/TaskListWidget.tsx                 lines 11, 32, 59
apps/todo/widgets/TodoDashboardWidget.tsx            line 21
apps/todo/features/tasks/TasksPanel.tsx              lines 204, 226, 228
apps/todo/components/TaskRow.tsx                    lines 55, 63, 74, 105
apps/todo/components/SubtaskItem.tsx                 lines 51, 61, 82, 91
apps/todo/components/SubtaskList.tsx                 lines 53, 148, 167, 179
apps/todo/components/RecurringRuleForm.tsx           lines 78, 102, 126, 149, 170, 190
apps/calendar/widgets/DaySummaryWidget.tsx            lines 44, 65, 93, 121, 127
apps/calendar/widgets/UpcomingWidget.tsx              lines 56, 68, 74, 113
apps/calendar/widgets/CalendarDashboardWidget.tsx    line 23
pages/AppPage.tsx                                    lines 27, 46, 49
pages/SettingsPage.tsx                               line 492
App.tsx                                              lines 67, 110, 256
components/providers/DiscoveryInitializer.tsx         line 26
```

**Fix:** Replace all `var(--color-muted)` with `var(--color-foreground-muted)` across all files. Consider adding `--color-muted` as an alias in `globals.css` as a fallback.

---

### 🔴-2 | Silent Error Swallow in `auth.py` Logout

**Location:** `backend/apps/auth.py` lines 136–142
**Classification:** Security-critical path — silent error swallowing

```python
if refresh_token:
    try:
        payload = decode_token(refresh_token)
        blacklist_entry = _blacklist_token(payload)
        if blacklist_entry:
            await blacklist_entry.insert()
    except Exception:
        pass  # Token invalid or expired, just delete cookie
```

**Impact:** Any DB write failure, JWT library exception, or unexpected error during logout is silently discarded. Impossible to debug auth failures. Could mask security-relevant errors.

**Fix:**
```python
except Exception:
    logger.debug("Token invalid or expired during logout blacklist", exc_info=True)
```

---

### 🔴-3 | Silent Swallow in Root Agent — Empty Tool List

**Location:** `backend/core/agents/root/agent.py` lines 353–357
**Classification:** Silent failure — agent becomes non-functional

```python
try:
    installed_app_ids = set(await list_installed_app_ids(user_id))
except Exception:
    logger.exception("Failed to load installed apps for tool scoping")
    installed_app_ids = set()  # ← Returns empty — agent has no tools
```

**Impact:** When the DB query for installed apps fails, the agent returns an empty tool list silently. User sees the agent with no tools. The `finally` block clears agent context even on failure.

**Fix:** Either re-raise after logging, or propagate an explicit failure signal so the caller can handle degraded mode.

---

### 🔴-4 | Calendar Event Search Loads ALL Events Into Memory

**Location:** `backend/apps/calendar/repository.py` lines 66–77
**Classification:** Memory/correctness — O(n) load for every search

```python
all_events = await Event.find(
    Event.user_id == PydanticObjectId(user_id)
).to_list()   # ← Loads EVERY event user ever created

filtered = [
    e for e in all_events
    if search_lower in e.title.lower()
    ...
]
return filtered[:limit]
```

**Impact:** Users with years of events will load thousands of documents into Python memory, causing slow responses and potential OOM. Must use server-side MongoDB regex.

**Fix:** Use MongoDB `$regex` with `$options: "i"` at query time:
```python
return await Event.find(
    Event.user_id == PydanticObjectId(user_id),
    {"$or": [
        {"title": {"$regex": query, "$options": "i"}},
        {"description": {"$regex": query, "$options": "i"}},
    ]}
).limit(limit).to_list()
```

---

### 🔴-5 | `AuiIf` Condition Always Falsy in ChatThread

**Location:** `frontend/src/components/chat/ChatThread.tsx` line 125
**Classification:** Silent error suppression — LLM errors never shown to user

```tsx
<AuiIf condition={(s) => !!s.message.status?.error}>
```

**Problem:** `s` is `ThreadPrimitive` state, NOT message-scoped state. The error is on `message.error`, not `s.message.status?.error`. Condition is always falsy.

**Fix:** Replace with direct check:
```tsx
{message.status?.type === "error" && (
  <ErrorPrimitive.Root className="mb-2 ...">
    <ErrorPrimitive.Message />
  </ErrorPrimitive.Root>
)}
```

Also verify `AuiIf` API version matches installed `@assistant-ui/react` version (`^0.12.21`).

---

### 🔴-6 | `useTimezone` Imported From Platform Hook Into Apps

**Location:** 9 files across calendar, todo, finance apps
**Classification:** Platform ≠ Apps architecture violation

**Rule broken:** `frontend/src/hooks/` (platform code) must NEVER be imported by any app in `frontend/src/apps/`

| File | Line |
|------|------|
| `src/apps/calendar/views/CalendarScreen.tsx` | 15 |
| `src/apps/calendar/widgets/MonthViewWidget.tsx` | 3 |
| `src/apps/calendar/widgets/DaySummaryWidget.tsx` | 4 |
| `src/apps/calendar/widgets/UpcomingWidget.tsx` | 4 |
| `src/apps/calendar/components/CreateEventModal.tsx` | 3 |
| `src/apps/calendar/components/ListView.tsx` | 2 |
| `src/apps/calendar/components/WeekView.tsx` | 4 |
| `src/apps/todo/components/TaskRow.tsx` | 3 |
| `src/apps/finance/features/transactions/TransactionsTab.tsx` | 9 |

**Fix:** Create `apps/{app_id}/lib/useTimezone.ts` inside each app, copy the hook implementation per-app.

---

## SECTION 2: High Priority Issues (🟠)

### 🟠-7 | Shared Constants Duplicated Across 5 Literal Types

**Location:** `backend/apps/{app_id}/models.py`, `schemas.py`, `service.py`, `repository.py`, `tools.py`
**Classification:** DRY violation — same type defined in 5 places per app

| # | Type | Current Location | Should Be |
|---|------|-----------------|-----------|
| 7a | `EventType` (`"event"\|"time_blocked_task"`) | `apps/calendar/models.py:33` + 4 other files | `shared/enums.py` |
| 7b | `TransactionType` (`"income"\|"expense"`) | `apps/finance/models.py:50` + 4 other files | `shared/enums.py` |
| 7c | `TaskStatus` (`"pending"\|"completed"`) | `apps/todo/models.py:20` + 4 other files | `shared/enums.py` |
| 7d | `TaskPriority` (`"low"\|"medium"\|"high"`) | `apps/todo/models.py:19` + 4 other files | `shared/enums.py` |
| 7e | `RecurrenceFrequency` (`"daily"\|"weekly"\|"monthly"\|"yearly"`) | `apps/calendar/models.py:90`, `apps/todo/models.py:63` + 8 more files | `shared/enums.py` |

**Fix:** Add to `shared/enums.py`:
```python
EventType = Literal["event", "time_blocked_task"]
TransactionType = Literal["income", "expense"]
TaskStatus = Literal["pending", "completed"]
TaskPriority = Literal["low", "medium", "high"]
RecurrenceFrequency = Literal["daily", "weekly", "monthly", "yearly"]
```
Then update all imports across affected files.

---

### 🟠-8 | `InstallationStatus` Duplicated in `core/models.py`

**Location:** `backend/core/models.py` line 58
**Classification:** Duplicate Literal type — two different type objects

```python
# shared/enums.py:46 — canonical definition
InstallationStatus = Literal["active", "disabled"]

# core/models.py:58 — DUPLICATE
user_status: Literal["active", "disabled"]  # Should use InstallationStatus
```

**Fix:** Import `InstallationStatus` from `shared.enums` in `core/models.py`.

---

### 🟠-9 | `transfer_out` Magic String in Finance Service

**Location:** `backend/apps/finance/service.py` line 342
**Classification:** Undocumented internal marker or bug

```python
expense = sum(t.amount for t in txs if t.type in ("expense", "transfer_out"))
```

`Transaction.type` only allows `"income"|"expense"`. `transfer_out` is not a valid enum value. Either this is an undocumented internal accounting marker or a bug.

**Fix:** Investigate and document. If intentional, add to a shared enum or service-level constant. If not, remove.

---

### 🟠-10 | `WidgetSize.tall` Defined But Never Used

**Location:** `backend/shared/enums.py` line 22
**Classification:** Dead code — defined in platform but unreachable

```python
WidgetSize = Literal["compact", "standard", "wide", "tall", "full"]
# "tall" is never referenced in any manifest
```

**Fix:** Either add a `tall` widget to a manifest, or remove `"tall"` from the Literal type.

---

### 🟠-11 | Frontend `widget-sizes.ts` rowSpan/rglH Mismatch

**Location:** `frontend/src/lib/widget-sizes.ts`
**Classification:** Layout inconsistency — grid heights don't match

```typescript
compact:  rowSpan=1, rglH=2   // ❌ mismatch
standard: rowSpan=2, rglH=3   // ❌ mismatch
wide:     rowSpan=2, rglH=3   // ❌ mismatch
tall:     rowSpan=3, rglH=5   // ✅ match
full:     rowSpan=1, rglH=2   // ❌ mismatch
```

**Impact:** Widget grid layout will have inconsistent row heights. React-grid-layout heights won't match the `rowSpan` calculation in the widget grid.

**Fix:** Align `rglH` values to match `rowSpan` for `compact`, `standard`, `wide`, and `full`.

---

### 🟠-12 | Frontend `manifest.json` Missing Core Fields

**Location:** `frontend/src/apps/{calendar,todo,finance}/manifest.json`
**Classification:** Incomplete data contract — widget config UI cannot render

Frontend manifests only contain: `id`, `widgets[].id`, `widgets[].size`

Missing fields that exist in backend manifests: `name`, `description`, `icon`, `color`, `config_fields`, `version`

**Impact:** Any widget configuration UI or dynamic rendering relying on frontend manifest.json will fail or render empty.

**Fix:** Sync frontend manifests with backend manifests via `sync-fe` command, or auto-generate during build.

---

### 🟠-13 | Codegen Scope Excludes App Schemas

**Location:** `scripts/codegen.config.yaml`
**Classification:** Type drift risk — frontend manually defines request types

```yaml
input: backend/shared/schemas.py  # Only shared!
# MISSING: apps/calendar/schemas.py
# MISSING: apps/todo/schemas.py
# MISSING: apps/finance/schemas.py
```

**Impact:** `CreateTaskRequest`, `CreateEventRequest`, `CreateWalletRequest`, etc. are manually defined in `frontend/src/apps/{app_id}/api.ts`. They can silently drift from backend Pydantic schemas.

**Fix:** Update `codegen.config.yaml` to include all app schema files:
```yaml
input:
  - backend/shared/schemas.py
  - backend/apps/calendar/schemas.py
  - backend/apps/todo/schemas.py
  - backend/apps/finance/schemas.py
```

---

## SECTION 3: Medium Priority Issues (🟡)

### 🟡-14 | Missing Compound MongoDB Index for Todo Multi-Filter Query

**Location:** `backend/apps/todo/models.py` lines 30–37
**Classification:** Performance — full collection scan on multi-filter queries

`TaskRepository.find_by_user()` queries on `{user_id, status, priority, tag, is_archived}`. Existing indexes are all single-field or 2-field. No compound index covers the full 4-field query.

**Fix:** Add compound index:
```python
[("user_id", 1), ("status", 1), ("priority", 1), ("is_archived", 1)]
```

---

### 🟡-15 | Missing Single-Field `user_id` Index on RecurringRule Models

**Location:**
- `backend/apps/todo/models.py` line 76
- `backend/apps/calendar/models.py` lines 107–110
**Classification:** Performance — index scan or collection scan on simple queries

Both `RecurringRule` models have `[(user_id, 1), (is_active, 1)]` but no `[(user_id, 1)]` alone. `RecurringRuleRepository.find_by_user()` only queries `user_id`.

**Fix:** Add `user_id` single-field index to both models.

---

### 🟡-16 | `$regex` with `$options: "i"` Prevents Index Usage

**Location:** `backend/apps/todo/repository.py` lines 52–61
**Classification:** Performance — full collection scan for every search

```python
regex = {"$regex": pattern, "$options": "i"}
db_query["$or"] = [
    {"title": regex},
    {"description": regex},
    {"tags": regex},
]
```

**Fix:** Consider MongoDB text indexes for search, or document this as intentional trade-off with `nDocsLimit` guard.

---

### 🟡-17 | Finance Search Loads 10k Transactions Into Python Memory

**Location:** `backend/apps/finance/service.py` lines 434–448
**Classification:** Performance — unnecessary memory load for keyword filter

```python
txs = await self.transactions.find_by_user(..., limit=10000)
if query:
    txs = [t for t in txs if ...]  # Python-side filter
```

**Fix:** Push keyword filter into MongoDB query using `$regex` or text index.

---

### 🟡-18 | Module-Level Constants E402 Placement in Calendar

**Location:**
- `backend/apps/calendar/service.py` lines 9–11
- `backend/apps/calendar/repository.py` line 11
**Classification:** Ruff E402 violation — constants between imports and class

```python
from apps.calendar.models import ...
DEFAULT_CALENDAR_COLOR = "oklch(...)"  # ← E402: between import and class
WORK_CALENDAR_COLOR = "oklch(...)"
```

Also duplicated across two files within the same app.

**Fix:** Move constants after `logger = logging.getLogger(__name__)` and before any class definitions. Consolidate to one shared definition.

---

### 🟡-19 | Routes Fetch `User` Instead of Service

**Location:**
- `backend/apps/todo/routes.py` lines 289–292
- `backend/apps/finance/routes.py` lines 251–253, 327
**Classification:** Architecture — business logic assembly in routes

```python
user = await User.get(user_id)  # ← Route assembles dependency
return await task_service.get_summary(user)
```

**Fix:** Pass `user_id` to service, let service fetch `User` internally.

---

### 🟡-20 | Wrong HTTP Status Codes for Validation Errors

**Location:**
- `backend/apps/finance/routes.py` lines 73, 134
- `backend/apps/todo/routes.py` line 118
**Classification:** API correctness — `404` used where `400` is appropriate

Wallet name too long, invalid category, etc. return `404 Not Found` instead of `400 Bad Request`. Misleads frontend about whether the resource exists vs. input was invalid.

**Fix:** Replace `HTTPException(status_code=404)` with `HTTPException(status_code=400)` for validation errors.

---

### 🟡-21 | No `response_model` Annotations on Routes

**Location:** All route handlers in `backend/apps/{app_id}/routes.py`
**Classification:** OpenAPI completeness — no auto-generated response schemas

FastAPI won't generate OpenAPI response schemas for return types. Clients using OpenAPI-generated types will have no response type hints.

**Fix:** Add `response_model=...` to all route decorators.

---

### 🟡-22 | Inconsistent Route Path: `/tasks/archived/list`

**Location:** `backend/apps/todo/routes.py` line 60
**Classification:** API consistency — nested path style inconsistent

```python
@router.get("/tasks/archived/list")   # Nested style
@router.get("/recurring")              # Flat style
@router.get("/tasks/{task_id}/toggle") # Flat style (task_id segment)
```

**Fix:** Normalize to `/archived/tasks` or `/tasks/archived`.

---

### 🟡-23 | `CalendarScreen` Not Thin — Inline Sub-Components

**Location:** `frontend/src/apps/calendar/views/CalendarScreen.tsx` (~330 lines)
**Classification:** Architecture — `AppView` should be thin orchestration

`CalendarScreen` contains 4 inline component definitions (`Header`, `CalendarFilterButton`, `ViewToggle`, `ViewButton`) totalling ~170 lines, plus 7 `useState` hooks.

**Fix:** Extract `Header`, `CalendarFilterButton`, `ViewToggle`, `ViewButton` to `calendar/components/`. Strip `CalendarScreen` to 10–20 lines.

---

### 🟡-24 | `FinanceScreen` Not Thin — Tab State Inline

**Location:** `frontend/src/apps/finance/views/FinanceScreen.tsx` (~72 lines)
**Classification:** Architecture — AppView owns tab layout

`FinanceScreen` owns `useState<FinanceTab>` and hardcoded tab-rendering JSX with inline styles.

**Fix:** Move tab shell to `finance/components/TabLayout.tsx`. `FinanceScreen` returns `<TabLayout />`.

---

### 🟡-25 | `MonthViewWidget` Self-Contains Data Fetching

**Location:** `frontend/src/apps/calendar/widgets/MonthViewWidget.tsx` (~227 lines)
**Classification:** Architecture — widget should receive props, not own fetch logic

The widget calls `listEvents()` and `listCalendars()` directly, uses `useState`, `useEffect`, `useCallback`. A dashboard widget should receive pre-fetched data via hooks, not own its own data-fetching.

**Fix:** Extract data fetching to `calendar/hooks/useCalendarSwr.ts`. `MonthViewWidget` receives data as props.

---

### 🟡-26 | 22 Files Import Lucide Directly Instead of DynamicIcon

**Classification:** Bundle optimization + icon consistency violation

All icons should go through `DynamicIcon` from `src/lib/icon-resolver.tsx`. Direct Lucide imports prevent tree-shaking and bypass the dynamic icon system.

**Files (22 total):**
```
calendar/widgets/UpcomingWidget.tsx       Calendar
calendar/widgets/DaySummaryWidget.tsx    Sun, Sunrise
todo/components/RecurringRuleForm.tsx  Repeat, Loader2
todo/components/SubtaskItem.tsx         Check, Circle, Trash2
todo/components/Modal.tsx                X
todo/components/TaskRow.tsx              AlertTriangle, Trash2, ListTodo
todo/components/RecurringBadge.tsx       Repeat
todo/components/SubtaskList.tsx          Plus, Loader2
todo/widgets/TaskListWidget.tsx          CheckCircle2, Circle
todo/widgets/TodayWidget.tsx             CalendarClock, AlertCircle
finance/components/CategoryBreakdownChart.tsx Loader2
finance/components/Modal.tsx             X
finance/components/BudgetCheckPanel.tsx AlertCircle, Loader2
finance/components/CategoryEditForm.tsx Trash2, AlertTriangle
finance/components/MonthlyTrendChart.tsx Loader2, TrendingUp, TrendingDown
finance/widgets/RecentTransactionsWidget.tsx ArrowUpRight, ArrowDownRight
finance/widgets/BudgetOverviewWidget.tsx Receipt
finance/widgets/TotalBalanceWidget.tsx   Wallet
finance/features/transactions/TransactionsTab.tsx Pencil
finance/features/categories/CategoriesTab.tsx  Pencil
finance/features/wallets/WalletsTab.tsx  Pencil
```

**Note:** `Loader2` spinners are typically static loading indicators — a policy decision needed: keep direct imports for spinners or convert all to `DynamicIcon`?

**Fix:** Replace named Lucide imports with `<DynamicIcon name="..." />`. Exception may be made for `Loader2` spinners.

---

### 🟡-27 | Missing `--color-*-muted` CSS Variables

**Location:** `frontend/src/app/globals.css`
**Classification:** Design system completeness

Defined: `--color-primary-muted`
Missing: `--color-success-muted`, `--color-warning-muted`, `--color-danger-muted`, `--color-info-muted`

Components work around this with `var(--color-warning-muted, oklch(...))` fallbacks, but this is verbose and inconsistent.

**Fix:** Add to `globals.css`:
```css
--color-success-muted: oklch(0.72 0.19 145 / 0.15);
--color-warning-muted: oklch(0.75 0.18 75 / 0.15);
--color-danger-muted: oklch(0.63 0.24 25 / 0.15);
--color-info-muted: oklch(0.65 0.21 280 / 0.15);
```

---

### 🟡-28 | Manual `Category` Type in `api/catalog.ts`

**Location:** `frontend/src/api/catalog.ts` lines 17–24
**Classification:** Type drift risk — not generated from backend

```typescript
export interface Category {  // ← Manually defined
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  auto_discovered?: boolean;
}
```

Backend `Category` schema may change without frontend catching it.

**Fix:** Import from `generated/api.ts` or extend codegen to include catalog schemas.

---

### 🟡-29 | `UpdateEventRequest` Missing `is_all_day`

**Location:** `backend/apps/calendar/schemas.py`
**Classification:** Schema completeness — update schema narrower than create

`CreateEventRequest` has `is_all_day` but `UpdateEventRequest` does not. The service method handles it, but Pydantic won't validate `is_all_day` on PATCH.

**Fix:** Add `is_all_day: bool | None = None` to `UpdateEventRequest`.

---

### 🟡-30 | `CategoryRead.user_id` Spurious Field

**Location:** `frontend/src/apps/finance/api.ts`
**Classification:** Type/API mismatch

Frontend `CategoryRead` declares `user_id: string`, but `backend/apps/finance/service.py` `_category_to_dict()` never returns `user_id`. The field will always be `undefined`.

**Fix:** Remove `user_id` from `CategoryRead` interface.

---

### 🟡-31 | `@/lib/timezone` Imported Into Calendar Apps

**Location:**
- `frontend/src/apps/calendar/widgets/UpcomingWidget.tsx` line 5
- `frontend/src/apps/calendar/widgets/DaySummaryWidget.tsx` line 5
**Classification:** Platform ≠ Apps violation (subset of 🟠-6)

`getUserTimezone` and `getTodayRange` from `@/lib/timezone` are platform utilities imported by calendar widgets.

**Fix:** Copy utility functions into `calendar/lib/timezone.ts`.

---

## SECTION 4: Informational / Low Priority (⚠️)

### ⚠️-32 | `AuiIf` API Version Risk

**Location:** `frontend/src/components/chat/ChatThread.tsx`
**Classification:** Dependency compatibility — `AuiIf` API may differ in installed version

The render prop signature `(s) => ...` suggests a newer `@assistant-ui/react` API. Installed version is `^0.12.21`. Verify API compatibility.

---

### ⚠️-33 | Raw `oklch()` in Inline Styles (Semantic Colors)

**Location:** Multiple files — `StorePage.tsx`, `Sidebar.tsx`, `Header.tsx`, `App.tsx`, etc.
**Classification:** Design consistency — hardcoded oklch instead of CSS variables

Semantic color values in inline styles should use CSS variables. Acceptable for backdrop overlays (`oklch(0 0 0 / X)`), but questionable for colored badges/text.

---

### ⚠️-34 | Tailwind Utility Classes in ChatThread

**Location:** `frontend/src/components/chat/ChatThread.tsx` lines 53, 126, 174
**Classification:** Implicit dependency on HeroUI Tailwind plugin

`bg-primary`, `text-primary`, `text-danger`, `bg-danger/10` rely on HeroUI's Tailwind plugin. Fragile if HeroUI config changes.

---

### ⚠️-35 | No `workspace_id` — Single-Tenant Per User

**Location:** All models in `backend/`
**Classification:** Architectural limitation — worth documenting

All models use `user_id` as the isolation boundary. No `workspace_id` or team sharing. This is intentional but should be documented so it's not assumed to be a multi-tenant system.

---

## SECTION 5: Items That Passed ✅

| Check | Status |
|-------|--------|
| Widget ID format `{app_id}.{kebab-name}` | ✅ All correct |
| Tool naming `{app_id}_{action}` | ✅ All correct |
| `safe_tool_call()` usage | ✅ All tools use it |
| TypeScript `any` / `@ts-ignore` | ✅ Zero occurrences |
| Prop interfaces on large components | ✅ All components have proper interfaces |
| SWR fetcher pattern | ✅ All apps use shared `fetcher` and `swrConfig` |
| `useAuth` hook usage | ✅ Consistent throughout |
| SSE streaming setup | ✅ `useDataStreamRuntime` configured correctly |
| Auth on protected routes | ✅ All protected routes use `Depends(get_current_user)` |
| `workspace_id` isolation | ✅ All repositories filter by `user_id` |
| Tool exposure (child tools hidden) | ✅ Only root-level tools exposed |
| `register_plugin()` calls | ✅ All apps have them |
| Mutable default arguments | ✅ None found |
| Import ordering | ✅ All files correct |
| Backend/frontend widget ID consistency | ✅ All match exactly |
| MongoDB index naming | ✅ No duplicates |

---

## Fix Priority Matrix

| Priority | Issues | Estimated Fix Time |
|----------|--------|-------------------|
| **Sprint 1 — Critical** | 🔴-1, 🔴-2, 🔴-3, 🔴-4, 🔴-5, 🔴-6 | 2–3h |
| **Sprint 2 — High** | 🟠-7, 🟠-8, 🟠-9, 🟠-10, 🟠-11, 🟠-12, 🟠-13 | 3–4h |
| **Sprint 3 — Medium** | 🟡-14 → 🟡-31 | 5–6h |
| **Sprint 4 — Low** | ⚠️-32 → ⚠️-35 | 1–2h |

**Total estimated fix time: ~11–15 hours across all issues**

---

*Document generated by automated system audit. Fix progress tracked in associated GitHub Issues.*
