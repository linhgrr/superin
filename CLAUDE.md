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
- **Platform code** (core/, shared/) KHÔNG ĐƯỢC import từ bất kỳ app nào trong `apps/`

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

1. **Platform agnostic to Apps** — Platform code (`src/lib/`, `src/components/`, `backend/core/`, `backend/shared/`) KHÔNG ĐƯỢC import từ bất kỳ app nào
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

**Backend lưu UTC, hiển thị theo user timezone.** Mọi tính toán date/time phải đi qua timezone context — không dùng `datetime.now()` trực tiếp (nếu cần lấy UTC global, hãy dùng `core.models.utc_now()`).

- **Backend (User Time):** Dùng `get_user_timezone_context(user)` từ `core/timezone.py`. Luôn dùng `ctx.now_utc()` hoặc `ctx.now_local()`. Dùng `ctx.today_range()`, `ctx.month_range()` cho date-range queries (due date, "income this month").
- **Backend (Database/MongoDB):** Beanie/Motor mặc định thỉnh thoảng biến Datetime mất timezone (thành Naive). Rất dễ bị crash `TypeError: can't compare offset-naive and offset-aware datetimes`.
  - Luôn sử dụng `ensure_aware_utc(dt)` (từ `core.utils.timezone`) để gắn lại múi giờ UTC nếu nghi ngờ dt lấy từ MongoDB lên bị mất múi giờ.
  - Khi cần query MongoDB thủ công bằng range filter, dùng `ensure_naive_utc(dt)` để gỡ tzinfo gởi xuống DB để compare chính xác.
- **Frontend:** Dùng `shared/utils/timezone.ts` để convert UTC → local khi hiển thị. Không tính toán timezone ở FE — chỉ convert để hiển thị, logic nghiệp vụ luôn ở BE.

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
