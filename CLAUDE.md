# Superin — Claude Reference

> **Dự án:** Superin v2.1 — Plugin-based SuperApp platform
> **Tech Stack:** React 19 + Vite + FastAPI + Beanie + LangGraph + assistant-ui

---

## 1. Project Overview

Superin là nền tảng plugin-based với:
- **Frontend:** React + Vite + Tailwind v4 + HeroUI v3 + assistant-ui
- **Backend:** FastAPI + LangGraph + Beanie ODM + MongoDB
- **Chat:** SSE streaming qua assistant-stream protocol
- **Auth:** JWT (access/refresh tokens)
- **Plugin Model:** Auto-discovery qua `backend/apps/*`
- **Category Registry:** Categories tự động đăng ký từ app manifests, API `/api/catalog/categories`

### Plug-n-Play Architecture

**⚠️ ABSOLUTE RULE: Platform/Core không bao giờ biết về chi tiết hay sự tồn tại của bất kỳ app con nào.**

Hệ thống hỗ trợ true plug-n-play cho plugins:

**Backend:**
- Auto-discovery qua `backend/core/discovery.py` — tự scan và import tất cả folders trong `backend/apps/`
- Mỗi app tự đăng ký qua `register_plugin()` trong `__init__.py`
- **Apps được phép import từ platform code** (`core/`, `shared/`, `core/utils/`). Apps có thể dùng `User`, `utc_now()`, `get_user_timezone_context()`, v.v. — đây là chiều import hợp lệ.
- **Platform code tuyệt đối không biết về apps** — `core/`, `shared/` không được import từ `apps/`. Nếu một app thay đổi, platform không được rebuild hay redeploy.

**Frontend:**
- Auto-discovery qua Vite glob import trong `src/lib/discovery.ts`
- Không cần import thủ công từng app — hệ thống tự tìm tất cả `src/apps/*/AppView.tsx` và `src/apps/*/DashboardWidget.tsx`
- Backend là source of truth cho metadata (icon, color, name, widgets)
- Icons render động qua `DynamicIcon` resolver
- **`src/shared/`** — Pure utilities & shared hooks: `shared/utils/`, `shared/hooks/`. Dành cho code không có app-specific logic hay platform code nặng (timezone, formatters). **Apps được phép import từ đây.**
- **`src/lib/`** — Platform utilities (SWR config, icon-resolver). Apps **KHÔNG** được import từ đây trừ `@/lib/swr`.
- **`src/hooks/`** — Platform hooks (`useAuth`). Apps **KHÔNG** được import từ đây trừ `useAuth`.
- **`src/components/`** — Platform components (dashboard, chat). Apps **KHÔNG** được import từ đây.
- **TUYỆT ĐỐI KHÔNG** đặt logic app-specific bên ngoài folder `src/apps/{app_id}/`
- Apps có thể import từ nhau nếu cần (ví dụ: calendar có thể import từ todo)

**Frontend SWR Pattern (Plug-n-Play Data Fetching):**
- Shared config ở `src/lib/swr.ts` — **KHÔNG** chứa app-specific imports
- Mỗi app tự tạo hooks trong `src/apps/{app_id}/hooks/` (vd: `useFinanceSwr.ts`, `useTodoSwr.ts`)
- Import SWR utilities từ `@/lib/swr` (shared), không bao giờ import từ app khác
- Ví dụ đúng: `import { swrConfig, fetcher } from "@/lib/swr"`

**CLI:**
- `sync-fe` vẫn hữu ích để tạo boilerplate widgets, nhưng không bắt buộc để app hiển thị
- `src/apps/index.ts` là compatibility facade — không cần sửa; app được discover qua `src/lib/discovery.ts` (Vite glob trên `AppView.tsx`, `DashboardWidget.tsx`)

---

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                                     │
│  ├── src/apps/{app_id}/      # App modules                 │
│  ├── src/shared/             # Shared utilities & hooks    │
│  ├── src/components/         # Shared components          │
│  ├── src/pages/               # Top-level pages            │
│  └── src/types/generated/     # Auto-generated from Pydantic│
├─────────────────────────────────────────────────────────────┤
│  Backend (FastAPI)                                          │
│  ├── apps/{app_id}/           # Plugin folders             │
│  ├── core/                    # Platform core              │
│  └── shared/                  # Schemas & interfaces       │
├─────────────────────────────────────────────────────────────┤
│  MongoDB (Beanie ODM)                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Repository Structure

**3 repo độc lập** — mỗi repo có Git history, branch, và remote riêng.

| Repo | Remote | Chứa |
|------|--------|------|
| `backend/` | HF Space: `linhdzqua148/superin-be` | FastAPI + Beanie + LangGraph |
| `frontend/` | GitHub: `linhgrr/superin-fe` | React + Vite + Tailwind |
| root (`/`) | GitHub: `linhgrr/superin` | Scripts + CLAUDE.md + docs |

**Lưu ý quan trọng:**
- **Backend:** `cd backend && git push origin main:main`
- **Frontend:** `cd frontend && git push origin main:main` (hoặc push từ root nếu FE remote đã set)
- Root là nơi chứa `CLAUDE.md`, `scripts/`, `package.json` — không phải monorepo
- Root-level scripts: `npm run build:frontend`, `npm run codegen`, `npm run superin`
- Khi chạy BE scripts từ root: dùng `npm run superin -- <subcommand>` (xem Commands section bên dưới)

---

## 3. Critical File Locations

### Backend (Source of Truth)

```
backend/
├── core/
│   ├── main.py              # FastAPI entry + lifespan
│   ├── auth.py              # JWT get_current_user
│   ├── registry.py          # PLUGIN_REGISTRY
│   ├── discovery.py         # Auto-discover plugins
│   ├── verify.py            # Startup validation
│   └── agents/
│       ├── base_app.py      # BaseAppAgent base class
│       └── root/            # RootAgent orchestration
├── shared/
│   ├── schemas.py           # Pydantic schemas (codegen source)
│   ├── interfaces.py        # Python Protocols
│   └── enums.py             # Shared enums
└── apps/{app_id}/           # Plugin folders
    ├── __init__.py          # register_plugin()
    ├── manifest.py          # AppManifestSchema
    ├── enums.py             # Plugin type enums (PluginType, Priority, Status...)
    ├── models.py            # Beanie Documents
    ├── repository.py        # Data access
    ├── service.py           # Business logic
    ├── routes.py            # FastAPI router
    ├── agent.py             # LangGraph agent
    ├── tools.py             # Domain tools
    └── prompts.py           # Agent prompts
```

### Frontend

```
frontend/
├── src/
│   ├── apps/{app_id}/       # App modules
│   │   ├── AppView.tsx      # Thin orchestration
│   │   ├── DashboardWidget.tsx  # Generated widget dispatcher
│   │   ├── api.ts           # Generated app API client
│   │   ├── views/           # Screen composition
│   │   ├── widgets/         # Individual widgets
│   │   ├── features/        # Domain slices
│   │   └── components/      # App-local UI
│   ├── components/
│   │   ├── dashboard/       # WidgetGrid, AppShell
│   │   ├── chat/            # ChatThread
│   │   └── providers/       # AppProviders
│   ├── lib/
│   │   ├── discovery.ts    # Vite glob: src/apps/*/AppView.tsx, DashboardWidget.tsx
│   │   ├── lazy-registry.ts  # App/widget lazy loading
│   │   ├── prefetch.ts    # App prefetching
│   │   ├── swr.ts         # SWR shared config
│   │   ├── icon-resolver.tsx # Dynamic Lucide resolver
│   │   └── types.ts       # Platform types
│   ├── shared/
│   │   ├── utils/         # Pure utilities (timezone, formatters — apps may import)
│   │   └── hooks/         # Shared React hooks
│   ├── pages/               # DashboardPage, StorePage, etc.
│   └── types/generated/     # Auto-generated (KHÔNG edit)
└── src/app/globals.css       # Design tokens
```

---

## 4. Widget Size Contract

Backend manifest, frontend types, và CSS phải đồng nhất:

| Size | Backend | Frontend CSS |
|------|---------|--------------|
| compact | `compact` | `widget-size-compact` |
| standard | `standard` | `widget-size-standard` |
| wide | `wide` | `widget-size-wide` |
| tall | `tall` | `widget-size-tall` |
| full | `full` | `widget-size-full` |

Widget ID format: `{app_id}.{kebab-name}` (vd: `finance.total-balance`)

---

## 5. Essential Commands

```bash
# Codegen (chạy sau khi đổi Pydantic schema)
npm run codegen

# Validate manifests
npm run validate:manifests

# Validate core Mongo index contract
npm run superin -- db check-indexes

# Reset local Mongo DB sạch theo model/index hiện tại
npm run superin -- db reset --yes

# Tạo plugin mới
npm run superin -- plugin create {app_id}

# Sync frontend từ backend manifest
npm run superin -- plugin sync-fe {app_id}
npm run superin -- plugin sync-fe --all

# Dev server
npm run dev                           # Backend + Frontend
cd frontend && npm run dev            # Frontend only

# Linting
cd frontend && npx eslint --fix --max-warnings 0    # Frontend lint
ruff check backend --fix                                   # Backend lint

# Verify (trước khi commit contract-sensitive changes)
npm run codegen
npm run superin -- db check-indexes
npm run validate:manifests
ruff check backend
cd frontend && npm run build
```

---

## 6. Development Rules

### ⚠️ ABSOLUTE RULES - Never Violate

1. **Platform agnostic to Apps** — Platform code (`src/lib/`, `src/components/`, `src/hooks/`, `backend/core/`, `backend/shared/`) tuyệt đối không được import từ app nào. **Chiều ngược lại (app → platform) là hợp lệ:** apps được phép import từ `shared/utils/datetime.ts`, `useTimezone`, `core.utils.timezone`, `User`, `utc_now()`, v.v.
2. **App containment** — Mỗi app chứa tất cả code của mình trong `src/apps/{app_id}/`
3. **Apps có thể import từ nhau** — Cross-app integration được phép (vd: calendar import từ todo)
4. **`src/shared/` là cầu nối hợp lệ** — `shared/utils/` và `shared/hooks/` dành cho pure utilities (timezone, formatters). Apps được phép import từ đây. Không bao giờ để app-specific logic ở `shared/`.
5. **Backend là source of truth** — manifest (icon, color, name, widgets), schemas, types đều bắt nguồn từ đây
6. **TUYỆT ĐỐI KHÔNG silent catch** — Không bao giờ dùng `.catch(() => {})`, `except: pass`, hoặc bất kỳ nhánh bắt lỗi nào nuốt lỗi im lặng. Mọi lỗi phải được log rõ ràng (`console.error`, logger) hoặc chuyển thành error/result có cấu trúc.
7. **BẮT BUỘC annotate API đầy đủ** — Mọi route plugin trong `backend/apps/{app_id}/routes.py` phải có `response_model` rõ ràng; mọi request/response body phải có schema trong `apps/{app_id}/schemas.py`. Không để OpenAPI trả về `unknown` cho endpoint chính.
8. **DB invariants phải nằm ở DB** — Mọi uniqueness/correctness invariant của dữ liệu thật (`name` unique theo user, chỉ một default, một installation duy nhất, v.v.) phải được enforce bằng Mongo index/constraint. Check ở service chỉ được dùng để cải thiện UX/message, không được là lớp bảo vệ duy nhất.
9. **Multi-document mutate phải dùng transaction** — Bất kỳ flow mutate nào chạm nhiều document/collection hoặc có read-check-write cần tính atomic phải chạy trong Mongo session/transaction. Không dùng read-modify-write trên object Beanie cho balance/counter nếu có thể bị concurrent requests đè nhau.
10. **Local DB phải disposable** — Khi Mongo index/schema contract thay đổi không tương thích ngược trong local/dev, chuẩn xử lý là dùng DB mới hoặc `npm run superin -- db reset --yes`. Không thiết kế thêm workflow migration/backfill tạm chỉ để cứu state local cũ.

### Datetime Conventions

#### Architecture Overview

```
FE  ←→  UTC ISO strings  ←→  BE  ←→  MongoDB (naive UTC)

FE display: UTC → user local (Intl.DateTimeFormat + user timezone)
BE storage: always UTC (aware → naive for Mongo)
```

**Rule #1 — BE stores UTC, FE stores/transmits UTC ISO strings.** No local-time datetimes cross the API boundary.

**Rule #2 — User timezone is display-only, never storage.** BE does not store events in user's local time; it always converts to/from UTC.

---

#### Backend (`backend/core/utils/timezone.py`)

**Source of truth for all BE datetime operations.**

```python
from core.utils.timezone import (
    utc_now,              # datetime.now(UTC) — aware UTC now
    ensure_aware_utc,      # naive → aware UTC; aware → convert to UTC
    ensure_naive_utc,     # aware UTC → naive UTC (for MongoDB queries)
    get_user_timezone_context,  # ctx.now_utc(), ctx.now_local(), ctx.today_range()
)
```

| Situation | What to use |
|---|---|
| Get current time | `utc_now()` — NOT `datetime.now()` |
| Convert any datetime to UTC-naive for DB | `ensure_naive_utc(ensure_aware_utc(dt))` |
| Convert UTC to user local for display | `ctx.utc_to_local(utc_dt)` |
| Convert user local to UTC for storage | `ctx.local_to_utc(local_dt)` |
| Query "today in user's tz" | `ctx.today_range()` → `DayRange(start_utc, end_utc)` |
| Query "this month in user's tz" | `ctx.month_range()` |
| Get today's date in user's tz | `ctx.now_local()` then strip time |

**⚠️ NEVER do this in BE:**
- `datetime.now()` directly (use `utc_now()`)
- `astimezone()` without an argument (converts to system local TZ, not user TZ)
- Store user-local datetimes without converting to UTC first

**⚠️ MongoDB / Beanie:** All stored `start_datetime`/`end_datetime` fields are naive UTC. Beanie can silently strip timezone from datetimes. Always run incoming datetimes through `ensure_naive_utc(ensure_aware_utc(dt))` before storing or querying.

**⚠️ Model-level enforcement:** `Event.start_datetime` and `Event.end_datetime` have a Pydantic `model_validator` that auto-normalizes any input (aware, naive, or ISO string) to UTC-naive. Service layer also normalizes defensively — this is defense-in-depth.

#### Tool / LLM Input Normalization

> **Rule: Every datetime input from LLM MUST be normalized via `ensure_aware_utc()` BEFORE passing to service.**

LLM agents can send datetime strings without explicit UTC offset (e.g. `"2025-04-01"` instead of `"2025-04-01T00:00:00Z"`). The tool layer must normalize all inputs:

```python
# ❌ WRONG — datetime.fromisoformat() returns naive, assumes UTC but doesn't normalize
dt = datetime.fromisoformat(due_date)

# ✅ CORRECT — always normalize before passing to service
dt = ensure_aware_utc(datetime.fromisoformat(due_date))
```

Affected files: `apps/*/tools.py` — always wrap `datetime.fromisoformat()` calls with `ensure_aware_utc()`.

---

#### Frontend (`frontend/src/shared/utils/datetime.ts`)

**Single source of truth for all FE datetime operations.**

```typescript
import {
  getUserTimezone,           // Read active timezone (localStorage → browser → UTC)
  setUserTimezone,            // Persist user preference
  buildUtcIsoString,         // Date(y,m,d,h,min) → .toISOString() (correct UTC)
  buildUtcIsoStringFromDate, // datePicker + hour/min → UTC ISO for API
  formatTime,                // UTC string → "HH:MM" in user tz
  formatDate,                // UTC string → "13 Apr 2026" in user tz
  formatDateTime,            // UTC string → "13 Apr 2026, 09:00" in user tz
  getHourMinute,             // UTC string → {hour, min} in user tz (REPLACES .getHours())
  isToday,                   // UTC string → boolean (user tz)
  isPast,                    // UTC string → boolean (user tz)
  isSameDayAs,               // UTC string + Date → boolean (user tz, REPLACES .getDate())
  getDayRange,               // Date → {start, end} UTC ISO strings (user tz)
  getTodayRange,             // → today's range in UTC ISO strings
  getWeekBoundaries,         // Date → {weekDatesLocal[], weekDatesUtcIso[]}
  isSameDayInTimezone,       // Date + Date → boolean (user tz)
  getWeekDates,              // Date → Date[7] Mon–Sun local midnight
} from '@/shared/utils/datetime'
```

**⚠️ NEVER in FE:**
- `.getHours()` / `.getMinutes()` / `.getDate()` / `.getDay()` directly on a Date — these use **browser system timezone**, not the user's timezone
- `.setHours()` — mutates in system local time (caused the Calendar 9h→2h bug)
- `new Date(isoString).getHours()` — parses ISO correctly but then uses system local to extract hours
- `isSameDayInTimezone` with undefined timezone — always pass `timezone` explicitly
- Direct `Intl.DateTimeFormat` without `{ timeZone }` — implicit browser system tz

**✅ ALWAYS in FE:**
- Use `Intl.DateTimeFormat(..., { timeZone: userTz })` for any display or comparison
- Use `new Date(year, month, day, h, min, s, ms)` to construct dates from picker values (interprets args as local time)
- Use `buildUtcIsoStringFromDate(date, hour, min)` to create UTC ISO from picker values
- Always pass `timezone` explicitly — no hidden fallback in domain utilities

**React Components:** Use `useTimezone()` hook (reactive — auto-updates when user changes timezone):
```typescript
const { timezone, formatTime, isToday, getWeekBoundaries, getHourMinute } = useTimezone();
```

**Non-React code:** Import directly from `@/shared/utils/datetime`.

---

#### Frontend vs Backend: Data Flow

```
User picks: 2026-04-13, time 09:00 (in Asia/Ho_Chi_Minh, UTC+7)

FE (picker → API):
  buildUtcIsoStringFromDate(datePickerDate, 9, 0)
  → "2026-04-13T02:00:00Z"   ← correct! 9am UTC+7 = 2am UTC

BE (API → DB):
  ensure_aware_utc(datetime) → datetime in UTC
  ensure_naive_utc(...) → naive UTC for MongoDB
  → stored as 2026-04-13 02:00:00 (naive, UTC)

BE → FE (API response):
  "start_datetime": "2026-04-13T02:00:00Z"

FE (display):
  formatTime("2026-04-13T02:00:00Z", "Asia/Ho_Chi_Minh")
  → "09:00"   ← correct!
```

### Backend `shared/` Conventions

`backend/shared/` là nơi duy nhất cho mọi platform-wide code. **Không được** đặt constants, status values, hay schemas ở nơi khác.

| File | Chứa |
|------|-------|
| `shared/enums.py` | Platform-wide `Literal` types, string constants (VD: `InstallationStatus`, `ChatEventType`, `WidgetSize`). **KHÔNG** chứa plugin-specific types. |
| `shared/schemas.py` | Pydantic schemas dùng chung (request/response body) |
| `shared/interfaces.py` | Python `Protocol` definitions |

**Rules:**
- **Plugin-specific types** (VD: `EventType`, `TaskStatus`, `TransactionType`, `RecurrenceFrequency`) → để trong `apps/{app_id}/enums.py`. Mỗi plugin tự sở hữu các type của nó, không shared ra ngoài.
- **Mọi status/string constant dùng chung phải vào `shared/enums.py`** — không đặt trong route file hay service file dưới dạng module-level constant
- **API response status** (`"already_installed"`, `"new"`, `"reactivated"`) là platform-wide vì frontend/caller phụ thuộc vào giá trị này → `shared/enums.py`
- **DB model status** (`"active"`, `"disabled"`) → cũng là platform-wide Literal type → `shared/enums.py`
- **Khi tạo constant mới, hỏi trước:** constant này có dùng chung không? Nếu có → `shared/enums.py`. Nếu chỉ dùng trong 1 app → để trong `apps/{app_id}/enums.py`.

**Naming convention cho `shared/enums.py`:**
- `Literal` types → `PascalCase` (VD: `InstallationStatus`, `ChatEventType`, `WidgetSize`)
- `frozenset` / `dict` constants → `SCREAMING_SNAKE_CASE` (VD: `INSTALLATION_STATUSES`, `WIDGET_SIZES`, `VALID_WIDGET_SIZES`)
- String value constants → `SCREAMING_SNAKE_CASE` với prefix theo domain (VD: `INSTALL_STATUS_*`, `CHAT_EVENT_*`)

**Plugin `enums.py` conventions:**
- Mỗi plugin có `apps/{app_id}/enums.py` chứa các type riêng của plugin
- Plugin **không bao giờ** import từ `shared/enums.py` về plugin-specific type
- Plugin **không bao giờ** export type để plugin khác import

### Python Code Style

- **Module-level constants** (VD: `MAX_HISTORY_MESSAGES`, `MAX_CACHED_GRAPHS`) phải đặt **SAU các import statements**, sau `logger = logging.getLogger(__name__)`. Không đặt constants giữa `from __future__` và các import khác — gây ruff E402.
- **Mutable default arguments** (`=[]`, `={}`) → dùng `None` + `= models or []` bên trong function. Đây là Python footgun phổ biến.
- **Thứ tự import** — theo ruff `isort` (Stdlib → Third-party → First-party): `from __future__ import annotations` → stdlib → third-party (`beanie`, `fastapi`, `langchain`) → relative (`from core.`, `from shared.`) → sibling (`from .`)
- **Hạn chế inline import** — import thư viện ở đầu file, không import bên trong function trừ khi cần tránh circular dependency. Nếu thấy cần inline import → kiểm tra lại architecture.

### Plugin Development

1. **Backend là source of truth** — manifest (icon, color, name, widgets), schemas, types đều bắt nguồn từ đây
2. **Frontend tự động** — Không cần đăng ký thủ công, chỉ cần tạo folder trong `src/apps/{app_id}/`
3. **Categories tự động đăng ký** — App đăng ký category qua `manifest.category`, metadata lấy từ app (color, icon). API `/api/catalog/categories` trả về tất cả categories đã đăng ký.
4. **App ID format:** `app_id` chỉ được dùng lowercase letters + digits theo regex `^[a-z][a-z0-9]*$` (vd: `finance`, `todo`, `health2`). Không dùng `-`, `_`, khoảng trắng, hoặc PascalCase.
5. **Tool public naming:** mọi public tool name phải theo mẫu `{app_id}_{action}` (vd: `finance_add_transaction`) và phải được khai báo explicit bằng `@tool("...")` hoặc wrapper tương đương. Không dựa vào Python function name để suy ra public tool name.
6. **Widget ID:** `{app_id}.{kebab-name}` (vd: `finance.total-balance`)
7. **Folder name phải khớp manifest.id**
8. **Phải có:** `register_plugin()` trong `__init__.py` (backend)

### API Schema Naming

- `*Request` = request body gửi từ FE lên BE.
- `*Read` = resource DTO trả về từ API cho một entity/domain object.
- `*Response` = response object tổng hợp/envelope/KPI payload, không phải một entity thuần.
- Với plugin/subapp, schema phải globally unique theo mẫu `{App}{Entity}{Suffix}`.
- Ví dụ đúng: `TodoTaskRead`, `CalendarEventRead`, `FinanceWalletRead`, `FinanceCreateTransactionRequest`.
- Không để generator phải tạo tên fallback kiểu `apps__foo__...`; nếu thấy xuất hiện, phải đổi tên schema ở BE rồi regenerate.
- Với scaffold/plugin mới, chọn `app_id` trước rồi dẫn xuất tên public khác từ đó; không cố encode punctuation vào `app_id` để rồi phải sanitize ở tool/schema/function name.

### Frontend

1. **Auto-discovery** — `src/lib/discovery.ts` dùng Vite glob import để tự động phát hiện tất cả apps qua `src/apps/*/AppView.tsx` và `src/apps/*/DashboardWidget.tsx`. Không cần `index.ts`.
2. **Không tạo frontend manifest mirror** — FE không được giữ `manifest.json` hay bất kỳ app metadata mirror nào cho `id/name/widgets/size`. Các giá trị này thuộc BE manifest và phải đi qua codegen/runtime payload.
3. **AppView.tsx** phải thin — chỉ orchestration, delegate xuống `views/`
4. **DashboardWidget.tsx là generated** — file này được sinh từ backend manifest + convention tên component widget. Không edit tay.
5. **KHÔNG dùng** `registerWidget()` side-effect pattern (đã deprecated)
6. **KHÔNG edit** `frontend/src/types/generated/*` (auto-generated)
7. **Luôn dùng** design tokens từ `globals.css` (oklch colors)
8. **Icons** — Dùng `DynamicIcon` từ `icon-resolver.ts` để render icons động từ tên (backend cung cấp)
9. **SWR Hooks** — Mỗi app tự tạo hooks trong `hooks/` folder, import shared config từ `@/lib/swr`
10. **Platform code KHÔNG import từ apps** — `src/lib/`, `src/components/`, `src/hooks/` (trừ `useAuth`) không được import từ `src/apps/`. Chỉ `src/shared/` được phép.
11. **`src/shared/` structure:** `shared/utils/` cho pure functions, `shared/hooks/` cho React hooks. Chỉ chứa code hoàn toàn không có app-specific logic.
12. **Generated type access pattern** — FE app code phải import type qua facade `@/types/generated` (index ổn định), không import trực tiếp `@/types/generated/api` trừ khi đang sửa codegen.
13. **Subapp API facade là generated** — `frontend/src/apps/{app_id}/api.ts` là file auto-generated từ OpenAPI qua `scripts/codegen.py`. Không edit tay file này. Nếu thiếu route/type/sai signature, sửa BE annotation/schema rồi regenerate.
14. **Không code tay contract type** — FE không được tự định nghĩa lại BE contract dưới dạng `interface/type` thủ công trong app code. Request/response/resource DTO phải lấy từ generated sources (`src/apps/{app_id}/api.ts` hoặc `@/types/generated`).
15. **Chỉ cho phép local UI-only types** — Type viết tay trong app chỉ được dùng cho props/state/view-model/computed data không tồn tại ở BE. Nếu shape đó đã có trong OpenAPI thì phải dùng generated type.
16. **Operation params cũng đi theo codegen** — Query/path/body contract của subapp phải đi qua generated app API client; không tự dựng shape request rời rạc ở component/hook nếu có thể import từ generated facade.
17. **Generated dashboard binding** — Map `widget_id -> component` của mỗi app không được code tay. `frontend/src/apps/{app_id}/DashboardWidget.tsx` phải do codegen sinh từ backend manifest. Muốn thêm widget mới: thêm widget vào BE manifest rồi tạo component đúng convention tên file trong `src/apps/{app_id}/widgets/`.
18. **Widget component naming convention** — Với widget id `{app_id}.{kebab-name}`, component FE phải ở `src/apps/{app_id}/widgets/{PascalCase(kebab-name)}Widget.tsx`. Ví dụ `calendar.month-view` -> `MonthViewWidget.tsx`.
19. **Platform CLI/validator không được phụ thuộc frontend mirrors** — `scripts/codegen.py` và `scripts/superin.py manifests validate` phải suy ra app/widget từ BE manifest + file structure hiện tại, không đọc `frontend/src/apps/{app_id}/manifest.json`.

### Anti-Regression Notes (Cập nhật bắt buộc)

**Khi phát hiện lỗi kiến trúc/contract mới, thêm note ngắn vào section này dưới dạng quy tắc chuẩn phải tuân theo — không mô tả lịch sử lỗi.**

- `PATCH`/`PUT` endpoint phải nhận request schema rõ ràng; không encode request body thành query params rời cho domain update chính.
- Mọi BE schema public phải có tên globally unique theo mẫu `{App}{Entity}{Suffix}`.
- Public tool names phải được pin explicit bằng `@tool("...")`; Python function name chỉ là implementation detail.
- Root agent chỉ được expose tool của app đã cài; nếu bước resolve installed-app thất bại thì phải fail-closed.
- **`routes.py` datetime range → BE service:** Luôn convert user-local datetime sang UTC (`.astimezone(UTC)`) TRƯỚC khi truyền vào service layer. Không bao giờ truyền aware-local datetime trực tiếp.
- **Tạo event từ picker (FE → BE):** Luôn dùng `new Date(year, month, day, h, min)` constructor (interpret as local) rồi `.toISOString()`. KHÔNG dùng `.setHours()` trên Date object.
- **Hour extraction từ UTC string:** Luôn dùng `getHourMinute(utc, tz)` hoặc `Intl.DateTimeFormat(..., { timeZone: tz })`. KHÔNG dùng `.getHours()` trực tiếp — nó dùng browser system timezone.
- **Event model storage:** `Event.start_datetime`/`end_datetime` luôn là naive UTC. Mọi incoming datetime (aware any tz, naive, ISO string) phải đi qua `ensure_naive_utc(ensure_aware_utc(dt))` ở service layer và model validator.
- **`to_naive_datetime()` assumptions:** Chỉ gọi `to_naive_datetime()` / `ensure_naive_utc()` trên datetimes mà đã biết là UTC (aware hoặc naive-labeled-UTC). Không dùng trên local-time naive datetimes.
- **Week range query:** Luôn dùng `getWeekBoundaries(date, tz)` từ `@/shared/utils/datetime` — trả cả `weekDatesLocal[]` (grid columns) và `weekDatesUtcIso[]` (API query).

### Chat/Agent

1. **Frontend chỉ thấy** root-level tools (`ask_finance`, `ask_todo`)
2. **Child-internal tools** (vd: `finance_list_wallets`) phải ẩn khỏi UI
3. **Tool results** phải là structured objects, không phải plain text
4. **Mọi app tool** phải dùng `safe_tool_call()` để convert errors thành tool results
5. **Root agent tool scoping phải fail-closed** — Nếu không xác minh được installed apps thì chỉ expose platform-safe tools, không bao giờ fallback sang toàn bộ `ask_*` tools.
6. **Persisted agent history phải scope theo user + thread** — Không query hay replay history chỉ dựa trên `thread_id`.

---

## 7. Design System Tokens

### Colors (oklch — từ `globals.css`)

```css
--color-primary:    oklch(0.65 0.21 280);   /* Purple */
--color-success:    oklch(0.72 0.19 145);   /* Green */
--color-danger:     oklch(0.63 0.24 25);    /* Red */
--color-warning:    oklch(0.75 0.18 75);    /* Orange */
--color-background: oklch(0.14 0.01 265);  /* Dark bg */
--color-surface:    oklch(0.18 0.01 265);  /* Card bg */
--color-foreground: oklch(0.95 0.01 265);   /* Text */
--color-muted:      oklch(0.55 0.02 265);   /* Secondary text */
--color-border:     oklch(0.28 0.02 265);  /* Borders */
```

### Widget CSS Classes

```css
.widget-card            /* Container */
.widget-size-compact    /* 4 cols */
.widget-size-standard   /* 6 cols */
.widget-size-wide       /* 8 cols */
.widget-size-tall      /* 6 cols, taller */
.widget-size-full      /* 12 cols */
.stat-value            /* KPI numbers */
.section-label         /* UPPERCASE headers */
```

---

## 8. Checklist Trước Khi Commit

- [ ] `npm run codegen` (nếu đổi schema)
- [ ] `npm run validate:manifests` pass
- [ ] `npm run superin -- db check-indexes` pass
- [ ] `ruff check backend` pass
- [ ] `cd frontend && npx eslint --fix --max-warnings 0` pass
- [ ] `cd frontend && npm run build` pass
- [ ] Component > 100 lines → đã tách sub-component
- [ ] Props có TypeScript interface (không any)
- [ ] Tool dùng `safe_tool_call()`
- [ ] Widget ID format đúng `{app_id}.{name}`
- [ ] Backend/frontend widget sizes khớp nhau
- [ ] Shared constants → đã vào `shared/enums.py` (platform-wide) hoặc `apps/{app_id}/enums.py` (plugin-specific) chưa? (xem section 6)
- [ ] Module-level constants → đặt sau imports và `logger` chưa?
- [ ] Mọi plugin route có `response_model` + request/response schema đầy đủ chưa (không để OpenAPI `unknown`)?
- [ ] FE type import đã đi qua `@/types/generated` facade chưa (không import trực tiếp `@/types/generated/api`)?
- [ ] `git commit --no-verify` chỉ dùng khi lint-staged/ESLint config bị lỗi — KHÔNG dùng để skip tất cả hooks
- [ ] Datetime review: new datetime code dùng đúng util (`@/shared/utils/datetime`, `core/utils/timezone.py`) — không tự tính offset, không dùng `.getHours()` trực tiếp, không dùng `.setHours()`
- [ ] **Sau khi deploy thành công:** commit và push lên **cả 3 repo** (root, backend, frontend) nếu có thay đổi tương ứng

---

## 9. Troubleshooting

### Manifest validation fails
```bash
npm run superin -- manifests validate --verbose
```

### Import errors after codegen
```bash
npm run codegen
```

### Plugin not showing in catalog
- Check `register_plugin()` được gọi trong `__init__.py`
- Check `manifest.id` khớp folder name
- Check `discover_apps()` được gọi trong lifespan

### Category không hiển thị đúng màu/icon
- Check `/api/catalog/categories` trả về đúng metadata (color, icon)
- Categories được auto-discover từ app manifests khi app đăng ký
- Nếu thêm category mới, restart backend để apps re-register

### Frontend app không auto-discover
- Check `src/apps/{app_id}/AppView.tsx` tồn tại
- Check `src/apps/{app_id}/DashboardWidget.tsx` đã được codegen sinh ra
- Nếu vừa đổi BE manifest/routes, chạy lại `npm run codegen`
- Restart dev server để Vite pick up glob import changes

### lint-staged fails on `cd frontend && eslint`
lint-staged runs tasks with `shell: false` by default, so `cd frontend &&` chain fails with ENOENT. Fix: wrap the command in `sh -c` via a function:
```js
"frontend/**/*.{ts,tsx}": [
  (files) => `sh -c 'cd frontend && npx eslint --fix --max-warnings 0 ${files.join(" ")}'`,
  (files) => `sh -c 'cd frontend && npx tsc --noEmit'`,
],
```

### Event hiển thị sai giờ (VD: chọn 9h → hiện 2h)

- FE dùng `.getHours()` trực tiếp → browser system timezone thay vì user timezone → fix: dùng `getHourMinute(utcString, tz)` hoặc `Intl.DateTimeFormat(..., { timeZone: tz })`
- `CalendarScreen.handleCreateEvent` dùng `.setHours()` → shift ngược timezone → fix: dùng `buildUtcIsoStringFromDate(date, hour, min)`
- BE `routes.py` dùng `.astimezone()` không argument → convert sang system local thay vì UTC → fix: dùng `.astimezone(UTC)`
- Xem section "Datetime Conventions" chi tiết.

### Icons không hiển thị
- Check `manifest.icon` trong backend là tên Lucide icon hợp lệ (vd: "Wallet", "Calendar")
- Dùng `DynamicIcon` component thay vì import Lucide icons trực tiếp
- Verify `backend/apps/chat.py` trả về `DataStreamResponse`
- Check `frontend` dùng `useDataStreamRuntime`
- Root agent phải parse `input` và `output.value` đúng

---

## 10. MCP References

### HeroUI v3 (đã cài)
```
mcp__heroui-react__get_component_docs(["Button", "Card", "Input"])
mcp__heroui-react__get_theme_variables
```

### Context7 (assistant-ui docs)
```
mcp__plugin_context7_context7__resolve-library-id
mcp__plugin_context7_context7__query-docs
```

---

## 11. Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`, `db`

**Scopes:** `auth`, `core`, `finance`, `todo`, `calendar`, `chat`, `ui`, `infra`

**Examples:**
```
feat(finance): add transfer between wallets
fix(chat): resolve SSE stream timeout
docs: update plugin development guide
```
