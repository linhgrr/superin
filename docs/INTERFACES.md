# Shin SuperApp — Interface Definitions

> **Purpose:** This file defines all **typed contracts** that every plugin author and
> platform developer must obey. The TypeScript types are **generated from** these
> Pydantic schemas via codegen — they are the single source of truth.

---

## Table of Contents

1. [Type Codegen Pipeline](#1-type-codegen-pipeline)
2. [Backend Schemas (Pydantic)](#2-backend-schemas-pydantic)
3. [Frontend Types (Generated)](#3-frontend-types-generated)
4. [Protocols (Python)](#4-protocols-python)
5. [Widget Contract](#5-widget-contract)
6. [Agent Contract](#6-agent-contract)
7. [Route Contract](#7-route-contract)

---

## 1. Type Codegen Pipeline

```
backend/shared/schemas.py          # Pydantic models (source of truth)
        │
        │  pydantic2ts / openapi-codegen
        ▼
frontend/src/types/generated/      # .ts files (do NOT edit manually)
        │
        │  imported by
        ▼
frontend/src/apps/*/               # Widgets, pages, components
backend/apps/*/models.py            # Beanie Document classes
```

### Codegen Config

```yaml
# codegen.config.yaml
generate:
  target: typescript
  output: frontend/src/types/generated/
  input: backend/shared/schemas.py
```

### Running Codegen

```bash
# From repo root
python -m scripts.codegen

# Or via pre-commit (runs on schema file change)
```

### Rules

- **Never** edit files in `frontend/src/types/generated/` manually.
- Every schema change must update `backend/shared/schemas.py` first.
- After changing a schema, run codegen and commit both the schema and generated types together.

---

## 2. Backend Schemas (Pydantic)

All schemas live in `backend/shared/schemas.py`. Plugins add their own schemas
to `backend/apps/{app_id}/schemas.py` and expose them via `get_schemas()`.

### Core Schemas

#### User

```python
# backend/shared/schemas.py

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    name: str

class UserCreate(UserBase):
    password: str = Field(min_length=8)

class UserRead(UserBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

class UserPublic(BaseModel):
    """Public user info — returned in auth responses."""
    id: str
    email: str
    name: str
```

#### Auth

```python
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserPublic

class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=1, max_length=100)
```

#### App / Plugin

```python
class AppManifestSchema(BaseModel):
    """The manifest that every plugin MUST provide."""
    id: str = Field(description="Unique app ID, kebab-case, e.g. 'finance', 'todo'")
    name: str
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    description: str
    icon: str = Field(
        description="Lucide icon name, e.g. 'Wallet', 'CheckSquare', 'Calendar'"
    )
    color: str = Field(
        description="Accent color in oklch(), e.g. 'oklch(0.72 0.19 145)'"
    )
    widgets: list["WidgetManifestSchema"]
    agent_description: str = Field(
        description="Natural language description of agent capabilities, used by RootAgent for routing"
    )
    tools: list[str] = Field(
        description="List of LangChain/LangGraph tool names this app exposes"
    )
    models: list[str] = Field(
        description="Beanie model class names (as strings) this app owns, e.g. ['Wallet', 'Transaction']"
    )
    category: Literal[
        "finance", "productivity", "health", "social", "developer", "other"
    ] = "other"
    tags: list[str] = []
    screenshots: list[str] = []  # URLs
    author: str = "Shin Team"
    homepage: str = ""
    requires_auth: bool = True

    class Config:
        json_schema_extra = {
            "example": {
                "id": "finance",
                "name": "Finance",
                "version": "1.0.0",
                "description": "Track spending, budgets, and wallets",
                "icon": "Wallet",
                "color": "oklch(0.72 0.19 145)",
                "widgets": [...],
                "agent_description": "Helps users track expenses, manage budgets, and analyze spending patterns.",
                "tools": ["add_transaction", "query_spending", "analyze_budget"],
                "models": ["Wallet", "Transaction", "Category"],
            }
        }


class WidgetManifestSchema(BaseModel):
    """A single widget definition — referenced in AppManifest.widgets."""
    id: str = Field(
        description="Unique widget ID, format '{app_id}.{widget_name}', e.g. 'finance.total-balance'"
    )
    name: str
    description: str
    icon: str = Field(description="Lucide icon name")
    size: Literal["small", "medium", "large", "full-width"] = "medium"
    config_fields: list["ConfigFieldSchema"] = Field(default_factory=list)
    requires_auth: bool = True

    class Config:
        json_schema_extra = {
            "example": {
                "id": "finance.total-balance",
                "name": "Total Balance",
                "description": "Shows total balance across all wallets",
                "icon": "DollarSign",
                "size": "medium",
                "config_fields": [
                    {
                        "name": "accountId",
                        "label": "Wallet",
                        "type": "select",
                        "required": False,
                        "options_source": "finance.wallets",
                    }
                ],
            }
        }


class ConfigFieldSchema(BaseModel):
    """A configuration field for a widget."""
    name: str = Field(description="Field key, camelCase")
    label: str
    type: Literal["text", "number", "select", "multi-select", "date", "boolean"]
    required: bool = False
    default: Optional[Any] = None
    options: list["SelectOption"] = Field(default_factory=list)
    options_source: Optional[str] = Field(
        default=None,
        description="Widget resolver ID for dynamic options, e.g. 'finance.wallets'"
    )
    placeholder: Optional[str] = None
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None


class SelectOption(BaseModel):
    label: str
    value: str


class WidgetPreferenceSchema(BaseModel):
    """User-specific widget state stored in DB."""
    id: Optional[str] = Field(default=None, alias="_id")
    user_id: str
    widget_id: str
    app_id: str
    enabled: bool = False
    position: int = 0
    config: dict = Field(default_factory=dict)

    class Config:
        populate_by_name = True


class AppCatalogEntry(BaseModel):
    """Summary entry shown in the app store."""
    id: str
    name: str
    description: str
    icon: str
    color: str
    category: str
    version: str
    author: str
    is_installed: bool = False
    tags: list[str] = []
    screenshots: list[str] = []


class AppInstallRequest(BaseModel):
    app_id: str

class AppUninstallRequest(BaseModel):
    app_id: str
```

#### Chat / Agent

```python
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    thread_id: Optional[str] = None

class ChatStreamToken(BaseModel):
    type: Literal["token"]
    content: str

class ChatStreamToolCall(BaseModel):
    type: Literal["tool_call"]
    tool_call_id: str
    tool_name: str
    args: dict
    args_text: str

class ChatStreamToolResult(BaseModel):
    type: Literal["tool_result"]
    tool_call_id: str
    tool_name: str
    result: Any

class ChatStreamDone(BaseModel):
    type: Literal["done"]

class ChatStreamError(BaseModel):
    type: Literal["error"]
    message: str

ChatStreamEvent = Union[
    ChatStreamToken, ChatStreamToolCall,
    ChatStreamToolResult, ChatStreamDone, ChatStreamError
]
```

---

## 3. Frontend Types (Generated)

These are auto-generated from the Pydantic schemas above. Do NOT edit manually.

### Key Generated Types

```typescript
// frontend/src/types/generated/api.ts (generated from schemas.py)

export interface UserPublic {
  id: string;
  email: string;
  name: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  user: UserPublic;
}

export interface WidgetManifestSchema {
  id: string;
  name: string;
  description: string;
  icon: string;
  size: "small" | "medium" | "large" | "full-width";
  config_fields: ConfigFieldSchema[];
  requires_auth: boolean;
}

export interface AppManifestSchema {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  color: string;
  widgets: WidgetManifestSchema[];
  agent_description: string;
  tools: string[];
  models: string[];
  category: string;
  tags: string[];
  screenshots: string[];
  author: string;
  homepage: string;
  requires_auth: boolean;
}

export interface WidgetPreferenceSchema {
  _id?: string;
  user_id: string;
  widget_id: string;
  app_id: string;
  enabled: boolean;
  position: number;
  config: Record<string, unknown>;
}

export interface ConfigFieldSchema {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "multi-select" | "date" | "boolean";
  required?: boolean;
  default?: unknown;
  options?: SelectOption[];
  options_source?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface AppCatalogEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  version: string;
  author: string;
  is_installed: boolean;
  tags: string[];
  screenshots: string[];
}
```

---

## 4. Protocols (Python)

Protocols define the **runtime contract** between the platform and plugins.
They live in `backend/shared/interfaces.py` and are imported by every plugin.

### AgentProtocol

```python
# backend/shared/interfaces.py

from typing import Protocol, Any
from langgraph.graph import CompiledGraph
from langchain_core.tools import BaseTool

class AgentProtocol(Protocol):
    """
    Every app agent MUST implement this protocol.

    The RootAgent reads PLUGIN_REGISTRY to find the right agent
    for each user message, then calls agent.astream() with the
    user's messages and context.
    """

    @property
    def graph(self) -> CompiledGraph:
        """The compiled LangGraph state graph."""
        ...

    def tools(self) -> list[BaseTool]:
        """Domain-specific tools this agent exposes."""
        ...

    async def on_install(self, user_id: str) -> None:
        """
        Called when a user installs this app.
        Use to seed default data (wallets, categories, etc.)
        """
        ...

    async def on_uninstall(self, user_id: str) -> None:
        """
        Called when a user uninstalls this app.
        Use to clean up user-specific data.
        """
        ...
```

### AppPlugin

```python
# backend/shared/interfaces.py

from typing import TypedDict
from fastapi import APIRouter
from langgraph.graph import CompiledGraph

from .schemas import AppManifestSchema

class AppPlugin(TypedDict):
    """
    The shape stored in PLUGIN_REGISTRY after register_plugin() is called.
    """
    manifest: AppManifestSchema
    agent: AgentProtocol
    router: APIRouter
    models: list[type[Any]]  # Beanie Document classes
```

### WidgetResolverProtocol

```python
# backend/shared/interfaces.py

from typing import Protocol
from .schemas import SelectOption

class WidgetResolverProtocol(Protocol):
    """
    Plugins register resolvers to provide dynamic options for widget config fields.
    e.g. 'finance.wallets' → returns list of user's wallets as SelectOption[]
    """

    async def resolve(
        self,
        user_id: str,
        field_name: str,
    ) -> list[SelectOption]:
        """Return options for the given field, filtered by user context."""
        ...
```

---

## 5. Widget Contract

### Widget ID Naming

```
{app_id}.{kebab-widget-name}
```

Examples:
- `finance.total-balance`
- `finance.budget-overview`
- `todo.task-list`
- `calendar.upcoming-events`

### Widget Manifest Registration (Python / Backend)

```python
# backend/apps/finance/manifest.py

from shared.schemas import AppManifestSchema, WidgetManifestSchema

wallet_widget = WidgetManifestSchema(
    id="finance.total-balance",
    name="Total Balance",
    description="Shows total balance across all wallets",
    icon="DollarSign",
    size="medium",
    config_fields=[
        ConfigFieldSchema(
            name="accountId",
            label="Wallet",
            type="select",
            required=False,
            options_source="finance.wallets",  # dynamic resolver
        ),
    ],
)

finance_manifest = AppManifestSchema(
    id="finance",
    name="Finance",
    version="1.0.0",
    description="Track spending, budgets, and wallets",
    icon="Wallet",
    color="oklch(0.72 0.19 145)",
    widgets=[wallet_widget, budget_widget, recent_tx_widget],
    agent_description="...",
    tools=["add_transaction", "query_spending", "analyze_budget"],
    models=["Wallet", "Transaction", "Category"],
)
```

### Widget Component (React / Frontend)

```typescript
// frontend/src/apps/finance/widgets/TotalBalance.tsx

import type { WidgetComponentProps } from "@/types/widget";

/**
 * MUST export default function or be registered in widgets/index.ts
 * Props are typed by the platform — widget never receives unexpected data.
 */
export default function TotalBalance({
  appId,
  widgetId,
  userId,
  config,
}: WidgetComponentProps) {
  // Self-fetch pattern: widget calls its own API endpoint
  const wallets = useSWR(
    `/api/apps/${appId}/wallets?user_id=${userId}`,
    fetcher
  );

  const targetWallet = config.accountId
    ? wallets.data?.find((w: Wallet) => w.id === config.accountId)
    : wallets.data?.[0];

  return (
    <Card>
      <Text>{targetWallet?.name ?? "Total Balance"}</Text>
      <Text className="text-3xl">
        {formatCurrency(targetWallet?.balance ?? 0)}
      </Text>
    </Card>
  );
}
```

### Widget Registration (Frontend)

```typescript
// frontend/src/apps/finance/widgets/index.ts

import TotalBalance from "./TotalBalance";
import BudgetOverview from "./BudgetOverview";
import RecentTransactions from "./RecentTransactions";
import { registerWidget } from "@/types/widget";

// Register all widgets from this app
registerWidget("finance.total-balance", TotalBalance);
registerWidget("finance.budget-overview", BudgetOverview);
registerWidget("finance.recent-transactions", RecentTransactions);
```

```typescript
// frontend/src/apps/finance/index.ts

// Triggers widget registration as a side-effect
export { } from "./widgets/index";
```

```typescript
// frontend/src/shared/apps/index.ts

// Import all app modules — each triggers widget registration
import "@/apps/finance/widgets/index";
import "@/apps/todo/widgets/index";

// No named exports needed — registration is a side-effect
```

### WidgetComponentProps

```typescript
// frontend/src/types/widget.ts (generated or hand-written)

export interface WidgetComponentProps {
  /** e.g. 'finance' */
  appId: string;
  /** e.g. 'finance.total-balance' */
  widgetId: string;
  /** Current user ID from JWT */
  userId: string;
  /** User-specific config from WidgetPreference.config */
  config: Record<string, unknown>;
  /** Optional: API client bound to current user */
  api?: ApiClient;
}
```

---

## 6. Agent Contract

### Agent Creation Pattern

```python
# backend/apps/finance/agent.py

from langgraph.graph import StateGraph, MessagesState, END
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.tools import tool

from shared.interfaces import AgentProtocol

@register_agent("finance")
class FinanceAgent(AgentProtocol):
    """
    Finance-specific agent with domain tools.
    Called by RootAgent when user asks about money, spending, etc.
    """

    @property
    def graph(self) -> CompiledGraph:
        return self._graph

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
        await Wallet(user_id=user_id, name="Main Wallet", balance=0.0).insert()
        for cat_name in ["Food", "Transport", "Entertainment", "Shopping"]:
            await Category(user_id=user_id, name=cat_name, budget=0.0).insert()

    async def on_uninstall(self, user_id: str) -> None:
        """Clean up all user data for this app."""
        await Wallet.find(Wallet.user_id == user_id).delete()
        await Transaction.find(Transaction.user_id == user_id).delete()
        await Category.find(Category.user_id == user_id).delete()
```

### RootAgent Routing

```python
# backend/core/agents/root.py

from langgraph.graph import StateGraph, MessagesState, END
from langgraph.prebuilt import ToolNode, tools_condition

class RootAgentState(MessagesState):
    user_id: str
    apps: list[str]  # installed app IDs for this user
    routing_decision: str | None = None

root_graph = (
    StateGraph(RootAgentState)
    .add_node("decide", decide_routing)      # Pick app based on message + PLUGIN_REGISTRY
    .add_node("delegate", delegate_to_app)  # Call app agent graph
    .add_node("format", format_response)     # Format final response
    .set_entry_point("decide")
    .add_edge("decide", "delegate")
    .add_edge("delegate", "format")
    .add_edge("format", END)
    .compile()
)
```

### Tool Naming Convention

```
{app_id}_{action}
```

Examples:
- `finance_add_transaction`
- `finance_query_spending`
- `todo_add_task`
- `todo_list_tasks`
- `calendar_create_event`

---

## 7. Route Contract

### Required App Routes

Every plugin router MUST implement these endpoints at minimum:

```
GET  /api/apps/{app_id}/widgets              → list WidgetManifestSchema[]
GET  /api/apps/{app_id}/preferences         → list WidgetPreferenceSchema[]
PUT  /api/apps/{app_id}/preferences         → list WidgetPreferenceSchema[]
```

### Route Skeleton

```python
# backend/apps/finance/routes.py

from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from core.auth import get_current_user
from shared.schemas import WidgetPreferenceSchema, PreferenceUpdate

router = APIRouter()

@router.get("/widgets")
async def list_widgets():
    return finance_manifest.widgets

@router.get("/preferences", response_model=list[WidgetPreferenceSchema])
async def get_preferences(
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    prefs = await WidgetPreference.find(
        WidgetPreference.user_id == user_id
    ).to_list()
    return [WidgetPreferenceSchema.model_validate(p) for p in prefs]

@router.put("/preferences", response_model=list[WidgetPreferenceSchema])
async def update_preferences(
    updates: list[PreferenceUpdate],
    user_id: str = Depends(get_current_user),
) -> list[WidgetPreferenceSchema]:
    for u in updates:
        pref = await WidgetPreference.find_one(
            WidgetPreference.user_id == user_id,
            WidgetPreference.widget_id == u.widget_id,
        )
        if pref:
            pref.enabled = u.enabled
            pref.position = u.position
            pref.config = u.config
            await pref.save()
    return await WidgetPreference.find(
        WidgetPreference.user_id == user_id
    ).to_list()

@router.get("/config-options")
async def get_config_options(
    widget_id: str,
    field: str,
    user_id: str = Depends(get_current_user),
) -> list[SelectOption]:
    resolver_id = f"finance.{field}"
    resolver = get_resolver(resolver_id)  # from WidgetResolverRegistry
    if not resolver:
        raise HTTPException(404, f"No resolver for '{resolver_id}'")
    return await resolver.resolve(user_id, field)
```

### App Data Routes (Example: Finance)

```
GET  /api/apps/finance/wallets              → list[WalletSchema]
POST /api/apps/finance/wallets              → WalletSchema
GET  /api/apps/finance/transactions         → list[TransactionSchema]
POST /api/apps/finance/transactions         → TransactionSchema
GET  /api/apps/finance/categories            → list[CategorySchema]
POST /api/apps/finance/categories            → CategorySchema
GET  /api/apps/finance/analytics/spending   → SpendingAnalytics
GET  /api/apps/finance/analytics/budget      → BudgetAnalytics
```

---

## Appendix: Complete File Map

```
backend/
├── shared/
│   ├── schemas.py          # All Pydantic base schemas (codegen source)
│   └── interfaces.py       # AgentProtocol, AppPlugin, WidgetResolverProtocol
│
├── core/
│   ├── auth.py             # JWT utils, get_current_user dependency
│   ├── registry.py         # PLUGIN_REGISTRY, register_plugin(), get_plugin_models()
│   └── discovery.py        # Plugin auto-discovery via importlib
│
└── apps/{app_id}/
    ├── manifest.py         # AppManifestSchema + WidgetManifestSchema[]
    ├── models.py           # Beanie Document classes
    ├── agent.py            # AgentProtocol implementation
    ├── routes.py           # FastAPI router with all endpoints
    └── schemas.py          # App-specific Pydantic schemas

frontend/
└── src/
    └── types/
        └── generated/      # Generated from backend/shared/schemas.py
            ├── api.ts       # API response types
            ├── widget.ts    # WidgetManifestSchema, ConfigFieldSchema
            └── agent.ts    # Chat types
```

---

## Enforcement Checklist

Every PR that touches plugins MUST verify:

- [ ] Plugin `__init__.py` calls `register_plugin()` with all required fields
- [ ] Plugin has a `manifest.py` with a valid `AppManifestSchema`
- [ ] Every tool function is named `{app_id}_{action}`
- [ ] All Beanie queries filter by `user_id`
- [ ] All schemas are in `shared/schemas.py` or app-specific `schemas.py`
- [ ] Widget component is registered in `widgets/index.ts` with exact `widgetId`
- [ ] Widget component is exported as default or registered via `registerWidget()`
- [ ] `AppManifestSchema.id` matches the folder name in `backend/apps/`
- [ ] `WidgetManifestSchema.id` matches `{app_id}.{kebab-name}` format
- [ ] Codegen ran after schema changes; both schema and generated types committed together
