# Shin SuperApp v2.1 — Implementation Plan

> **For Claude:** Use superpowers:executing-plans to implement task-by-task.
> **Goal:** Complete greenfield rewrite: Next.js → React+Vite + FastAPI + Beanie + assistant-ui.
> **Architecture:** Plugin auto-discovery via importlib, agents in Python (LangGraph), widgets self-fetch from FastAPI REST endpoints, JWT auth with httpOnly refresh cookie, SSE streaming.
> **Tech Stack:** React 19 + Vite + React Router + Tailwind v4 + HeroUI v3 + assistant-ui | FastAPI + LangGraph + Beanie + Motor | MongoDB Atlas | Vercel + HF Spaces

> **Status:** Historical implementation plan. Do not treat this file as the current frontend plugin protocol or contract source-of-truth.
> Current source-of-truth lives in:
> - [docs/ARCHITECTURE.md](/home/linh/Downloads/superin/docs/ARCHITECTURE.md)
> - [docs/PLUGIN_DEVELOPMENT_GUIDE.md](/home/linh/Downloads/superin/docs/PLUGIN_DEVELOPMENT_GUIDE.md)
> - [docs/WORKFLOW.md](/home/linh/Downloads/superin/docs/WORKFLOW.md)
> - [CLAUDE.md](/home/linh/Downloads/superin/CLAUDE.md)
>
> Current rules that supersede older tasks below:
> - frontend app discovery is file-structure based via `AppView.tsx` and generated `DashboardWidget.tsx`
> - frontend must not mirror backend app metadata in `manifest.json`
> - `frontend/src/apps/{app_id}/api.ts` and `DashboardWidget.tsx` are generated files
> - backend schemas/manifests are the only contract source of truth

---

## Phase 1 — Repo Setup & Backend Skeleton

### Task 1: Create repo structure

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/Dockerfile`
- Create: `backend/.gitignore`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/.env.example`
- Create: `frontend/.eslintrc.cjs`
- Create: `frontend/index.html`
- Create: `codegen.config.yaml`
- Create: `.pre-commit-config.yaml`
- Create: `docs/ARCHITECTURE.md` ✓
- Create: `docs/INTERFACES.md` ✓
- Create: `docs/PLUGIN_DEVELOPMENT_GUIDE.md` ✓
- Create: `docs/ASSISTANT_UI_INTEGRATION.md` ✓
- Create: `docs/PAGE_ARCHITECTURE.md` ✓
- Create: `docs/COMPONENT_STANDARDS.md` ✓
- Create: `docs/API_CONVENTIONS.md` ✓
- Create: `docs/WORKFLOW.md` ✓
- Create: `docs/IMPLEMENTATION_PLAN.md` ← task plan

```bash
mkdir -p backend/core backend/shared backend/apps/finance backend/apps/todo
mkdir -p frontend/src/{api,apps,components/{chat,dashboard,layout},hooks,pages,types}
mkdir -p frontend/src/apps/{finance,todo}/{pages,widgets}
mkdir -p frontend/public
mkdir -p scripts
mkdir -p docs/plans
```

### Task 2: Backend core config

**Files:**
- Create: `backend/core/config.py`

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_uri: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    cors_origins: list[str] = ["http://localhost:5173"]
    hf_space: bool = False
```

**Step 1:** `pip install pydantic-settings python-jose passlib python-multipart bcrypt motor beanie fastapi uvicorn langgraph langchain-core langchain-openai sse-starlette`
**Step 2:** Commit: `git add -A && git commit -m "chore: add backend core config"`

---

### Task 3: Database layer (Beanie)

**Files:**
- Create: `backend/core/db.py`
- Create: `backend/core/models.py`

```python
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import Document, init_beanie
from datetime import datetime
from typing import Optional, Literal
from pydantic import EmailStr, Field

class User(Document):
    email: EmailStr
    hashed_password: str
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    settings: dict = {}

class UserAppInstallation(Document):
    user_id: PydanticObjectId
    app_id: str
    status: Literal["active", "disabled"] = "active"
    installed_at: datetime = Field(default_factory=datetime.utcnow)

class WidgetPreference(Document):
    user_id: PydanticObjectId
    widget_id: str  # e.g. "finance.total-balance"
    app_id: str
    enabled: bool = False
    position: int = 0
    config: dict = {}

    class Settings:
        indexes = [[("user_id", 1), ("widget_id", 1)]]  # unique

class TokenBlacklist(Document):
    jti: str
    revoked_at: datetime
    expires_at: datetime

async def init_db():
    client = AsyncIOMotorClient(settings.mongodb_uri)
    await init_beanie(
        database=client["superin"],
        document_models=[User, UserAppInstallation, WidgetPreference, TokenBlacklist],
    )
```

**Step 1:** `pytest tests/core/test_db.py -v` → FAIL (module not found)
**Step 2:** Implement minimal db.py
**Step 3:** `pytest tests/core/test_db.py -v` → PASS
**Step 4:** Commit: `git add backend/core/db.py backend/core/models.py && git commit -m "feat: add Beanie db layer"`

---

### Task 4: Auth system

**Files:**
- Create: `backend/core/security.py` — password hashing utilities
- Create: `backend/core/auth.py` — JWT create/verify + `get_current_user`
- Create: `backend/core/exceptions.py` — custom exceptions
- Create: `backend/core/logging_middleware.py` — request logging

```python
# backend/core/security.py
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

# backend/core/auth.py
from datetime import datetime, timedelta
from jose import JWTError, jwt
from fastapi import HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uuid

security = HTTPBearer()

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode.update({
        "exp": datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes),
        "type": "access",
        "jti": str(uuid.uuid4()),
    })
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode.update({
        "exp": datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days),
        "type": "refresh",
        "jti": str(uuid.uuid4()),
    })
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        jti: str = payload.get("jti")
        if user_id is None or token_type != "access":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED)
        if await TokenBlacklist.find_one(TokenBlacklist.jti == jti):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token revoked")
        return user_id
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED)
```

**Step 1:** `pytest tests/core/test_auth.py -v` → FAIL
**Step 2:** Write security.py + auth.py + exceptions.py + logging_middleware.py
**Step 3:** Wire logging middleware vào main.py: `app.middleware("http")(log_requests)`
**Step 4:** `pytest tests/core/test_auth.py -v` → PASS
**Step 5:** Commit: `git add backend/core/ && git commit -m "feat: add JWT auth system"`

---

### Task 5: Plugin registry & discovery + startup verification

**Files:**
- Create: `backend/core/registry.py`
- Create: `backend/core/discovery.py`
- Create: `backend/core/verify.py`
- Modify: `backend/core/main.py` (add verify call in lifespan)

```python
# backend/core/verify.py
"""
Chạy mỗi lần server start — trước khi accept requests.
errors  → server KHÔNG start.
warnings → server vẫn chạy, log ra.
"""

def verify_plugins() -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    seen_widget_ids: dict[str, str] = {}  # widget_id → app_id
    seen_collection_names: set[str] = set()
    seen_app_ids: list[str] = []

    for app_id, plugin in PLUGIN_REGISTRY.items():
        m = plugin.manifest

        # ── Required manifest fields ────────────────────────────────────────
        if not m.id:
            errors.append(f"[{app_id}] manifest.id is required")
        if not m.name:
            errors.append(f"[{app_id}] manifest.name is required")
        if not m.agent_description:
            warnings.append(f"[{app_id}] manifest.agent_description is empty — RootAgent will skip this app")
        if not m.tools:
            warnings.append(f"[{app_id}] manifest.tools is empty — no agent tools available")
        if not m.widgets:
            warnings.append(f"[{app_id}] has no widgets")

        # ── Widget ID checks ───────────────────────────────────────────────
        for w in m.widgets:
            # Duplicate widget ID across ALL plugins
            if w.id in seen_widget_ids:
                errors.append(
                    f"[{app_id}] duplicate widget id '{w.id}' — already in '{seen_widget_ids[w.id]}'"
                )
            seen_widget_ids[w.id] = app_id

            # Format: {app_id}.{kebab-name}
            expected_prefix = f"{app_id}."
            if not w.id.startswith(expected_prefix):
                errors.append(
                    f"[{app_id}] widget '{w.id}' must start with '{expected_prefix}'"
                )

            # Valid size
            valid_sizes = {"small", "medium", "large", "full-width"}
            if w.size not in valid_sizes:
                errors.append(
                    f"[{app_id}] widget '{w.id}' has invalid size '{w.size}' — must be one of {valid_sizes}"
                )

            # Config field types (if present)
            for field in (w.config_fields or []):
                valid_types = {"text", "select", "date-range", "number", "toggle"}
                if field.type not in valid_types:
                    errors.append(
                        f"[{app_id}] widget '{w.id}' config field '{field.name}' has invalid type '{field.type}'"
                    )
                if field.type == "select" and not field.options:
                    warnings.append(
                        f"[{app_id}] widget '{w.id}' select field '{field.name}' has no options"
                    )

        # ── Tool name checks ────────────────────────────────────────────────
        manifest_tools = set(m.tools)
        registered_tools = {t.name for t in plugin.agent.tools()}
        for tool_name in manifest_tools - registered_tools:
            errors.append(f"[{app_id}] tool '{tool_name}' in manifest but not registered in agent")
        for tool_name in registered_tools - manifest_tools:
            warnings.append(f"[{app_id}] tool '{tool_name}' registered in agent but not in manifest (will be hidden)")

        # Tool name format: {app_id}_{action}
        for tool_name in registered_tools:
            expected_prefix = f"{app_id}_"
            if not tool_name.startswith(expected_prefix):
                errors.append(
                    f"[{app_id}] tool '{tool_name}' must start with '{expected_prefix}'"
                )

        # ── Beanie model checks ────────────────────────────────────────────
        for model in plugin.models:
            coll_name = getattr(model.Settings, "name", None) or model.__name__.lower()
            if coll_name in seen_collection_names:
                errors.append(
                    f"[{app_id}] collection name '{coll_name}' conflicts with another plugin"
                )
            seen_collection_names.add(coll_name)

        # ── Router checks ───────────────────────────────────────────────────
        if not plugin.router.routes:
            warnings.append(f"[{app_id}] router has no routes — app endpoints unreachable")

        # ── App ID duplicate check ─────────────────────────────────────────
        if app_id in seen_app_ids:
            errors.append(f"Duplicate app_id '{app_id}' in registry")
        seen_app_ids.append(app_id)

    return errors, warnings
```

```python
# backend/core/main.py — lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    discover_apps()
    errors, warnings = verify_plugins()      # ← kiểm tra ngay sau discover
    for w in warnings:
        print(f"⚠️  {w}")
    if warnings:
        print(f"\n⚠️  {len(warnings)} startup warning(s)")
    if errors:
        for e in errors:
            print(f"❌ {e}")
        raise RuntimeError(f"{len(errors)} startup error(s) — fix before running. See above.")
    yield
    await close_db()
```

**Step 1:** `pytest tests/core/test_verify.py -v` → FAIL
**Step 2:** Write verify.py + wire into main.py
**Step 3:** Start server — verify error raises on bad plugin, warning logs on minor issues
**Step 4:** Commit

---

### Task 6: Shared schemas & interfaces (Python)

**Files:**
- Create: `backend/shared/schemas.py`
- Create: `backend/shared/interfaces.py`
- Create: `backend/shared/__init__.py`

Define all Pydantic schemas here (UserBase, UserCreate, UserRead, TokenResponse, AppManifestSchema, WidgetManifestSchema, ConfigFieldSchema, SelectOption, WidgetPreferenceSchema, AppCatalogEntry, ChatRequest, ChatStreamEvent). Match INTERFACES.md section 2 exactly.

**Step 1:** Write schemas.py + interfaces.py
**Step 2:** `python -c "from shared.schemas import *; print('OK')"` → OK
**Step 3:** Commit

---

### Task 7: FastAPI app entry point

**Files:**
- Create: `backend/core/main.py`

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    discover_apps()
    errors, warnings = verify_plugins()
    for w in warnings: print(f"⚠️  {w}")
    if errors:
        for e in errors: print(f"❌ {e}")
        raise RuntimeError(f"{len(errors)} startup error(s)")
    yield
    await close_db()

app = FastAPI(title="Shin SuperApp", version="2.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
from core.logging_middleware import log_requests
app.middleware("http")(log_requests)

# Wire exception handlers
from core.exceptions import http_exception_handler, validation_handler, generic_handler
from starlette.exceptions import HTTPException as StarletteHTTPException
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_handler)
app.add_exception_handler(Exception, generic_handler)

# Mount routers
from apps.auth import router as auth_router
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])

from apps.catalog import router as catalog_router
app.include_router(catalog_router, prefix="/api/apps", tags=["apps"])

from apps.chat import router as chat_router
app.include_router(chat_router, prefix="/api/chat", tags=["chat"])

for app_id, plugin in PLUGIN_REGISTRY.items():
    app.include_router(plugin.router, prefix=f"/api/apps/{app_id}", tags=[app_id])

@app.get("/health")
async def health(): return {"status": "ok"}
```

**Step 1:** `cd backend && uvicorn core.main:app --reload` → starts OK, logs startup warnings/errors
**Step 2:** `curl http://localhost:8000/health` → `{"status":"ok"}`
**Step 3:** Commit

---

## Phase 2 — Backend Apps

### Task 8: Auth routes

**Files:**
- Create: `backend/apps/auth.py`
- Create: `backend/apps/auth_schemas.py`

Routes: `POST /login`, `POST /refresh`, `POST /logout`.
Login → verify bcrypt hash → return access_token + refresh_token (httpOnly cookie).
Refresh → validate refresh cookie → return new access_token + refresh_token.

**Step 1:** Write auth routes
**Step 2:** `curl -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"..."}'` → 200 with tokens
**Step 3:** Commit

---

### Task 9: App catalog & install routes

**Files:**
- Create: `backend/apps/catalog.py`

Routes: `GET /catalog`, `POST /install/{app_id}`, `DELETE /uninstall/{app_id}`, `GET /{app_id}/widgets`, `GET /{app_id}/preferences`, `PUT /{app_id}/preferences`.

**Step 1:** Write catalog.py
**Step 2:** `curl http://localhost:8000/api/apps/catalog` → returns installed apps
**Step 3:** Commit

---

### Task 10: Chat streaming route (assistant-stream)

**Files:**
- Create: `backend/apps/chat.py`
- Modify: `backend/pyproject.toml` (thêm `assistant-stream`)

`POST /stream` → `DataStreamResponse` từ `assistant-stream` (không tự implement SSE).
Sử dụng `controller.append_text()`, `controller.add_tool_call()`, `controller.add_tool_result()`.

```python
from assistant_stream import create_run
from assistant_stream.serialization import DataStreamResponse

@router.post("/stream")
async def chat_stream(request: Request, user_id=Depends(get_current_user)):
    body = await request.json()
    incoming_tools = body.get("tools", [])  # JSON Schema — forward cho LLM, không parse

    async def run(controller):
        async for event in root_agent.astream(user_id, body["messages"], incoming_tools):
            if event["type"] == "text":
                controller.append_text(event["content"])
            elif event["type"] == "tool_call":
                controller.add_tool_call(event["toolName"], event["toolCallId"], event["args"])
            elif event["type"] == "tool_result":
                controller.add_tool_result(event["toolCallId"], event["result"])
            elif event["type"] == "done":
                controller.complete()

    return DataStreamResponse(create_run(run, state={"messages": body["messages"]}))
```

**Step 1:** `pip install assistant-stream` → OK
**Step 2:** Write chat.py + add dep
**Step 3:** `curl -X POST http://localhost:8000/api/chat/stream -H "Authorization: Bearer $TOKEN" -d '{"messages":[{"role":"user","content":[{"type":"text","text":"hi"}]}]}'` → SSE stream với assistant-stream format
**Step 4:** Commit

---

### Task 11: RootAgent (LangGraph)

**Files:**
- Create: `backend/core/agents/root.py`

StateGraph with nodes: `decide` → delegates to app agents → `respond`.
Reads `PLUGIN_REGISTRY` to build tool list per app.
Tools follow `{app_id}_{action}` naming convention.

**`astream()` method** — yields data stream events cho assistant-ui:

```python
async def astream(self, user_id: str, messages: list, incoming_tools: list):
    """
    Yields {type: "text"|"tool_call"|"tool_result"|"done", ...}
    for assistant-stream backend protocol.
    """
    user_apps = await get_user_apps(user_id)
    all_tools = []
    for app_id in user_apps:
        plugin = PLUGIN_REGISTRY.get(app_id)
        if plugin:
            all_tools.extend(plugin.agent.tools())

    graph = build_root_graph(all_tools)  # LangGraph StateGraph

    async with graph.astream_events(
        {"messages": messages, "user_id": user_id}
    ) as stream:
        async for namespace, event_type, chunk in stream:
            if event_type == "on_chat_model_stream":
                yield {"type": "text", "content": chunk.content}
            elif event_type == "on_tool_start":
                yield {
                    "type": "tool_call",
                    "toolName": chunk.name,
                    "toolCallId": chunk.id,
                    "args": getattr(chunk, "input", {}),
                }
            elif event_type == "on_tool_end":
                yield {
                    "type": "tool_result",
                    "toolCallId": chunk.id,
                    "result": getattr(chunk, "output", {}),
                }
```

**Step 1:** Write root.py
**Step 2:** `curl -X POST http://localhost:8000/api/chat/stream ... -d '{"message":"Add 500 for food"}'` → SSE với tool_call + tool_result events
**Step 3:** Commit

---

### Task 12: Finance plugin

**Files:**
- Create: `backend/apps/finance/__init__.py`
- Create: `backend/apps/finance/manifest.py`
- Create: `backend/apps/finance/models.py` — Wallet, Transaction, Category (Beanie)
- Create: `backend/apps/finance/repository.py` — Beanie data access queries
- Create: `backend/apps/finance/service.py` — Business logic (thin routes → service → repository)
- Create: `backend/apps/finance/agent.py` — LangGraph agent + tools
- Create: `backend/apps/finance/routes.py`
- Create: `backend/apps/finance/schemas.py`

Pattern: `routes.py` → `service.py` → `repository.py` → Beanie models.
`register_plugin(manifest, agent, router, models=[Wallet, Transaction, Category])` in `__init__.py`.

Routes bắt buộc:
- `GET /widgets` — return manifest widgets
- `GET /wallets` — list user wallets
- `POST /wallets` — create wallet
- `GET /transactions` — list (skip/limit)
- `POST /transactions` — add transaction
- `GET /categories` — list categories
- `POST /categories` — create category
- `GET /preferences` / `PUT /preferences` — widget preferences

**Step 1:** Write all finance plugin files (routes → service → repository)
**Step 2:** `curl http://localhost:8000/api/apps/catalog | jq '.[] | .id'` → includes "finance"
**Step 3:** `curl http://localhost:8000/api/apps/finance/widgets` → returns widget list
**Step 4:** `pytest tests/apps/test_finance.py -v` → PASS
**Step 5:** Commit

---

### Task 13: Todo plugin

**Files:**
- Create: `backend/apps/todo/__init__.py`
- Create: `backend/apps/todo/manifest.py`
- Create: `backend/apps/todo/models.py` — Task (Beanie)
- Create: `backend/apps/todo/repository.py`
- Create: `backend/apps/todo/service.py`
- Create: `backend/apps/todo/agent.py`
- Create: `backend/apps/todo/routes.py`

Routes bắt buộc: `GET /widgets`, `GET /tasks`, `POST /tasks`, `PATCH /tasks/{id}`, `DELETE /tasks/{id}`, `GET /preferences`, `PUT /preferences`.

**Step 1:** Write all todo plugin files
**Step 2:** `curl http://localhost:8000/api/apps/catalog | jq '.[] | .id'` → includes "todo"
**Step 3:** Commit

---

## Phase 3 — Frontend (React + Vite)

### Task 14: Vite setup + routing

**Files:**
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`

```typescript
// App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/store" element={<ProtectedRoute><StorePage /></ProtectedRoute>} />
        <Route path="/apps/:appId" element={<ProtectedRoute><AppPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
```

**Step 1:** `cd frontend && npm install && npm run dev` → runs on :5173
**Step 2:** Commit

---

### Task 15: API client + typed hooks

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/auth.ts`
- Create: `frontend/src/api/catalog.ts`
- Create: `frontend/src/api/apps.ts`
- Create: `frontend/src/hooks/useAuth.ts`
- Create: `frontend/src/hooks/useStreamingChat.ts`

`client.ts` wraps `fetch`, auto-attaches `Authorization: Bearer` header, handles 401 → calls refresh, retries.

**Step 1:** `npm run build` → 0 errors
**Step 2:** Commit

---

### Task 16: Generated types (codegen)

**Files:**
- Create: `frontend/src/types/generated/api.ts`
- Create: `scripts/codegen.py`

After writing `backend/shared/schemas.py`, run codegen to generate TypeScript:

```bash
python scripts/codegen.py
# or: pydantic2ts --input backend/shared/schemas.py --output frontend/src/types/generated/api.ts
```

**Step 1:** Run codegen
**Step 2:** Verify `frontend/src/types/generated/api.ts` exists with all schemas
**Step 3:** Commit

---

### Task 17: Login page

**Files:**
- Create: `frontend/src/pages/LoginPage.tsx`

Email/password form → POST `/api/auth/login` → store tokens → redirect to `/dashboard`.

**Step 1:** `npm run build` → 0 errors
**Step 2:** Manual test: login flow works
**Step 3:** Commit

---

### Task 18: Dashboard + AppShell + AppList + AppNav

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/components/dashboard/WidgetGrid.tsx`
- Create: `frontend/src/components/dashboard/DashboardShell.tsx`
- Create: `frontend/src/components/dashboard/AppList.tsx` — sidebar app list
- Create: `frontend/src/components/dashboard/WidgetManager.tsx`

`DashboardShell`: 3-column grid (AppList sidebar + WidgetGrid + ChatThread).
`AppList`: renders installed apps from catalog, active state from URL.
`WidgetGrid`: fetches widget preferences, resolves components via `getWidget()`, renders in 12-col grid.

**Step 1:** `npm run build` → 0 errors
**Step 2:** Manual: navigate to /dashboard, see app sidebar + widgets
**Step 3:** Commit

---

### Task 19: Frontend Chat UI (assistant-ui)

**Files:**
- Modify: `frontend/package.json` (thêm `@assistant-ui/react`, `@assistant-ui/react-data-stream`, `assistant-stream`)
- Create: `frontend/src/lib/assistant-tools.ts`
- Create: `frontend/src/components/providers.tsx` — `AppProviders` với `useDataStreamRuntime`
- Create: `frontend/src/components/chat/ChatThread.tsx` — `Thread` wrapper với dark mode CSS
- Modify: `frontend/src/components/dashboard/DashboardShell.tsx` — wrap với `AppProviders`, thêm chat column

**Step 1:** `npm install @assistant-ui/react @assistant-ui/react-data-stream assistant-stream`
**Step 2:** Write `assistant-tools.ts` — tool defs không có `execute:` (server-side)

```typescript
// frontend/src/lib/assistant-tools.ts
import { tool } from "@assistant-ui/react";
import { toToolsJSONSchema } from "assistant-stream";
import { z } from "zod";

export const myTools = {
  finance_add_transaction: tool({
    description: "Add a new income or expense transaction",
    parameters: z.object({
      wallet_id: z.string(), category_id: z.string(),
      type: z.enum(["income", "expense"]), amount: z.number().positive(),
      date: z.string(), note: z.string().optional(),
    }),
  }),
  finance_list_wallets: tool({ description: "List all wallets", parameters: z.object({}) }),
  todo_add_task: tool({ ... }),
  todo_list_tasks: tool({ ... }),
};

export const serializedTools = toToolsJSONSchema(myTools);
```

**Step 3:** Write `providers.tsx` — `useDataStreamRuntime` + `AssistantRuntimeProvider`

```tsx
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";
import { serializedTools } from "@/lib/assistant-tools";

export function AppProviders({ children }) {
  const runtime = useDataStreamRuntime({
    api: "/api/chat/stream",
    body: { tools: serializedTools },
  });
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
```

**Step 4:** Write `ChatThread.tsx` — dark mode wrapper

```css
/* globals.css */
.chat-thread {
  --aui-background: oklch(0.14 0.01 265);
  --aui-surface: oklch(0.18 0.01 265);
  --aui-border: oklch(0.28 0.02 265);
  --aui-text: oklch(0.95 0.01 265);
  --aui-muted: oklch(0.55 0.02 265);
  --aui-primary: oklch(0.65 0.21 280);
}
```

**Step 5:** Wire vào `DashboardShell` — `AppProviders` + chat column + `ChatThread`

```tsx
export function DashboardShell({ children }) {
  return (
    <AppProviders>
      <div className="dashboard-grid">
        <aside className="sidebar">...</aside>
        <main>{children}</main>
        <aside>
          <ChatThread />
        </aside>
      </div>
    </AppProviders>
  );
}
```

**Step 6:** `npm run build` → 0 errors
**Step 7:** Manual: send message → SSE streams in, tool_call renders, tool_result shows
**Step 8:** Commit

---

### Task 20: App page + AppStore

**Files:**
- Create: `frontend/src/pages/AppPage.tsx`
- Create: `frontend/src/pages/StorePage.tsx`

StorePage: `GET /api/apps/catalog`, shows install/uninstall buttons.
AppPage: `GET /api/apps/{appId}/widgets`, renders full app view + widget manager.

**Step 1:** `npm run build` → 0 errors
**Step 2:** Commit

---

### Task 21: Finance app — layout + pages

**Files:**
- Create: `frontend/src/apps/finance/layout.tsx` — FinanceLayout (AppShell + AppNav)
- Create: `frontend/src/apps/finance/AppNav.tsx` — nav tabs: Overview | Wallets | Categories | Transactions
- Create: `frontend/src/apps/finance/pages/FinanceOverview.tsx` — KPI row + mini widgets
- Create: `frontend/src/apps/finance/pages/WalletsPage.tsx` — wallet CRUD
- Create: `frontend/src/apps/finance/pages/CategoriesPage.tsx` — category CRUD
- Create: `frontend/src/apps/finance/pages/TransactionsPage.tsx` — full transaction list + form
- Create: `frontend/src/apps/finance/widgets/TotalBalance.tsx` — dashboard widget
- Create: `frontend/src/apps/finance/widgets/BudgetOverview.tsx` — dashboard widget
- Create: `frontend/src/apps/finance/widgets/RecentTransactions.tsx` — dashboard widget
- Create: `frontend/src/apps/finance/widgets/index.ts` — registerWidget calls
- Modify: `frontend/src/App.tsx` — nested finance routes

```tsx
// Nested routes cho finance app
<Route path="/apps/finance" element={<FinanceLayout />}>
  <Route index element={<Navigate to="/apps/finance/overview" replace />} />
  <Route path="overview"      element={<FinanceOverview />} />
  <Route path="wallets"       element={<WalletsPage />} />
  <Route path="categories"    element={<CategoriesPage />} />
  <Route path="transactions"  element={<TransactionsPage />} />
</Route>
```

Use `StatCard`, `SectionHeader`, `AppShell` from shared components.

**Step 1:** `npm run build` → 0 errors
**Step 2:** Navigate /apps/finance/overview → stat cards + nav tabs visible
**Step 3:** Navigate /apps/finance/wallets → wallet management
**Step 4:** Navigate /apps/finance/transactions → transaction list + form
**Step 5:** Dashboard shows finance widgets
**Step 6:** Commit

---

### Task 22: Todo app — layout + pages

**Files:**
- Create: `frontend/src/apps/todo/layout.tsx` — TodoLayout
- Create: `frontend/src/apps/todo/AppNav.tsx`
- Create: `frontend/src/apps/todo/pages/TaskListPage.tsx` — main task page
- Create: `frontend/src/apps/todo/pages/SettingsPage.tsx`
- Create: `frontend/src/apps/todo/widgets/TaskList.tsx` — dashboard widget
- Create: `frontend/src/apps/todo/widgets/TodayWidget.tsx` — dashboard widget
- Create: `frontend/src/apps/todo/widgets/index.ts` — registerWidget calls
- Modify: `frontend/src/App.tsx` — nested todo routes

**Step 1:** `npm run build` → 0 errors
**Step 2:** Navigate /apps/todo/tasks → task list + nav
**Step 3:** Commit

---

### Task 23: Design system migration + assistant-ui dark mode

**Files:**
- Modify: `frontend/src/app/globals.css` (add @theme if missing — copy from existing)
- Modify: `frontend/src/components/ui/design-system.tsx` (keep as-is, already correct)
- Modify: `frontend/src/app/globals.css` (add assistant-ui CSS variables for dark mode)

Add assistant-ui dark mode tokens to globals.css:

```css
/* Dark mode override for assistant-ui Thread */
.chat-thread,
[data-aui-theme="dark"] {
  --aui-background: oklch(0.14 0.01 265);
  --aui-surface: oklch(0.18 0.01 265);
  --aui-border: oklch(0.28 0.02 265);
  --aui-text: oklch(0.95 0.01 265);
  --aui-muted: oklch(0.55 0.02 265);
  --aui-primary: oklch(0.65 0.21 280);
  --aui-success: oklch(0.72 0.19 145);
  --aui-danger: oklch(0.63 0.24 25);
}
```

Keep existing design tokens, CSS classes, widget grid system. Only add if missing.

**Step 1:** `npm run build` → 0 errors, styles consistent
**Step 2:** Verify chat thread matches dark design system
**Step 3:** Commit

---

## Phase 4 — Deployment & Polish

### Task 24: Docker + HF Spaces

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.env` (template already in Task 1)

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install -e .
EXPOSE 7860
CMD ["uvicorn", "core.main:app", "--host", "0.0.0.0", "--port", "7860"]
```

HF Spaces: set `HF_SPACE=true`, use port 7860, `HF禅` → auto-detects Dockerfile.

**Step 1:** `docker build -t shin-superin-backend .` → builds OK
**Step 2:** Commit

---

### Task 25: Vercel frontend

**Files:**
- Create: `frontend/vercel.json`

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://your-space.hf.space/api/:path*" }
  ]
}
```

**Step 1:** `vercel deploy --prod` → deploys OK
**Step 2:** Set env vars: `VITE_API_URL`, `VITE_APP_NAME`
**Step 3:** Commit

---

### Task 26: Pre-commit hooks

**Files:**
- Create: `.pre-commit-config.yaml`

```yaml
repos:
  - repo: local
    hooks:
      - id: codegen
        name: Generate TypeScript types
        entry: python scripts/codegen.py
        language: system
        files: backend/shared/
      - id: lint-python
        name: Lint Python
        entry: ruff check
        language: system
        files: backend/
```

**Step 1:** `pre-commit run --all-files` → passes
**Step 2:** Commit

---

### Task 27: Tests

**Files:**
- Create: `backend/tests/conftest.py` — fixtures (test DB, auth client, AsyncClient)
- Create: `backend/tests/core/test_auth.py` — token create/verify, blacklist
- Create: `backend/tests/core/test_registry.py` — register, discover
- Create: `backend/tests/core/test_verify.py` — plugin verification errors/warnings
- Create: `backend/tests/core/test_db.py` — Beanie init + queries
- Create: `backend/tests/apps/test_finance.py` — wallet CRUD, transaction, auth guard
- Create: `frontend/src/shared/lib/app-registry.test.ts`
- Create: `frontend/src/shared/lib/plugin-registry.test.ts`

Fixtures cần có: `test_db`, `client`, `auth_client` (từ conftest.py).

**Step 1:** `pytest backend/tests/ -v` → all PASS
**Step 2:** `vitest run` → all PASS
**Step 3:** Commit

---

### Task 28: Final integration test

**Step 1:** Run backend: `uvicorn core.main:app --reload`
**Step 2:** Run frontend: `npm run dev`
**Step 3:** Full flow: login → dashboard → install todo → chat "add task" → see widget update
**Step 4:** Commit: `git tag v2.1.0 && git push origin main --tags`

---

## File Index (all files to create)

```
backend/
├── pyproject.toml
├── Dockerfile
├── .env.example
├── .gitignore
├── core/
│   ├── main.py
│   ├── config.py
│   ├── db.py
│   ├── auth.py
│   ├── security.py
│   ├── exceptions.py
│   ├── logging_middleware.py
│   ├── registry.py
│   ├── verify.py
│   ├── discovery.py
│   └── agents/
│       └── root.py
├── shared/
│   ├── __init__.py
│   ├── schemas.py
│   └── interfaces.py
├── apps/
│   ├── auth.py
│   ├── auth_schemas.py
│   ├── catalog.py
│   ├── chat.py
│   ├── finance/
│   │   ├── __init__.py
│   │   ├── manifest.py
│   │   ├── models.py
│   │   ├── repository.py
│   │   ├── service.py
│   │   ├── agent.py
│   │   ├── routes.py
│   │   └── schemas.py
│   └── todo/
│       ├── __init__.py
│       ├── manifest.py
│       ├── models.py
│       ├── repository.py
│       ├── service.py
│       ├── agent.py
│       └── routes.py
frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── .eslintrc.cjs
├── .env.example
├── vercel.json
├── public/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── app/
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── api/
│   │   ├── client.ts
│   │   ├── auth.ts
│   │   ├── catalog.ts
│   │   └── apps.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useStreamingChat.ts
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── StorePage.tsx
│   │   └── AppPage.tsx
│   ├── components/
│   │   ├── providers.tsx
│   │   ├── chat/
│   │   │   ├── ChatThread.tsx
│   │   │   └── ChatInput.tsx
│   │   ├── dashboard/
│   │   │   ├── WidgetGrid.tsx
│   │   │   ├── AppShell.tsx
│   │   │   └── WidgetManager.tsx
│   │   └── ui/
│   │       └── design-system.tsx
│   ├── apps/
│   │   ├── finance/
│   │   │   ├── layout.tsx              ← FinanceLayout (AppShell + AppNav)
│   │   │   ├── AppNav.tsx              ← Nav tabs
│   │   │   ├── pages/
│   │   │   │   ├── FinanceOverview.tsx  ← KPI row + charts
│   │   │   │   ├── WalletsPage.tsx     ← Wallet CRUD
│   │   │   │   ├── CategoriesPage.tsx  ← Category CRUD
│   │   │   │   └── TransactionsPage.tsx ← Full transaction list + form
│   │   │   └── widgets/                 ← Dashboard widgets
│   │   │       ├── TotalBalance.tsx
│   │   │       ├── BudgetOverview.tsx
│   │   │       ├── RecentTransactions.tsx
│   │   │       └── index.ts
│   │   └── todo/
│   │       ├── layout.tsx
│   │       ├── AppNav.tsx
│   │       ├── pages/
│   │       │   ├── TaskListPage.tsx
│   │       │   └── SettingsPage.tsx
│   │       └── widgets/
│   │           ├── TaskList.tsx
│   │           ├── TodayWidget.tsx
│   │           └── index.ts
│   ├── lib/
│   │   └── assistant-tools.ts           ← Tool defs (no execute) + toToolsJSONSchema
│   └── types/
│       └── generated/
│           └── api.ts
├── codegen.config.yaml
├── .pre-commit-config.yaml
└── scripts/
    └── codegen.py
backend/tests/
├── conftest.py
├── core/
│   ├── test_auth.py
│   ├── test_registry.py
│   ├── test_verify.py
│   └── test_db.py
└── apps/
    └── test_finance.py
```

---

## Documentation Index

```
docs/
├── ARCHITECTURE.md                ✓ System overview, auth, agent, DB, SSE
├── INTERFACES.md                  ✓ Type contracts + codegen pipeline
├── PLUGIN_DEVELOPMENT_GUIDE.md   ✓ Design system + 8-step plugin guide
├── ASSISTANT_UI_INTEGRATION.md   ✓ Chat streaming + confirmed Q&A
├── PAGE_ARCHITECTURE.md           ✓ Nested routes + AppShell + app pages
├── COMPONENT_STANDARDS.md         ✓ Naming, props, styling, testing, checklist
├── API_CONVENTIONS.md             ✓ REST patterns, errors, SSE, versioning
├── WORKFLOW.md                    ✓ File navigation + MCP/skill reference
└── IMPLEMENTATION_PLAN.md         ← You are here
```
