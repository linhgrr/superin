# Shin SuperApp — Architecture

> **Goal:** Build a plug-and-play SuperApp platform where adding a new app
> requires only creating a new plugin folder — zero changes to core platform.

**Tech Stack:**
- Frontend: React + Vite + React Router + assistant-ui
- Backend: FastAPI + LangGraph + Beanie (MongoDB)
- Database: MongoDB Atlas (stateless deploy on HF Spaces)
- Auth: JWT (access + refresh tokens)
- Streaming: Server-Sent Events (SSE)

---

## 1. System Overview

```
Browser (React)
  │
  ├── UI: React + Vite + assistant-ui
  │         ├── Thread (chat)
  │         ├── WidgetGrid (dashboard)
  │         └── AppShell
  │
  ├── SSE: /chat/stream          ← agent streaming
  └── REST: /api/...             ← data operations
              │
              ▼
FastAPI Backend (HF Spaces)
  │
  ├── AuthMiddleware → JWT validation
  ├── Discovery     → auto-discover plugins
  │
  ├── /api/auth/*  → login, refresh, logout
  ├── /api/apps/*  → app catalog, install/uninstall
  ├── /api/apps/{appId}/widgets
  ├── /api/apps/{appId}/preferences
  └── /chat/stream  → LangGraph agent stream
              │
     ┌────────┼──────────┐
     ▼        ▼          ▼
  Finance   Todo       Calendar
  Agent    Agent      Agent
  (Lang    (Lang      (Lang
   Graph)   Graph)     Graph)
     │
     ▼
MongoDB Atlas
  ├── User
  ├── UserAppInstallation
  ├── WidgetPreference
  ├── apps.finance.Wallet
  ├── apps.finance.Transaction
  └── apps.finance.Category
```

---

## 2. Repo Structure

```
superin/
├── frontend/                     # React + Vite
│   ├── public/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx              # React Router
│   │   │
│   │   ├── api/                 # Typed API client
│   │   │   ├── client.ts        # fetch wrapper + JWT
│   │   │   ├── auth.ts
│   │   │   ├── catalog.ts
│   │   │   └── apps.ts
│   │   │
│   │   ├── apps/                # Widget components (per app)
│   │   │   ├── finance/
│   │   │   │   ├── widgets/
│   │   │   │   │   ├── TotalBalance.tsx
│   │   │   │   │   ├── BudgetOverview.tsx
│   │   │   │   │   └── RecentTransactions.tsx
│   │   │   │   ├── register.ts  # WidgetManifest registration
│   │   │   │   └── pages/
│   │   │   │       └── FinancePage.tsx
│   │   │   └── todo/
│   │   │       └── widgets/
│   │   │
│   │   ├── components/           # Shared UI
│   │   │   ├── chat/
│   │   │   │   ├── ChatThread.tsx
│   │   │   │   └── ChatInput.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── DashboardShell.tsx
│   │   │   │   ├── WidgetGrid.tsx
│   │   │   │   └── WidgetManager.tsx
│   │   │   └── layout/
│   │   │       └── AppShell.tsx
│   │   │
│   │   ├── pages/
│   │   │   ├── HomePage.tsx      # Redirect → /dashboard or /login
│   │   │   ├── LoginPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── StorePage.tsx
│   │   │   └── AppPage.tsx       # /apps/{appId}
│   │   │
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   └── useStreamingChat.ts
│   │   │
│   │   └── types/               # Generated from backend
│   │       ├── widget.ts
│   │       ├── api.ts
│   │       └── agent.ts
│   │
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/                      # FastAPI
│   ├── apps/                    # Auto-discover plugins
│   │   ├── finance/
│   │   │   ├── __init__.py      # register_plugin() call
│   │   │   ├── manifest.py      # AppManifest + WidgetManifest[]
│   │   │   ├── models.py         # Beanie Document classes
│   │   │   ├── agent.py         # LangGraph agent
│   │   │   └── routes.py        # FastAPI router
│   │   └── todo/
│   │       └── ...
│   │
│   ├── core/                    # Platform core
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app + lifespan
│   │   ├── config.py            # Settings from env
│   │   ├── db.py               # Beanie init + connection
│   │   ├── auth.py              # JWT utils, schemas, middleware
│   │   ├── discovery.py         # Plugin auto-discovery
│   │   ├── registry.py          # PLUGIN_REGISTRY singleton
│   │   └── exceptions.py        # HTTP exceptions
│   │
│   ├── shared/                  # Shared schemas
│   │   ├── __init__.py
│   │   ├── schemas.py           # Pydantic base schemas
│   │   └── interfaces.py        # Protocol definitions
│   │
│   ├── pyproject.toml
│   └── Dockerfile
│
├── packages/                     # Shared types (codegen source)
│   └── shared/
│       └── schemas/             # Pydantic schemas (source for TS codegen)
│
├── codegen.config.yaml           # Codegen configuration
├── docs/
│   └── docs/
│       ├── ARCHITECTURE.md
│       ├── INTERFACES.md
│       ├── PLUGIN_DEVELOPMENT_GUIDE.md
│       └── IMPLEMENTATION_PLAN.md
└── README.md
```

---

## 3. Auth Flow

### Login
```
POST /api/auth/login
Body: { "email": "...", "password": "..." }
Response 200: {
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "user": { "id": "...", "email": "...", "name": "..." }
}

Frontend stores:
  - access_token: in memory (short-lived, 15min)
  - refresh_token: httpOnly cookie (7 days)
```

### JWT Payload
```json
{
  "sub": "<user_id>",
  "email": "<email>",
  "exp": 1234567890,
  "type": "access"
}
```

### Every Request
```
Request
  │
  ├── Bearer token in Authorization header
  │   OR httpOnly cookie (refresh_token)
  │
  ▼
JWTMiddleware
  ├── Validates token
  ├── Extracts user_id, email
  ├── Attaches to request.state
  └── Returns 401 if invalid/expired
```

### Token Refresh
```
POST /api/auth/refresh
Cookie: refresh_token (httpOnly)
Response: { "access_token": "...", "refresh_token": "..." }
→ Frontend auto-refreshes before expiry
```

---

## 4. Plugin Discovery

### Startup Flow
```python
# backend/core/main.py — lifespan startup

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Init DB
    await init_db()

    # 2. Discover and register all apps
    await discover_apps()

    # 3. Seed default app data
    await seed_system_prompts()

    yield

    # Shutdown: close DB connections
    await close_db()
```

### Discovery Logic
```python
# backend/core/discovery.py

def discover_apps() -> None:
    """
    Scan apps/ directory.
    Import __init__.py of each subfolder.
    Each __init__.py calls register_plugin().
    Raises ImportError if plugin has missing deps.
    """
    backend_dir = Path(__file__).parent.parent / "apps"
    for app_dir in backend_dir.iterdir():
        if app_dir.is_dir() and not app_dir.name.startswith("_"):
            importlib.import_module(f"apps.{app_dir.name}")
```

### Plugin Registration
```python
# backend/core/registry.py

PLUGIN_REGISTRY: dict[str, PluginEntry] = {}

class PluginEntry(TypedDict):
    manifest: "AppManifest"
    agent: "AgentProtocol"
    router: APIRouter
    models: list[type[Document]]

def register_plugin(
    manifest: "AppManifest",
    agent: "AgentProtocol",
    router: APIRouter,
    models: list[type[Document]] = [],
) -> None:
    PLUGIN_REGISTRY[manifest.id] = PluginEntry(
        manifest=manifest,
        agent=agent,
        router=router,
        models=models,
    )
```

### Adding a New App (plug-and-play)
```python
# backend/apps/awesome_app/__init__.py

manifest = AppManifest(
    id="awesome",
    name="Awesome App",
    version="1.0.0",
    widgets=[...],
    agent_description="...",
    tools=[...],
)

agent = AwesomeAgent()
router = APIRouter()
register_plugin(manifest, agent, router)
```
**→ No changes to core platform files required.**
```

---

## 5. Agent Architecture

### Overview
```
User message
      │
      ▼
RootAgent (LangGraph)
      │
      ├─ reads PLUGIN_REGISTRY
      ├─ reads user apps (from DB)
      └─ decides which app agent(s) to call
              │
              ▼ (tool call)
AppAgent (LangGraph)
      │
      ├─ tools (domain-specific)
      ├─ state (messages, user_id)
      └─ returns structured response
              │
              ▼
SSE stream ──► Frontend (assistant-ui)
```

### RootAgent Graph
```python
# backend/core/agents/root.py

from langgraph.graph import StateGraph, MessagesState, END

class AgentState(MessagesState):
    user_id: str
    apps: list[str]

graph = (
    StateGraph(AgentState)
    .add_node("decide", decide_intent)      # Which app to delegate to?
    .add_node("delegate", delegate_to_app)  # Call app agent
    .add_node("respond", respond_to_user)  # Format response
    .set_entry_point("decide")
    .add_edge("decide", "delegate")
    .add_edge("delegate", "respond")
    .add_edge("respond", END)
    .compile()
)
```

### Streaming Endpoint
```python
# backend/core/main.py

@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    user_id: str = Depends(get_current_user),
):
    async def event_generator():
        async for token in root_agent.astream(
            {"messages": [{"role": "user", "content": request.message}],
             "user_id": user_id,
             "apps": await get_user_apps(user_id),
        }):
            yield f"data: {json.dumps(token)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
    )
```

### AppAgent Pattern
```python
# backend/apps/finance/agent.py

@register_agent("finance")
class FinanceAgent(AgentProtocol):
    graph: CompiledGraph  # LangGraph compiled

    def tools(self) -> list[BaseTool]:
        return [
            add_transaction,
            query_spending,
            analyze_budget,
            list_wallets,
            create_wallet,
            create_category,
        ]

    async def on_install(self, user_id: str) -> None:
        """Seed default wallet + categories for new user."""
        await Wallet(user_id=user_id, name="Main Wallet").insert()
```

---

## 6. API Routes

### Route Registration
```python
# backend/core/main.py

for app_id, plugin in PLUGIN_REGISTRY.items():
    app.include_router(
        plugin.router,
        prefix=f"/api/apps/{app_id}",
        tags=[app_id],
    )
```

### Core Routes

```
POST   /api/auth/login          Login, returns JWT
POST   /api/auth/refresh        Refresh tokens
POST   /api/auth/logout         Invalidate refresh token

GET    /api/apps/catalog        List all available apps
POST   /api/apps/install       Install app for user
POST   /api/apps/uninstall      Uninstall app (soft delete)

GET    /api/apps/{appId}/widgets           List app's widgets
GET    /api/apps/{appId}/preferences       User's widget prefs
PUT    /api/apps/{appId}/preferences       Update prefs
GET    /api/apps/{appId}/config-options     Dynamic config options

POST   /api/chat/stream       SSE streaming chat

GET    /api/me                 Current user info
GET    /health                Health check
```

### Example: Widget Preferences API
```python
# backend/apps/finance/routes.py

@router.get("/preferences", response_model=list[WidgetPreferenceSchema])
async def get_preferences(user_id: str = Depends(get_current_user)):
    return await WidgetPreference.find(
        WidgetPreference.user_id == user_id
    ).to_list()

@router.put("/preferences", response_model=list[WidgetPreferenceSchema])
async def update_preferences(
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
):
    for u in updates:
        await WidgetPreference.find_one(
            WidgetPreference.widget_id == u.widget_id
        ).update({"$set": u.model_dump()})
    return await WidgetPreference.find(
        WidgetPreference.user_id == user_id
    ).to_list()
```

---

## 7. Widget System

### Data Flow
```
Widget (React component)
      │
      ├── GET /api/apps/{appId}/widgets
      │       → manifest.widgets[] (configFields)
      │
      ├── GET /api/apps/{appId}/preferences?user_id=...
      │       → WidgetPreference[] (position, enabled, config)
      │
      └── Self-fetches own data:
              GET /api/apps/finance/wallets?user_id=...
              GET /api/apps/finance/transactions?user_id=...
              GET /api/apps/finance/categories?user_id=...
```

### Widget Rendering
```typescript
// frontend/src/apps/finance/widgets/TotalBalance.tsx

interface Props {
  appId: string;
  widgetId: string;
  userId: string;
  config: Record<string, unknown>; // from manifest.configFields
}

export async function TotalBalance({ userId, config }: Props) {
  const wallets = await api.get("/api/apps/finance/wallets", { user_id: userId });
  const target = config.accountId
    ? wallets.find((w) => w.id === config.accountId)
    : wallets[0];

  return (
    <Card className="p-5">
      <p>{target?.name ?? "Total Balance"}</p>
      <p className="text-3xl">{formatCurrency(target?.balance ?? 0)}</p>
    </Card>
  );
}
```

### Widget Registration (Frontend)
```typescript
// frontend/src/apps/finance/register.ts

import { TotalBalance } from "./widgets/TotalBalance";
import { BudgetOverview } from "./widgets/BudgetOverview";
import { RecentTransactions } from "./widgets/RecentTransactions";

export const financeWidgets = {
  "finance.total-balance": TotalBalance,
  "finance.budget-overview": BudgetOverview,
  "finance.recent-transactions": RecentTransactions,
};

// frontend/src/apps/index.ts — auto-import all app registers
const registers = import.meta.glob("./apps/*/register.ts", { eager: true });
for (const mod of Object.values(registers)) {
  mod.register?.();
}
```

---

## 8. Database Models (Beanie)

### Init
```python
# backend/core/db.py

from beanie import Document, init_beanie

async def init_db():
    await init_beanie(
        database=client["superin"],
        document_models=[
            # Core
            User,
            UserAppInstallation,
            WidgetPreference,
            TokenBlacklist,
            # Plugin models (lazy-loaded from registry)
            *get_plugin_models(),
        ],
    )
```

### Core Models
```python
# backend/core/models.py

class User(Document):
    email: str
    hashed_password: str
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    settings: dict = {}  # Flexible user settings

class UserAppInstallation(Document):
    user_id: PydanticObjectId
    app_id: str
    status: Literal["active", "disabled"] = "active"
    installed_at: datetime = Field(default_factory=datetime.utcnow)

class WidgetPreference(Document):
    user_id: PydanticObjectId
    widget_id: str        # e.g. "finance.total-balance"
    app_id: str
    enabled: bool = False
    position: int = 0
    config: dict = {}    # widget-specific config

    class Settings:
        indexes = [
            [("user_id", 1), ("widget_id", 1)],  # unique
        ]

class TokenBlacklist(Document):
    jti: str           # JWT ID
    revoked_at: datetime
    expires_at: datetime
```

### Plugin Models (auto-loaded)
```python
# backend/apps/finance/models.py

class Wallet(Document):
    user_id: PydanticObjectId
    name: str
    currency: str = "USD"
    balance: float = 0.0

    class Settings:
        name = "finance_wallets"

class Transaction(Document):
    user_id: PydanticObjectId
    wallet_id: PydanticObjectId
    category_id: PydanticObjectId
    type: Literal["income", "expense"]
    amount: float
    date: datetime
    note: str | None = None

    class Settings:
        name = "finance_transactions"
```

---

## 9. Security

### JWT Flow
```
Login → Sign RS256 (or HS256) JWT
       ├─ access_token: 15min expiry
       └─ refresh_token: 7d expiry, stored in httpOnly cookie

Request → JWTMiddleware
         ├─ Validate signature
         ├─ Check expiry
         ├─ Check blacklist (logout/revoke)
         └─ Attach user_id to request.state
```

### Middleware Stack
```
Request
  │
  ├── RateLimitMiddleware     ← 60 req/min per user
  │
  ├── CORSMiddleware        ← allowlist frontend origin
  │
  ├── JWTMiddleware         ← validate JWT, attach user
  │
  ├── AppMiddleware         ← per-request setup
  │
  └── Route Handler
```

### User Isolation
- Every Beanie query MUST filter by `user_id`:
```python
# All queries MUST include user_id
Wallet.find_one(Wallet.user_id == user_id, Wallet.name == name)
Transaction.find(Transaction.user_id == user_id)
```

### Rate Limiting
```python
# In-MemoryRateLimiter (per-user, per-IP)
- /api/auth/login: 5 attempts/min per IP
- /api/chat/stream: 30 requests/min per user
- All other: 120 requests/min per user
```

---

## 10. Streaming (SSE)

### Protocol
```
POST /api/chat/stream
Content-Type: application/json
Authorization: Bearer <access_token>

Body: { "message": "Add 20 for food today" }

Response: text/event-stream

data: {"type": "token", "content": "Added"}
data: {"type": "token", "content": " a transaction"}
data: {"type": "tool_call", "tool": "add_transaction", ...}
data: {"type": "tool_result", "tool": "add_transaction", "result": {...}}
data: {"type": "done"}
```

### Frontend Integration
```typescript
// frontend/src/hooks/useStreamingChat.ts

async function* streamChat(message: string) {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}` },
    body: JSON.stringify({ message }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        yield JSON.parse(line.slice(6));
      }
    }
  }
}
```

---

## 11. Deployment

### Frontend (Vercel)
```
Push to main
  → Vercel auto-deploy
  → Builds: npm run build
  → Serves static on CDN
  → Env vars: VITE_API_URL, VITE_APP_NAME
```

### Backend (Hugging Face Spaces)
```
Push to main
  → HF auto-deploys Docker container
  → Starts: uvicorn backend.core.main:app
  → Port: 7860 (HF default)
  → Env vars: MONGODB_URI, JWT_SECRET, JWT_ALGORITHM
```

**Note:** HF Spaces are stateless. MongoDB must be Atlas (cloud) — not local MongoDB inside the Space.

### Environment Variables

**Backend (.env)**
```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<32+ char secret>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=https://your-app.vercel.app
HF_SPACE=true
```

**Frontend (.env.production)**
```
VITE_API_URL=https://your-space.hf.space
VITE_APP_NAME=Shin SuperApp
```

---

## 12. Shared Types (Codegen)

Backend schemas are the **single source of truth**.

```yaml
# codegen.config.yaml
generate:
  target: typescript
  output: frontend/src/types/generated/
  input: backend/shared/schemas.py
```

Run on every schema change:
```bash
pydantic2ts --input backend/shared/schemas.py \
            --output frontend/src/types/generated/api.ts
```

Or via pre-commit hook:
```yaml
# .pre-commit-config.yaml
- repo: local
  hooks:
    - id: generate-types
      name: Generate TypeScript types from Pydantic schemas
      entry: pydantic2ts ...
      language: system
      files: backend/shared/
```

---

## 13. Key Principles

### R1: Plug-and-Play
Adding a new app requires **zero changes to core platform files**.

### R2: User Isolation
Every database query **MUST** filter by `user_id`. No exceptions.

### R3: Plugin Contracts
Plugin must implement `AgentProtocol` and expose `manifest`.

### R4: Self-Fetch Widgets
Widget components **self-fetch** their own data from FastAPI endpoints.
Core platform never passes data to widgets — only config.

### R5: Types from Backend
Frontend types are **generated** from backend Pydantic schemas, never manually written.
