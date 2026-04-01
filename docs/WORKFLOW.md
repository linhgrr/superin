# Developer Workflow & File Navigation Guide

> **Mục tiêu:** Biết đọc file nào trước, tra cứu ở đâu, hỏi ai (MCP/skill nào).

---

## 1. Thứ Tự Đọc Khi Bắt Đầu Task Mới

### Bước 1: Đọc task overview

```
docs/
├── IMPLEMENTATION_PLAN.md       ← Đọc TRƯỚC TIÊN — task list + file index
├── ARCHITECTURE.md             ← System overview
├── PAGE_ARCHITECTURE.md        ← Nếu làm UI/page
├── API_CONVENTIONS.md          ← Backend REST endpoints
├── COMPONENT_STANDARDS.md       ← Frontend component patterns
├── INTERFACES.md                ← Type contracts
├── PLUGIN_DEVELOPMENT_GUIDE.md ← Khi thêm plugin mới
├── ASSISTANT_UI_INTEGRATION.md ← Khi làm chat/streaming
└── WORKFLOW.md (this file)     ← Mọi lúc
```

---

## 2. Tra Cứu Design System

### 2.1 CSS Design Tokens

```
frontend/src/app/globals.css
```

Tìm `@theme` block — tất cả design tokens ở đó:

```css
@theme {
  --color-primary:    oklch(0.65 0.21 280);
  --color-success:    oklch(0.72 0.19 145);
  --color-danger:     oklch(0.63 0.24 25);
  --color-background: oklch(0.14 0.01 265);
  /* ... */
}
```

### 2.2 Shared Components

```
frontend/src/components/ui/design-system.tsx
```

Các component đã có sẵn:

| Component | Props | Dùng khi |
|-----------|-------|-----------|
| `StatCard` | `label, value, icon?, trend?` | KPI widgets |
| `SectionHeader` | `title, action?` | List/table headers |

### 2.3 Shared CSS Classes

Tìm trong `globals.css`:

```css
.widget-card       /* Widget container */
.stat-value        /* KPI numbers */
.amount-positive   /* Income/green */
.amount-negative  /* Expense/red */
.section-label     /* UPPERCASE section headers */
.widget-size-compact   /* grid-column: span 4 */
.widget-size-standard  /* grid-column: span 6 */
.widget-size-wide      /* grid-column: span 8 */
.widget-size-tall      /* grid-column: span 6, taller */
.widget-size-full      /* grid-column: span 12 */
```

---

## 3. Tra Cứu HeroUI v3

### 3.1 Khi cần biết component props

**Dùng MCP `@heroui/react` (Đã cài):**

```bash
# List all available v3 components
→ mcp__heroui-react__list_components

# Get full docs (props, usage, examples)
→ mcp__heroui-react__get_component_docs(["Button", "Card", "Input"])

# Get CSS styles + BEM classes
→ mcp__heroui-react__get_component_source_styles(["Button"])

# Get actual React source code
→ mcp__heroui-react__get_component_source_code(["Button"])
```

### 3.2 Khi cần theme variables

```bash
→ mcp__heroui-react__get_theme_variables
```

Trả về tất cả theme tokens (colors, typography, spacing, borders) dạng CSS variables.

### 3.3 Khi cần getting started / migration docs

```bash
→ mcp__heroui-react__get_docs("/docs/react/getting-started/theming")
→ mcp__heroui-react__get_docs("/docs/react/getting-started/quick-start")
→ mcp__heroui-react__get_docs("/docs/react/migration")  ← v2 → v3 migration
```

### 3.4 Chú ý quan trọng

- **Dùng v3 docs từ `v3.heroui.com`** — không phải heroui.com (v2)
- **Compound components** thay đổi API từ v2 → v3
- **Không dùng `tailwind.config.js`** — v3 dùng `@theme` trong CSS (Tailwind v4)

---

## 4. Tra Cứu assistant-ui

### 4.1 Official docs online

- Full docs: https://www.assistant-ui.com/llms-full.txt
- Quick reference: https://www.assistant-ui.com/llms.txt

### 4.2 Khi cần tích hợp chat streaming

```bash
# assistant-ui integration spec đã có sẵn
→ docs/ASSISTANT_UI_INTEGRATION.md
```

### 4.3 Khi cần tìm specific patterns

Dùng Context7 MCP:

```bash
# Resolve library ID trước
→ mcp__plugin_context7_context7__resolve-library-id(
    query="assistant-ui data stream SSE FastAPI",
    libraryName="assistant-ui"
  )
# → /assistant-ui/assistant-ui

# Query specific topic
→ mcp__plugin_context7_context7__query-docs(
    libraryId="/assistant-ui/assistant-ui",
    query="thread component auto-scroll multi-turn streaming"
  )
```

### 4.4 Cần biết

- **Transport:** Dùng `useDataStreamRuntime` (SSE) — không phải AI SDK
- **Tools:** Server-side (LangGraph) — không có `execute:` trong tool def
- **Dark mode:** Custom CSS — không built-in
- **Auto-scroll:** Built-in, `autoScroll={true}` default

---

## 5. Tra Cứu Backend

### 5.1 Core platform files

```
backend/core/
├── main.py         ← FastAPI app + lifespan startup
├── config.py       ← Settings từ env
├── db.py           ← Beanie init + connection
├── auth.py         ← JWT utils, get_current_user
├── registry.py     ← PLUGIN_REGISTRY
├── discovery.py     ← discover_apps()
├── verify.py       ← Startup plugin verification
└── agents/
    └── root.py     ← LangGraph RootAgent
```

### 5.2 Khi thêm plugin mới

```
backend/apps/{appId}/
├── __init__.py     ← register_plugin() — QUAN TRỌNG
├── manifest.py     ← AppManifestSchema
├── models.py       ← Beanie Document classes
├── agent.py        ← LangGraph agent + tools
├── routes.py       ← FastAPI router
└── schemas.py      ← App-specific Pydantic schemas
```

### 5.3 Shared schemas

```
backend/shared/
├── schemas.py      ← Pydantic schemas (single source of truth)
└── interfaces.py   ← Python Protocol definitions
```

---

## 6. Tra Cứu Frontend

### 6.1 Entry points

```
frontend/src/
├── main.tsx         ← App entry
├── App.tsx          ← Router setup
├── app/
│   ├── layout.tsx   ← Root layout
│   └── globals.css  ← Design tokens + CSS classes
├── api/
│   ├── client.ts    ← Fetch wrapper + JWT
│   ├── auth.ts
│   ├── catalog.ts
│   └── apps.ts
└── types/
    └── generated/   ← Generated từ backend schemas (codegen)
```

### 6.2 App structure

```
frontend/src/apps/{appId}/
├── layout.tsx       ← AppLayout (AppShell + AppNav) — BẮT BUỘC
├── AppNav.tsx       ← Navigation tabs
├── pages/
│   ├── {App}Overview.tsx
│   ├── {Entity}Page.tsx
│   └── ...
└── widgets/
    ├── {Widget}.tsx
    └── index.ts     ← registerWidget() calls
```

### 6.3 Shared components

```
frontend/src/components/
├── dashboard/
│   ├── AppShell.tsx     ← 3-column grid layout (shared)
│   ├── AppList.tsx      ← Sidebar app list
│   ├── WidgetGrid.tsx   ← 12-col widget renderer
│   └── WidgetManager.tsx
├── chat/
│   └── ChatThread.tsx   ← assistant-ui Thread
└── ui/
    └── design-system.tsx ← StatCard, SectionHeader
```

---

## 7. Tra Cứu Skill Documentation

### 7.1 Cách gọi skill

Dùng `/` slash command hoặc `Skill` tool:

```
/brainstorming    ← Khi cần thiết kế tính năng mới
/ship             ← Khi bắt đầu implement
/codex           ← Codex operations
/qa              ← Quality assurance
/review          ← Code review
/setup-deploy    ← Deploy setup
```

### 7.2 Khi nào dùng skill nào

| Tình huống | Skill |
|------------|-------|
| Thiết kế tính năng mới từ đầu | `/brainstorming` → `/writing-plans` |
| Bắt đầu implement từ plan | `/ship` |
| Review code đã viết | `/review` |
| Deploy lên Vercel / HF Spaces | `/setup-deploy` |
| QA toàn bộ feature | `/qa` |
| Điều tra bug | `/investigate` |

### 7.3 Superpowers skill directory

```
~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/
├── brainstorming/
├── writing-plans/
├── executing-plans/
├── subagent-driven-development/
├── using-superpowers/
└── ... (other skills)
```

---

## 8. Codegen Workflow

### 8.1 Pipeline

```
FastAPI app → openapi.json → openapi-typescript → frontend/src/types/generated/api.ts
```

Codegen chạy tự động 2 bước:
1. Python (conda env `linhdz`) import FastAPI app → sinh `openapi.json`
2. Node.js `openapi-typescript` generate TypeScript interfaces

### 8.2 Cách chạy

```bash
# Từ repo root — cần conda env linhdz active:
conda run -n linhdz python scripts/codegen.py

# Hoặc nếu đã có openapi.json, chỉ bước TypeScript:
openapi-typescript openapi.json -o frontend/src/types/generated/api.ts
```

### 8.3 Môi trường

Các biến sau được đọc tự động trong `scripts/codegen.py`:
- `MONGODB_URI` — connection string cho MongoDB
- `JWT_SECRET` — secret cho JWT signing
- `OPENAI_API_KEY`, `OPENAI_BASE_URL` — AI config

**Luôn dùng `conda run -n linhdz`** để đảm bảo đúng Python environment với tất cả dependencies.

### 8.4 Khi nào cần chạy lại

```
1. Thêm/sửa Pydantic schema (shared/schemas.py hoặc apps/{app}/schemas.py)
2. Thêm/sửa FastAPI route endpoint
3. Thêm/sửa response_model trong route
```

### 8.5 Generated output

```
frontend/src/types/generated/
└── api.ts     ← Auto-generated — KHÔNG edit tay
```

Frontend import types từ đây:
```typescript
import type {
  AppCatalogEntry,
  CreateTransactionRequest,
  TokenResponse,
} from "@/types/generated/api";
```

### 8.6 Cài đặt dependencies (một lần)

```bash
# Python (đã có trong conda env linhdz)
conda run -n linhdz pip install datamodel-code-generator

# Node.js (global)
npm install -g openapi-typescript
```

---

## 9. Commit Conventions

### 9.1 Format

```
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

**Ví dụ:**
```
feat(finance): add transfer between wallets

Allows moving funds from one wallet to another with balance validation.
Closes #42
```

### 9.2 Type Prefixes

| Type | Dùng khi |
|------|-----------|
| `feat` | Tính năng mới |
| `fix` | Sửa bug |
| `refactor` | Cấu trúc lại code (không đổi behavior) |
| `perf` | Cải thiện performance |
| `test` | Thêm / sửa tests |
| `docs` | Chỉ sửa documentation |
| `chore` | Config, dependency, tooling |
| `build` | Thay đổi build system |
| `ci` | CI/CD pipeline |
| `db` | Migration, schema, seed data |

### 9.3 Scope

Scope là folder/module bị ảnh hưởng. **Không bắt buộc** nhưng khuyến khích dùng.

| Scope | Ý nghĩa |
|-------|---------|
| `auth` | Authentication / JWT |
| `core` | Core platform (registry, discovery, etc.) |
| `finance` | Finance plugin |
| `todo` | Todo plugin |
| `chat` | Chat / streaming |
| `ui` | Frontend UI components |
| `infra` | Deploy, Docker, Vercel |
| `deps` | Dependency changes |

### 9.4 Rules

1. **Imperative mood**: `"add feature"` không phải `"added feature"`
2. **Không dùng emoji prefix** trong commit message (CI lint sẽ reject)
3. **Mỗi commit một concern**: Không gộp nhiều thay đổi không liên quan
4. **Dòng đầu tiên ≤ 72 ký tự**
5. **Body mở rộng khi cần**: Giải thích WHY, không phải WHAT (code đã nói WHAT rồi)
6. **Footer `Closes #issue`** khi commit fix một issue

**Viết đúng:**
```
feat(todo): add due date filter to task list
```

**Viết sai:**
```
feat: add stuff
fix bug
update
WIP
✨ added new feature
```

### 9.5 Implementation

```bash
# Setup (chạy 1 lần)
npm install -D @/commitlint/config-conventional commitlint husky
npx husky init
echo "npx --no -- commitlint --edit \${1}" > .husky/commit-msg
echo "npx --no -- commitlint --from=HEAD~1" > .husky/pre-commit
```

---

## 10. Quick Reference Card

```
Bạn đang làm gì?                          → Đọc ở đâu?
──────────────────────────────────────────────────────────────
Tổng quan hệ thống                       → docs/ARCHITECTURE.md
Làm plugin mới                           → docs/PLUGIN_DEVELOPMENT_GUIDE.md
Implement từ plan                        → docs/IMPLEMENTATION_PLAN.md
Page/layout structure                    → docs/PAGE_ARCHITECTURE.md
Component conventions                    → docs/COMPONENT_STANDARDS.md
REST endpoint conventions                → docs/API_CONVENTIONS.md
Design tokens + CSS                      → frontend/src/app/globals.css
Shared components                        → components/ui/design-system.tsx
HeroUI v3 component props               → @heroui/react MCP (get_component_docs)
assistant-ui chat integration            → docs/ASSISTANT_UI_INTEGRATION.md
assistant-ui specific patterns          → Context7 (mcp__plugin_context7)
Sửa bug / điều tra                     → /investigate skill
Review code                              → /review skill
Deploy                                   → /setup-deploy skill
```
