# Shin SuperApp — Claude Reference

> **Dự án:** Shin SuperApp v2.1 — Plugin-based SuperApp platform
> **Tech Stack:** React 19 + Vite + FastAPI + Beanie + LangGraph + assistant-ui

---

## 1. Project Overview

Shin SuperApp là nền tảng plugin-based với:
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
- Auto-discovery qua Vite glob import trong `src/apps/index.ts`
- Không cần import thủ công từng app — hệ thống tự tìm tất cả `src/apps/*/index.ts`
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
- Registry (`src/apps/index.ts`) tự động cập nhật không cần regenerate

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

## 3. Key Documentation Files

| File | Purpose | Đọc khi nào |
|------|---------|-------------|
| `docs/ARCHITECTURE.md` | System overview | Bắt đầu task mới |
| `docs/IMPLEMENTATION_PLAN.md` | Master task list | Tìm file cần sửa |
| `docs/PLUGIN_DEVELOPMENT_GUIDE.md` | Làm app mới | Tạo plugin mới |
| `docs/INTERFACES.md` | Type contracts | Schema/API changes |
| `docs/API_CONVENTIONS.md` | REST patterns | Backend routes |
| `docs/PAGE_ARCHITECTURE.md` | Frontend structure | UI/page changes |
| `docs/COMPONENT_STANDARDS.md` | React patterns | Component work |
| `docs/WORKFLOW.md` | Dev workflow | Tra cứu kỹ thuật |
| `docs/ASSISTANT_UI_INTEGRATION.md` | Chat streaming | Chat/SSE work |

---

## 4. Critical File Locations

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
│   │   ├── manifest.json    # Frontend mirror
│   │   ├── index.ts         # FrontendAppDefinition (export default)
│   │   ├── AppView.tsx      # Thin orchestration
│   │   ├── DashboardWidget.tsx  # Widget dispatcher
│   │   ├── api.ts           # App API client
│   │   ├── views/           # Screen composition
│   │   ├── widgets/         # Individual widgets
│   │   ├── features/        # Domain slices
│   │   └── components/      # App-local UI
│   ├── components/
│   │   ├── dashboard/       # WidgetGrid, AppShell
│   │   ├── chat/            # ChatThread
│   │   └── providers/       # AppProviders
│   ├── lib/                 # Utilities
│   │   └── icon-resolver.ts # Dynamic Lucide icon resolver
│   ├── pages/               # DashboardPage, StorePage, etc.
│   └── types/generated/     # Auto-generated (KHÔNG edit)
└── src/app/globals.css       # Design tokens
```

---

## 5. Widget Size Contract

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

## 6. Essential Commands

```bash
# Codegen (chạy sau khi đổi Pydantic schema)
python scripts/superin.py codegen

# Validate manifests
python scripts/superin.py manifests validate

# Validate core Mongo index contract
python scripts/superin.py db check-indexes

# Reconcile core Mongo indexes (run once when index names/uniqueness change)
python scripts/superin.py db migrate-indexes

# Tạo plugin mới
python scripts/superin.py plugin create {app_id}

# Sync frontend từ backend manifest (auto-detect từ Vite glob)
python scripts/superin.py plugin sync-fe {app_id}

# Sync tất cả apps
python scripts/superin.py plugin sync-fe --all

# Dev server
python scripts/superin.py dev          # Backend + Frontend
npm run dev                            # Frontend only

# Verify (trước khi commit contract-sensitive changes)
python scripts/superin.py codegen
python scripts/superin.py db check-indexes
python scripts/superin.py manifests validate
ruff check backend
npm run build:frontend
```

---

## 7. Development Rules

### ⚠️ ABSOLUTE RULES - Never Violate

1. **Platform agnostic to Apps** — Platform code (`src/lib/`, `src/components/`, `backend/core/`, `backend/shared/`) KHÔNG ĐƯỢC import từ bất kỳ app nào
2. **App containment** — Mỗi app chứa tất cả code của mình trong `src/apps/{app_id}/`
3. **Apps có thể import từ nhau** — Cross-app integration được phép (vd: calendar import từ todo)
4. **`src/shared/` là cầu nối hợp lệ** — `shared/utils/` và `shared/hooks/` dành cho pure utilities (timezone, formatters). Apps được phép import từ đây. Không bao giờ để app-specific logic ở `shared/`.
5. **Backend là source of truth** — manifest (icon, color, name, widgets), schemas, types đều bắt nguồn từ đây
6. **TUYỆT ĐỐI KHÔNG silent catch** — Không bao giờ dùng `.catch(() => {})`, `except: pass`, hoặc bất kỳ nhánh bắt lỗi nào nuốt lỗi im lặng. Mọi lỗi phải được log rõ ràng (`console.error`, logger) hoặc chuyển thành error/result có cấu trúc.

### Backend `shared/` Conventions

`backend/shared/` là nơi duy nhất cho mọi platform-wide code. **Không được** đặt constants, status values, hay schemas ở nơi khác.

| File | Chứa |
|------|-------|
| `shared/enums.py` | Tất cả `Literal` types, string constants, status values, platform-wide constants (VD: `INSTALL_STATUS_ALREADY_INSTALLED`, `InstallationStatus`, `ChatEventType`) |
| `shared/schemas.py` | Pydantic schemas dùng chung (request/response body) |
| `shared/interfaces.py` | Python `Protocol` definitions |

**Rules:**
- **Mọi status/string constant dùng chung phải vào `shared/enums.py`** — không đặt trong route file hay service file dưới dạng module-level constant
- **API response status** (`"already_installed"`, `"new"`, `"reactivated"`) là platform-wide vì frontend/caller phụ thuộc vào giá trị này → `shared/enums.py`
- **DB model status** (`"active"`, `"disabled"`) → cũng là platform-wide Literal type → `shared/enums.py`
- **Khi tạo constant mới, hỏi trước:** constant này có dùng chung không? Nếu có → `shared/enums.py`. Nếu chỉ dùng trong 1 app → để trong app đó.

**Naming convention cho `shared/enums.py`:**
- `Literal` types → `PascalCase` (VD: `InstallationStatus`, `ChatEventType`, `WidgetSize`)
- `frozenset` / `dict` constants → `SCREAMING_SNAKE_CASE` (VD: `INSTALLATION_STATUSES`, `WIDGET_SIZES`, `VALID_WIDGET_SIZES`)
- String value constants → `SCREAMING_SNAKE_CASE` với prefix theo domain (VD: `INSTALL_STATUS_*`, `CHAT_EVENT_*`)

### Python Code Style

- **Module-level constants** (VD: `MAX_HISTORY_MESSAGES`, `MAX_CACHED_GRAPHS`) phải đặt **SAU các import statements**, sau `logger = logging.getLogger(__name__)`. Không đặt constants giữa `from __future__` và các import khác — gây ruff E402.
- **Mutable default arguments** (`=[]`, `={}`) → dùng `None` + `= models or []` bên trong function. Đây là Python footgun phổ biến.
- **Thứ tự import** — theo ruff `isort` (Stdlib → Third-party → First-party): `from __future__ import annotations` → stdlib → third-party (`beanie`, `fastapi`, `langchain`) → relative (`from core.`, `from shared.`) → sibling (`from .`)
- **Hạn chế inline import** — import thư viện ở đầu file, không import bên trong function trừ khi cần tránh circular dependency. Nếu thấy cần inline import → kiểm tra lại architecture.

### Plugin Development

1. **Backend là source of truth** — manifest (icon, color, name, widgets), schemas, types đều bắt nguồn từ đây
2. **Frontend tự động** — Không cần đăng ký thủ công, chỉ cần tạo folder trong `src/apps/{app_id}/`
3. **Categories tự động đăng ký** — App đăng ký category qua `manifest.category`, metadata lấy từ app (color, icon). API `/api/catalog/categories` trả về tất cả categories đã đăng ký.
4. **Tool naming:** `{app_id}_{action}` (vd: `finance_add_transaction`)
5. **Widget ID:** `{app_id}.{kebab-name}` (vd: `finance.total-balance`)
6. **Folder name phải khớp manifest.id**
7. **Phải có:** `register_plugin()` trong `__init__.py` (backend)

### Frontend

1. **Auto-discovery** — `src/apps/index.ts` dùng Vite glob import để tự động phát hiện tất cả apps trong `src/apps/*/index.ts`. Không cần import thủ công.
2. **Export pattern** — Mỗi app phải `export default` một `FrontendAppDefinition` object:
   ```typescript
   const myApp = { manifest, AppView, DashboardWidget } satisfies FrontendAppDefinition;
   export default myApp;
   ```
3. **AppView.tsx** phải thin — chỉ orchestration, delegate xuống `views/`
4. **DashboardWidget.tsx** phải thin — chỉ dispatch, delegate xuống `widgets/`
5. **KHÔNG dùng** `registerWidget()` side-effect pattern (đã deprecated)
6. **KHÔNG edit** `frontend/src/types/generated/*` (auto-generated)
7. **Luôn dùng** design tokens từ `globals.css` (oklch colors)
8. **Icons** — Dùng `DynamicIcon` từ `icon-resolver.ts` để render icons động từ tên (backend cung cấp)
9. **SWR Hooks** — Mỗi app tự tạo hooks trong `hooks/` folder, import shared config từ `@/lib/swr`
10. **Platform code KHÔNG import từ apps** — `src/lib/`, `src/components/`, `src/hooks/` (trừ `useAuth`) không được import từ `src/apps/`. Chỉ `src/shared/` được phép.
11. **`src/shared/` structure:** `shared/utils/` cho pure functions, `shared/hooks/` cho React hooks. Chỉ chứa code hoàn toàn không có app-specific logic.

### Chat/Agent

1. **Frontend chỉ thấy** root-level tools (`ask_finance`, `ask_todo`)
2. **Child-internal tools** (vd: `finance_list_wallets`) phải ẩn khỏi UI
3. **Tool results** phải là structured objects, không phải plain text
4. **Mọi app tool** phải dùng `safe_tool_call()` để convert errors thành tool results

---

## 8. Design System Tokens

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

## 9. Checklist Trước Khi Commit

- [ ] `python scripts/superin.py codegen` (nếu đổi schema)
- [ ] `python scripts/superin.py manifests validate` pass
- [ ] `ruff check backend` pass
- [ ] `npm run build:frontend` pass
- [ ] Component > 100 lines → đã tách sub-component
- [ ] Props có TypeScript interface (không any)
- [ ] Tool dùng `safe_tool_call()`
- [ ] Widget ID format đúng `{app_id}.{name}`
- [ ] Backend/frontend widget sizes khớp nhau
- [ ] Shared constants → đã vào `shared/enums.py` chưa? (xem section 7)
- [ ] Module-level constants → đặt sau imports và `logger` chưa?
- [ ] `git commit --no-verify` chỉ dùng khi lint-staged/ESLint config bị lỗi — KHÔNG dùng để skip tất cả hooks

---

## 10. Recent Active Plans

### Calendar App (2026-04-01)
- **Location:** `docs/plans/2026-04-01-calendar-implementation.md`
- **Status:** Ready for implementation
- **Features:** Events, recurring patterns, Todo integration, conflict detection
- **Tools:** 10 consolidated tools

### Auth + Payment + Admin (2026-03-31)
- **Location:** `docs/plans/2026-03-31-auth-payment-admin-design.md`
- **Status:** Design approved
- **Features:** Role-based auth, PayOS + Stripe, Admin dashboard

### Frontend Sub-App Refactor (2026-03-31)
- **Location:** `docs/plans/2026-03-31-frontend-subapp-refactor-checklist.md`
- **Status:** Phase 2-3 completed
- **Goal:** Tách `AppView.tsx` và `DashboardWidget.tsx` thành thin orchestration

---

## 11. Troubleshooting

### Manifest validation fails
```bash
# Check backend/frontend widget IDs match
python scripts/superin.py manifests validate --verbose
```

### Import errors after codegen
```bash
# Regenerate types
python scripts/superin.py codegen
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
- Check `src/apps/{app_id}/index.ts` tồn tại và có `export default`
- Check file có export đúng kiểu `FrontendAppDefinition`
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

## 12. MCP References

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

## 13. Commit Message Format

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
