# Widget Data System — Design Spec

**Date:** 2026-04-11
**Status:** Draft — pending user review
**Type:** Architecture / Data Model / API

---

## 1. Problem Statement

The current widget system has a fundamental design flaw: every widget calls a summary endpoint and renders only the numbers it receives — ignoring the rich data that already exists in the backend.

**Root cause:** There is no per-widget data contract. Widgets hardcode calls to generic endpoints (`/summary`, `/tasks`, `/events`) that return aggregated KPIs, not the specific data each widget needs.

**Secondary problem:** The `WidgetPreference.config` dict is a single bucket used by both the layout engine (`gridX`, `gridY`) and future widget data filters — guaranteed to collide.

---

## 2. Goals

1. Each widget has a **dedicated data endpoint** that returns exactly the data that widget needs to render.
2. Widget data is **configurable per user** — users can filter, scope, and customize each widget instance.
3. Configuration is type-safe end-to-end: **Pydantic model on BE → OpenAPI schema → TypeScript type** via codegen.
4. Layout and data config are **fully separated** — no shared state.
5. Codegen must automatically generate both the API function and the TypeScript type for every widget config and widget data response. **No manual type definitions allowed in FE app code.**

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ DashboardWidgetRenderer                               │   │
│  │  WidgetPreferences (grid_x, grid_y, size_w, size_h) │   │
│  │  WidgetDataConfig   (config: typed dict)            │   │
│  └──────────────┬────────────────────────────────────────┘   │
│                 │                                             │
│  ┌──────────────▼────────────────────────────────────────┐   │
│  │ Generated: src/apps/{app_id}/api.ts                 │   │
│  │  getWidgetData(widget_id)  →  Promise<WidgetData>   │   │
│  │  updateWidgetDataConfig(widget_id, config)           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (FastAPI)                                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ GET /api/apps/{app_id}/widgets/{widget_id}          │   │
│  │   → Read WidgetDataConfig (DB)                       │   │
│  │   → Deserialize into Pydantic model (validated)     │   │
│  │   → Call app service with resolved config           │   │
│  │   → Return typed widget data response               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ PUT /api/apps/{app_id}/widgets/{widget_id}/config   │   │
│  │   → Validate config dict against Pydantic model     │   │
│  │   → Upsert into WidgetDataConfig (DB)              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│  MongoDB                                                     │
│  ┌─────────────────────┐  ┌────────────────────────────┐   │
│  │ WidgetPreference    │  │ WidgetDataConfig            │   │
│  │  grid_x, grid_y     │  │  config: dict               │   │
│  │  size_w, size_h     │  │  (typed by Pydantic model)  │   │
│  │  enabled, sort_order│  │                              │   │
│  └─────────────────────┘  └────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Data Model Changes

### 4.1 `WidgetPreference` — Layout Only

**File:** `backend/core/models.py`

Hardcode grid fields directly on the model. Remove the `config` dict entirely from this document.

```python
class WidgetPreference(Document):
    """User-specific widget layout state on dashboard."""

    user_id: PydanticObjectId
    widget_id: str  # e.g. "finance.total-balance"
    app_id: str
    enabled: bool = False
    sort_order: int = 0

    # Hardcoded layout fields — no longer in config dict
    grid_x: int = Field(default=0, ge=0)
    grid_y: int = Field(default=0, ge=0)
    size_w: int | None = Field(default=None, ge=2, le=12)
    size_h: int | None = Field(default=None, ge=1, le=6)

    # REMOVED: config: dict
```

**Migration:** A one-time migration script reads `config.gridX` and `config.gridY` from existing documents and writes them to the new `grid_x` and `grid_y` fields, then clears `config`.

### 4.2 `WidgetDataConfig` — Widget Data Settings

**File:** `backend/core/models.py` (new)

```python
class WidgetDataConfig(Document):
    """Per-widget data configuration — validated against the widget's Pydantic model."""

    user_id: PydanticObjectId
    widget_id: str  # e.g. "finance.total-balance", unique per user
    config: dict = Field(default_factory=dict)

    class Settings:
        name = "widget_data_configs"
        indexes = [
            IndexModel(
                [("user_id", 1), ("widget_id", 1)],
                name="widget_data_configs_user_widget_unique",
                unique=True,
            ),
        ]
```

`config` is always stored as JSON. Validation against the Pydantic model happens at read time and write time — never trust the raw dict.

---

## 5. Pydantic Config Model Pattern

### 5.1 Per-Widget Config Model

Each app defines a Pydantic model for each widget that needs configuration. These live in the app's `schemas.py`.

```python
# backend/apps/finance/schemas.py

from pydantic import BaseModel
from typing import Literal


class TotalBalanceWidgetConfig(BaseModel):
    """Config for finance.total-balance widget."""

    account_id: str | None = None  # None = all wallets
    show_currency: bool = True
    comparison_period: Literal["month", "quarter", "year"] = "month"


class BudgetOverviewWidgetConfig(BaseModel):
    """Config for finance.budget-overview widget."""

    budget_id: str | None = None
    category_filter: list[str] = []
    comparison_enabled: bool = True
```

If a widget has no configuration needs, it does not need a model. An empty config (`{}`) is valid.

### 5.2 Widget Config Registry

**File:** `backend/core/registry.py` (extend)

```python
from pydantic import BaseModel

# Extend existing PLUGIN_REGISTRY
WIDGET_CONFIG_MODELS: dict[str, type[BaseModel]] = {}


def register_widget_config_model(widget_id: str, model: type[BaseModel]) -> None:
    """Register a Pydantic model for a widget's data config."""
    WIDGET_CONFIG_MODELS[widget_id] = model
```

Apps register their config models in `__init__.py`:

```python
# backend/apps/finance/__init__.py

def register_plugin() -> None:
    from apps.finance.manifest import app_manifest
    from core.registry import PLUGIN_REGISTRY, register_widget_config_model

    PLUGIN_REGISTRY[app_manifest.id] = {
        "manifest": app_manifest,
        "router": router,
        "models": [],
        "services": {},
    }

    # Register widget config models
    from apps.finance.schemas import (
        TotalBalanceWidgetConfig,
        BudgetOverviewWidgetConfig,
        RecentTransactionsWidgetConfig,
    )

    register_widget_config_model("finance.total-balance", TotalBalanceWidgetConfig)
    register_widget_config_model("finance.budget-overview", BudgetOverviewWidgetConfig)
    register_widget_config_model("finance.recent-transactions", RecentTransactionsWidgetConfig)
```

### 5.3 Config Resolution Helper

**File:** `backend/core/widget_config.py` (new)

```python
"""Widget config resolution — reads DB, validates against Pydantic model, applies defaults."""

import logging
from typing import Any

from pydantic import BaseModel, ValidationError

from core.models import WidgetDataConfig
from core.registry import WIDGET_CONFIG_MODELS

logger = logging.getLogger(__name__)


class WidgetConfigResolutionError(ValueError):
    """Raised when widget config cannot be resolved."""
    pass


def resolve_widget_config(
    user_id: PydanticObjectId,
    widget_id: str,
) -> BaseModel:
    """
    Resolve a user's widget config.

    Reads WidgetDataConfig from DB, deserializes into the registered Pydantic model,
    returns the validated model instance.

    If no DB record exists, returns a model instance with all defaults.
    If Pydantic validation fails, logs the error and returns defaults (never propagate invalid config).
    """
    model_cls = WIDGET_CONFIG_MODELS.get(widget_id)
    if model_cls is None:
        # No config model registered — return empty base model
        return BaseModel()

    doc = await WidgetDataConfig.find_one(
        WidgetDataConfig.user_id == user_id,
        WidgetDataConfig.widget_id == widget_id,
    )

    raw_config = doc.config if doc else {}

    try:
        return model_cls.model_validate(raw_config)
    except ValidationError as e:
        logger.warning(
            f"Widget config validation failed for {widget_id} (user={user_id}): {e}"
        )
        # Return defaults — never serve invalid config
        return model_cls()


def validate_and_serialize_config(
    widget_id: str,
    raw_config: dict[str, Any],
) -> dict[str, Any]:
    """
    Validate a raw config dict against the widget's Pydantic model.

    Raises ValidationError (Pydantic) if invalid.
    Returns the validated + serialized dict (so extra fields are stripped).
    """
    model_cls = WIDGET_CONFIG_MODELS.get(widget_id)
    if model_cls is None:
        return raw_config

    validated = model_cls.model_validate(raw_config)
    return validated.model_dump()
```

---

## 6. API Design

### 6.1 Widget Data Endpoint

**Path:** `GET /api/apps/{app_id}/widgets/{widget_id}`

Serves the widget's typed data response. Reads the user's widget config from DB, applies it, and calls the app's data service.

**Request:**

| Parameter | Type | Location | Description |
|---|---|---|---|
| `app_id` | string | path | App namespace |
| `widget_id` | string | path | Widget identifier, e.g. `"finance.total-balance"` |

**Response:** Defined per widget. Each widget defines a Pydantic response model (see Section 7).

**Behavior:**
1. Authenticate user via JWT.
2. Resolve widget config via `resolve_widget_config(user_id, widget_id)`.
3. Delegate to the app's widget data handler (see Section 6.3).
4. Return the typed response.
5. On error: return structured error (not plain 500).

### 6.2 Widget Config Update Endpoint

**Path:** `PUT /api/apps/{app_id}/widgets/{widget_id}/config`

Saves or updates a user's widget data configuration.

**Request body:**

```json
{
  "config": { ... }  // shape must match the widget's Pydantic config model
}
```

**Response:** `200 OK` — empty or `{ "widget_id": "...", "config": { ... } }`

**Behavior:**
1. Authenticate user via JWT.
2. Validate `config` dict against the registered Pydantic model via `validate_and_serialize_config`.
3. Upsert into `WidgetDataConfig` (insert if not exists, update if exists).
4. Return success.

**Error responses:**
- `400 Bad Request` — config validation failed. Body includes Pydantic validation errors.

### 6.3 Per-App Widget Data Handler

Each app registers a handler function that is called by the platform widget router. This keeps the platform router generic while allowing each app to assemble its own data.

**File:** `backend/core/registry.py` (extend)

```python
from typing import Callable, Awaitable
from pydantic import BaseModel

WidgetDataHandler = Callable[
    [PydanticObjectId, str, BaseModel],   // user_id, widget_id, resolved config
    Awaitable[BaseModel],                  // returns widget data response
]

WIDGET_DATA_HANDLERS: dict[str, WidgetDataHandler] = {}
```

Apps register a handler in `register_plugin()`:

```python
# backend/apps/finance/__init__.py

from core.registry import register_widget_data_handler

register_widget_data_handler(
    "finance",
    finance_widget_data_handler,  # async function defined in routes.py or service.py
)
```

The platform router in `core/catalog/routes.py` calls the registered handler.

**Why a handler and not just route to `apps/{app}/routes.py`?**

Because the widget endpoints (`/widgets/{widget_id}`) share the same path prefix regardless of which internal app route they map to. A direct FastAPI sub-router approach would work too, but the handler pattern is cleaner — the widget router stays in `core`, each app just provides a data-fetching function.

---

## 7. Per-Widget Response Schemas

Each widget defines a Pydantic model for what its data endpoint returns. These are **response models only** — not config models. They live in `apps/{app_id}/schemas.py`.

### Finance

```python
# backend/apps/finance/schemas.py

class TotalBalanceWidgetResponse(BaseModel):
    """Response for finance.total-balance widget."""
    balance: float
    currency: str
    account_id: str | None  # which account was filtered
    account_name: str | None
    income_this_month: float
    expense_this_month: float
    trend: Literal["up", "down", "neutral"] | None
    trend_percentage: float | None
    as_of: datetime


class BudgetOverviewWidgetResponse(BaseModel):
    """Response for finance.budget-overview widget."""
    categories: list[BudgetCategoryItem]
    total_budget: float
    total_spent: float
    remaining: float
    over_budget: bool
    period: str  # "April 2026"


class BudgetCategoryItem(BaseModel):
    name: str
    icon: str
    budget: float
    spent: float
    remaining: float
    percentage_used: float
    is_over_budget: bool


class RecentTransactionsWidgetResponse(BaseModel):
    """Response for finance.recent-transactions widget."""
    transactions: list[TransactionItem]
    total_income_month: float
    total_expense_month: float


class TransactionItem(BaseModel):
    id: str
    title: str
    amount: float
    type: Literal["income", "expense"]
    category: str
    wallet: str
    date: datetime
    note: str | None
```

### Calendar

```python
# backend/apps/calendar/schemas.py

class MonthViewWidgetResponse(BaseModel):
    """Response for calendar.month-view widget."""
    events: list[CalendarEventItem]
    calendars: list[CalendarItem]
    today: date


class CalendarEventItem(BaseModel):
    id: str
    title: str
    start: datetime
    end: datetime | None
    calendar_id: str
    calendar_name: str
    calendar_color: str


class UpcomingWidgetResponse(BaseModel):
    """Response for calendar.upcoming widget."""
    events: list[UpcomingEventItem]
    has_more: bool


class UpcomingEventItem(BaseModel):
    id: str
    title: str
    date_label: str  # "Today", "Tomorrow", or formatted date
    time: str | None
    calendar_color: str
```

### Todo

```python
# backend/apps/todo/schemas.py

class TaskListWidgetResponse(BaseModel):
    """Response for todo.task-list widget."""
    tasks: list[WidgetTaskItem]
    total_pending: int
    total_completed: int
    filter_applied: str


class WidgetTaskItem(BaseModel):
    id: str
    title: str
    priority: Literal["low", "medium", "high"]
    due_date: date | None
    tags: list[str]
    is_completed: bool


class TodayWidgetResponse(BaseModel):
    """Response for todo.today widget."""
    due_today: list[WidgetTaskItem]
    overdue: list[WidgetTaskItem]
    total_due_today: int
    total_overdue: int
```

---

## 8. Schema Changes (shared/schemas.py)

### 8.1 `PreferenceUpdate` — Remove config

```python
class PreferenceUpdate(BaseModel):
    """Update payload for widget layout preferences."""

    widget_id: str
    enabled: bool | None = None
    sort_order: int | None = None
    grid_x: int | None = Field(default=None, ge=0)  # NEW
    grid_y: int | None = Field(default=None, ge=0)  # NEW
    size_w: int | None = Field(default=None, ge=2, le=12)
    size_h: int | None = Field(default=None, ge=1, le=6)
    # REMOVED: config: dict | None
```

### 8.2 `WidgetPreferenceSchema` — Update response

```python
class WidgetPreferenceSchema(BaseModel):
    """User-specific widget layout state returned in API responses."""

    widget_id: str
    app_id: str
    enabled: bool = False
    sort_order: int = 0
    grid_x: int = 0  # NEW
    grid_y: int = 0  # NEW
    size_w: int | None = None
    size_h: int | None = None
    # REMOVED: config

    model_config = {"from_attributes": True}
```

### 8.3 New Schemas

```python
# Widget data config — used in widget config endpoints
class WidgetDataConfigSchema(BaseModel):
    """A user's data config for a single widget."""

    widget_id: str
    config: dict  # Typed via codegen from the widget's Pydantic model

    model_config = {"from_attributes": True}


class WidgetDataConfigUpdate(BaseModel):
    """Request body to save a widget's data config."""

    widget_id: str
    config: dict  # Validated by BE against the widget's Pydantic model
```

---

## 9. Codegen Coverage

### 9.1 How Codegen Picks Up Widget Endpoints

The codegen (Step 3) filters all OpenAPI paths by prefix `/api/apps/{app_id}/`. Every path under this prefix is automatically picked up — **no whitelist, no manual registration**.

Adding `GET /api/apps/{app_id}/widgets/{widget_id}` and `PUT /api/apps/{app_id}/widgets/{widget_id}/config` will automatically:

1. Generate a function `getWidget(widget_id: string)` and `updateWidgetDataConfig(widget_id: string, request: WidgetDataConfigUpdate)` in `src/apps/{app_id}/api.ts`.
2. Import the response schema type (`FinanceTotalBalanceWidgetResponse`, etc.) from `@/types/generated`.
3. The response schema type will be a **proper TypeScript interface** with all fields typed, not `Record<string, unknown>`.

### 9.2 `FUNCTION_NAME_OVERRIDES` Additions

The codegen auto-derives function names from operation IDs. To get good names, add overrides:

```python
# scripts/codegen.py — FUNCTION_NAME_OVERRIDES

"finance": {
    ...
    "get_widget": "getWidgetData",
    "update_widget_data_config": "updateWidgetDataConfig",
},
"calendar": {
    ...
    "get_widget": "getWidgetData",
    "update_widget_data_config": "updateWidgetDataConfig",
},
"todo": {
    ...
    "get_widget": "getWidgetData",
    "update_widget_data_config": "updateWidgetDataConfig",
},
```

### 9.3 Widget Config Types via `DERIVED_TYPE_ALIASES`

Since each widget config model is a Pydantic model registered in the app's `schemas.py` and exposed via the `PUT` endpoint's request body (`WidgetDataConfigUpdate.config`), the OpenAPI schema will include the full nested object. The codegen will generate a TypeScript type for each config.

However, the `WidgetDataConfigUpdate` schema uses `config: dict` (generic) — it should instead use a **union of all registered widget config types**, or a separate schema per widget endpoint.

**Decision:** Each widget config endpoint should have its own request/response schema, named after the widget. This ensures TypeScript gets exact types:

```
PUT /api/apps/finance/widgets/total-balance/config
  → Request:  FinanceTotalBalanceWidgetConfigUpdate  (config: { account_id, show_currency, ... })
  → Response: FinanceTotalBalanceWidgetConfigSchema (config: { ... })

GET /api/apps/finance/widgets/total-balance
  → Response: FinanceTotalBalanceWidgetResponse (rich data response)
```

This way codegen generates one function per widget, with exact request/response types.

### 9.4 Enforcement: No Manual Type Definitions in FE App Code

The following rules are enforced:

- **`src/apps/{app_id}/types.ts`** — may only re-export from `@/types/generated`. May not define new schema types.
- **`src/apps/{app_id}/api.ts`** — fully auto-generated. Never edit manually.
- Widget component props must import response types from the generated `api.ts`.
- If a widget needs a local view-model type (computed from multiple API responses), it must be a **local-only** type with no BE contract equivalent.

```typescript
// ✅ CORRECT — widget uses generated types
import { getWidgetData } from "./api";
import type { FinanceTotalBalanceWidgetResponse } from "./api";

export function TotalBalanceWidget() {
  const { data } = useSWR(widgetId, (id) => getWidgetData(id));
  const resp = data as FinanceTotalBalanceWidgetResponse | undefined;
  // resp.balance is typed as number ✅
}

 ❌ WRONG — manually defining the type
export function TotalBalanceWidget() {
  const { data } = useSWR(widgetId, (id) => getWidgetData(id));
  const resp = data as { balance: number }; // ❌ NEVER do this
}
```

A lint rule should be added to ESLint to prevent manual schema type definitions in app code:

```javascript
// frontend/.eslintrc.js
{
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "VariableDeclarator > TypeAnnotation TSTypeAnnotation",
        message: "Do not manually define schema types in app code. Import from the generated API.",
      },
    ],
  },
}
```

---

## 10. Frontend Changes

### 10.1 `useWidgetPreferences.ts` — Read `grid_x/y` Directly

Current code reads `config.gridX` / `config.gridY`. Must change to read `preference.grid_x` / `preference.grid_y` directly.

```typescript
// src/pages/dashboard/useWidgetPreferences.ts

// BEFORE
const gridX = pref.config.gridX ?? 0;
const gridY = pref.config.gridY ?? 0;

// AFTER
const gridX = pref.grid_x ?? 0;
const gridY = pref.grid_y ?? 0;
```

`PreferenceUpdate` no longer accepts `config` — layout updates send `grid_x` and `grid_y` as top-level fields.

### 10.2 Widget Settings API

Each widget's settings panel needs to call `PUT /widgets/{widget_id}/config` to save data config. This function is auto-generated in `src/apps/{app_id}/api.ts`:

```typescript
// Auto-generated in src/apps/finance/api.ts
export async function updateWidgetDataConfig(
  widget_id: string,
  request: FinanceTotalBalanceWidgetConfigUpdate
): Promise<FinanceTotalBalanceWidgetConfigSchema> {
  return appRequest<FinanceTotalBalanceWidgetConfigSchema>(
    "finance",
    `/widgets/${encodeURIComponent(String(widget_id))}/config`,
    { method: "PUT", body: request }
  );
}
```

### 10.3 Widget Data Fetching

Each widget calls `getWidgetData(widget_id)` to fetch its data:

```typescript
// Auto-generated in src/apps/finance/api.ts
export async function getWidgetData(
  widget_id: string
): Promise<FinanceTotalBalanceWidgetResponse> {
  return appRequest<FinanceTotalBalanceWidgetResponse>(
    "finance",
    `/widgets/${encodeURIComponent(String(widget_id))}`,
  );
}
```

Widget components switch on `widget_id` to call the right app's function:

```typescript
// src/apps/finance/widgets/TotalBalanceWidget.tsx
import { getWidgetData } from "../api";
import type { FinanceTotalBalanceWidgetResponse } from "../api";

export function TotalBalanceWidget({ widgetId }: { widgetId: string }) {
  const { data, isLoading } = useSWR(
    widgetId,
    (id) => getWidgetData(id),
    swrConfig
  );

  const resp = data as FinanceTotalBalanceWidgetResponse | undefined;

  if (isLoading) return <WidgetSkeleton />;
  if (!resp) return <WidgetError />;

  return (
    <div className="stat-value">{formatCurrency(resp.balance, resp.currency)}</div>
    <div className="trend-indicator trend-{resp.trend}">
      {resp.trend_percentage && `${resp.trend} ${resp.trend_percentage}%`}
    </div>
  );
}
```

### 10.4 Widget Settings Modal

Each app needs a settings modal for its configurable widgets. This is a per-app concern — the platform provides a generic "Settings" button on the widget header, and each app renders its own settings form.

```typescript
// src/apps/finance/widgets/TotalBalanceWidgetSettings.tsx

import { updateWidgetDataConfig } from "../api";
import type { FinanceTotalBalanceWidgetConfigUpdate } from "../api";

export function TotalBalanceWidgetSettings({
  widgetId,
  currentConfig,
  onSave,
}: {
  widgetId: string;
  currentConfig: FinanceTotalBalanceWidgetConfigUpdate["config"];
  onSave: (config: FinanceTotalBalanceWidgetConfigUpdate["config"]) => void;
}) {
  const [accountId, setAccountId] = useState(currentConfig.account_id ?? null);
  const [showCurrency, setShowCurrency] = useState(currentConfig.show_currency ?? true);
  const [comparison, setComparison] = useState(currentConfig.comparison_period ?? "month");

  async function handleSave() {
    const update: FinanceTotalBalanceWidgetConfigUpdate = {
      config: {
        account_id: accountId,
        show_currency: showCurrency,
        comparison_period: comparison,
      },
    };
    await updateWidgetDataConfig(widgetId, update);
    onSave(update.config);
  }

  return (
    <Modal>
      <Select value={accountId} onChange={setAccountId}>
        <Option value={null}>Tất cả ví</Option>
        {/* Wallets fetched separately */}
      </Select>
      <Toggle checked={showCurrency} onChange={setShowCurrency} />
      <Select value={comparison} onChange={setComparison}>
        <Option value="month">So với tháng trước</Option>
        <Option value="quarter">So với quý trước</Option>
        <Option value="year">So với năm trước</Option>
      </Select>
      <Button onClick={handleSave}>Lưu</Button>
    </Modal>
  );
}
```

The platform `DashboardWidgetRenderer` provides a gear icon on each widget that opens the app's settings component if one is registered. See Section 10.5.

### 10.5 Platform Widget Settings Registration

The platform manages which widget has a settings component. Each app registers its settings components via a registry (similar to the widget components registry):

```typescript
// src/lib/widget-settings-registry.ts

import type { ComponentType } from "react";

type WidgetSettingsProps = {
  widgetId: string;
  currentConfig: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onClose: () => void;
};

const WIDGET_SETTINGS: Record<string, ComponentType<WidgetSettingsProps>> = {};

export function registerWidgetSettings(
  widgetId: string,
  Component: ComponentType<WidgetSettingsProps>
) {
  WIDGET_SETTINGS[widgetId] = Component;
}

export function getWidgetSettings(widgetId: string) {
  return WIDGET_SETTINGS[widgetId] ?? null;
}
```

Apps register in their `__init__.ts` or a dedicated setup file:

```typescript
// src/apps/finance/widget-settings.ts

import { registerWidgetSettings } from "@/lib/widget-settings-registry";
import { TotalBalanceWidgetSettings } from "./widgets/TotalBalanceWidgetSettings";
import { BudgetOverviewWidgetSettings } from "./widgets/BudgetOverviewWidgetSettings";

export function registerFinanceWidgetSettings() {
  registerWidgetSettings("finance.total-balance", TotalBalanceWidgetSettings);
  registerWidgetSettings("finance.budget-overview", BudgetOverviewWidgetSettings);
}
```

---

## 11. Migration

### 11.1 DB Migration: Extract grid from config to fields

Run once to migrate existing `WidgetPreference` documents:

```python
# backend/core/migrations/migrate_widget_preference_grid.py

async def migrate():
    cursor = WidgetPreference.find_all()
    async for doc in cursor:
        grid_x = doc.config.pop("gridX", 0)
        grid_y = doc.config.pop("gridY", 0)
        doc.grid_x = grid_x
        doc.grid_y = grid_y
        await doc.save()

    print(f"Migrated WidgetPreference grid fields.")
```

After migration, `config` dict in `WidgetPreference` should be empty or contain only non-grid keys. A follow-up cleanup can remove the `config` field from the Beanie model.

### 11.2 Widget DataConfig Seeding

When a new widget is installed, seed an empty `WidgetDataConfig`:

```python
# In catalog/service.py — when seeding widget preferences on install
async def _seed_widget_preferences(user_id: ObjectId, app_id: str, widgets: list[WidgetManifest]):
    for widget in widgets:
        await WidgetPreference(
            user_id=user_id,
            widget_id=widget.id,
            app_id=app_id,
            enabled=False,
            sort_order=0,
            grid_x=0,
            grid_y=0,
        ).upsert(WidgetPreference.user_id == user_id, WidgetPreference.widget_id == widget.id)

        # NEW: Seed empty data config
        await WidgetDataConfig(
            user_id=user_id,
            widget_id=widget.id,
            config={},
        ).upsert(WidgetDataConfig.user_id == user_id, WidgetDataConfig.widget_id == widget.id)
```

---

## 12. Implementation Order

### Phase 1: Core infrastructure (no widget changes)

1. Add `grid_x`, `grid_y` fields to `WidgetPreference` Beanie model.
2. Add `WidgetDataConfig` Beanie document.
3. Update `PreferenceUpdate`, `WidgetPreferenceSchema` in `shared/schemas.py`.
4. Add `WidgetDataConfigSchema`, `WidgetDataConfigUpdate` to `shared/schemas.py`.
5. Add `validate_and_serialize_config`, `resolve_widget_config` to `core/widget_config.py`.
6. Add `WIDGET_CONFIG_MODELS`, `register_widget_config_model`, `WIDGET_DATA_HANDLERS`, `register_widget_data_handler` to `core/registry.py`.
7. Run migration script.
8. Update FE `useWidgetPreferences.ts` to read `grid_x/y`.

### Phase 2: Widget data endpoints (per app)

9. Define Pydantic response models for each widget (Section 7).
10. Define Pydantic config models for each configurable widget (Section 5.1).
11. Register config models and data handlers in each app's `__init__.py`.
12. Implement `GET /widgets/{widget_id}` and `PUT /widgets/{widget_id}/config` routes in each app's router.
13. Add `FUNCTION_NAME_OVERRIDES` entries to `scripts/codegen.py`.
14. Run `npm run codegen`.

### Phase 3: Widget component rewrites

15. Rewrite each widget component to call `getWidgetData(widget_id)` instead of its current ad-hoc API calls.
16. Render the typed response data (not just numbers).
17. Wire up widget settings modal with settings components.

---

## 13. Open Questions

1. **Dashboard bootstrap payload:** Should `WorkspaceBootstrap` include the full `WidgetDataConfig` for each widget, or should widgets fetch their config on mount? Including in bootstrap saves a round-trip but increases bootstrap payload size. Decision: include in bootstrap for now, lazy-reload on settings save.

2. **Widget config options validation on save:** If the manifest defines `options_source: "finance.wallets"`, the FE needs wallet options to render a select. Should the BE expose a `/widgets/{widget_id}/options` endpoint that returns valid options, or should FE call the app's existing options endpoints? Decision: FE calls the app's existing options endpoints (e.g., `getWallets()`). The settings modal knows which app owns the widget.

3. **Error handling for missing config model:** If a widget registers but has no config model, `resolve_widget_config` returns `BaseModel()`. Should the widget endpoint return a 404 instead? Decision: return empty config — widgets without config models work fine with empty config.
