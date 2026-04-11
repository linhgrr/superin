# Widget Data System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current widget system where widgets only display raw numbers from summary endpoints, with a per-widget data endpoint architecture. Each widget gets a dedicated endpoint that reads user-specific config from `WidgetDataConfig`, assembles rich data, and returns a typed response. Layout config (`grid_x`, `grid_y`) is separated from widget data config.

**Architecture:**
- New `WidgetDataConfig` document (separate from `WidgetPreference`)
- `grid_x` and `grid_y` become hardcoded fields on `WidgetPreference` (no longer in `config` dict)
- Each widget defines Pydantic config models + response models in app schemas
- `GET /api/apps/{app_id}/widgets/{widget_id}` returns rich typed widget data
- `PUT /api/apps/{app_id}/widgets/{widget_id}/config` saves per-user widget settings
- `GET /api/apps/{app_id}/widgets/{widget_id}/options` returns settings form metadata
- Codegen auto-generates TypeScript functions + types from OpenAPI
- FE `useWidgetPreferences` reads `grid_x/y` directly from `WidgetPreferenceSchema`

**Tech Stack:** FastAPI + Beanie (MongoDB), React + SWR + TypeScript, Pydantic, OpenAPI codegen

---

## File Map

```
backend/
├── core/
│   ├── models.py                         # MODIFY: WidgetPreference (grid_x/y), add WidgetDataConfig
│   ├── registry.py                       # MODIFY: add WIDGET_CONFIG_MODELS, WIDGET_DATA_HANDLERS
│   ├── widget_config.py                  # CREATE: resolve_widget_config, validate_and_serialize_config
│   ├── catalog/
│   │   └── routes.py                     # MODIFY: update_preferences handles grid_x/y
│   ├── catalog/
│   │   └── service.py                     # MODIFY: _seed_widget_preferences adds grid_x/y + WidgetDataConfig seed
│   └── workspace/
│       └── service.py                     # MODIFY: list_workspace_preferences includes WidgetDataConfig in bootstrap
│
├── apps/
│   ├── finance/
│   │   ├── __init__.py                   # MODIFY: register config models + data handler
│   │   ├── schemas.py                     # MODIFY: add widget response + config Pydantic models
│   │   └── routes.py                      # MODIFY: add widget data/config/options endpoints
│   ├── calendar/
│   │   ├── __init__.py                   # MODIFY: register config models + data handler
│   │   ├── schemas.py                     # MODIFY: add widget response + config Pydantic models
│   │   └── routes.py                      # MODIFY: add widget data/config/options endpoints
│   └── todo/
│       ├── __init__.py                   # MODIFY: register config models + data handler
│       ├── schemas.py                     # MODIFY: add widget response + config Pydantic models
│       └── routes.py                      # MODIFY: add widget data/config/options endpoints
│
├── shared/
│   ├── schemas.py                         # MODIFY: PreferenceUpdate (grid_x/y), WidgetPreferenceSchema (grid_x/y), add WidgetDataConfigSchema, WidgetDataConfigUpdate
│   └── preference_utils.py                # MODIFY: _build_update_document + _apply_update_to_preference use grid_x/y; preference_to_schema includes grid_x/y
│
└── scripts/
    └── codegen.py                         # MODIFY: FUNCTION_NAME_OVERRIDES for widget endpoints

frontend/
├── src/
│   ├── lib/
│   │   └── widget-settings-registry.ts    # CREATE: registerWidgetSettings, getWidgetSettings
│   ├── api/
│   │   └── catalog.ts                     # MODIFY: updatePreferences removes config from PreferenceUpdate
│   └── pages/dashboard/
│       ├── useWidgetPreferences.ts        # MODIFY: read grid_x/y directly, remove config.gridX/Y
│       ├── layout-engine.ts                # MODIFY: getSavedGridPosition reads grid_x/y top-level
│       └── preference-utils.ts            # MODIFY: PreferenceUpdate no longer has config field
│
backend/core/migrations/
└── migrate_widget_preference_grid.py      # CREATE: one-time migration script
```

---

## Phase 1: Core Infrastructure (Backend)

### Task 1: Update `WidgetPreference` model + add `WidgetDataConfig`

**Files:**
- Modify: `backend/core/models.py`
- Test: `backend/core/test_models.py` (create if not exists)

- [ ] **Step 1: Write failing test for new model structure**

```python
# backend/core/test_models.py
import pytest
from beanie import PydanticObjectId
from core.models import WidgetPreference, WidgetDataConfig


def test_widget_preference_has_grid_fields():
    pref = WidgetPreference(
        user_id=PydanticObjectId(),
        widget_id="finance.total-balance",
        app_id="finance",
        enabled=True,
        sort_order=0,
        grid_x=3,
        grid_y=2,
        size_w=6,
        size_h=2,
    )
    assert pref.grid_x == 3
    assert pref.grid_y == 2
    # config field should not exist on the document
    assert not hasattr(pref, "config")


def test_widget_data_config_stores_config():
    doc = WidgetDataConfig(
        user_id=PydanticObjectId(),
        widget_id="finance.total-balance",
        config={"account_id": "vcb-123", "show_currency": True},
    )
    assert doc.config["account_id"] == "vcb-123"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/linh/Downloads/superin/backend && python -m pytest core/test_models.py -v`
Expected: FAIL — `WidgetPreference` still has `config` field, `WidgetDataConfig` doesn't exist

- [ ] **Step 3: Implement**

In `backend/core/models.py`, modify `WidgetPreference`:

```python
# REPLACE the existing WidgetPreference class with:
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

    class Settings:
        name = "widget_preferences"
        indexes = [
            IndexModel(
                [("user_id", 1), ("widget_id", 1)],
                name="widget_preferences_user_id_widget_id_unique",
                unique=True,
            ),
        ]
```

Add new `WidgetDataConfig` class after `WidgetPreference`:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/linh/Downloads/superin/backend && python -m pytest core/test_models.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/core/models.py backend/core/test_models.py
git commit -m "feat(core): add grid_x/y fields to WidgetPreference, add WidgetDataConfig"
```

---

### Task 2: Update shared schemas

**Files:**
- Modify: `backend/shared/schemas.py`

- [ ] **Step 1: Write failing test for schema changes**

```python
# backend/shared/test_schemas.py
import pytest
from pydantic import ValidationError
from shared.schemas import PreferenceUpdate, WidgetPreferenceSchema, WidgetDataConfigUpdate


def test_preference_update_has_grid_fields_not_config():
    # Should accept grid_x/grid_y, reject config
    upd = PreferenceUpdate(widget_id="finance.total-balance", grid_x=2, grid_y=3, size_w=6)
    assert upd.grid_x == 2
    assert upd.grid_y == 3
    assert upd.config is None  # config field removed


def test_preference_update_rejects_config():
    with pytest.raises(ValidationError):
        PreferenceUpdate(widget_id="f.tb", config={"accountId": "vcb"})  # config no longer valid


def test_widget_data_config_update_schema():
    update = WidgetDataConfigUpdate(
        widget_id="finance.total-balance",
        config={"account_id": "vcb-123", "show_currency": True},
    )
    assert update.config["account_id"] == "vcb-123"


def test_widget_preference_schema_has_grid_fields():
    schema = WidgetPreferenceSchema(
        widget_id="finance.total-balance",
        app_id="finance",
        enabled=True,
        sort_order=0,
        grid_x=1,
        grid_y=2,
        size_w=6,
        size_h=2,
    )
    assert schema.grid_x == 1
    assert schema.grid_y == 2
    assert not hasattr(schema, "config") or schema.config is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/linh/Downloads/superin/backend && python -m pytest shared/test_schemas.py -v`
Expected: FAIL — schemas still have old shape

- [ ] **Step 3: Implement**

In `backend/shared/schemas.py`:

**Replace `PreferenceUpdate`**:
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
```

**Replace `WidgetPreferenceSchema`**:
```python
class WidgetPreferenceSchema(BaseModel):
    """User-specific widget layout state returned in API responses."""

    id: str | None = Field(default=None, alias="_id")
    user_id: str
    widget_id: str
    app_id: str
    enabled: bool = False
    sort_order: int = 0
    grid_x: int = 0  # NEW
    grid_y: int = 0  # NEW
    size_w: int | None = None
    size_h: int | None = None
    # config removed

    model_config = {"from_attributes": True, "populate_by_name": True}
```

**Add new schemas at end of file**:
```python
class WidgetDataConfigSchema(BaseModel):
    """A user's data config for a single widget."""

    widget_id: str
    config: dict  # Shape is widget-specific; validated by Pydantic model at runtime

    model_config = {"from_attributes": True}


class WidgetDataConfigUpdate(BaseModel):
    """Request body to save a widget's data config."""

    widget_id: str
    config: dict  # Validated by BE against the widget's registered Pydantic model
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/linh/Downloads/superin/backend && python -m pytest shared/test_schemas.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/shared/schemas.py backend/shared/test_schemas.py
git commit -m "feat(shared): update PreferenceUpdate/WidgetPreferenceSchema with grid_x/y, add WidgetDataConfig schemas"
```

---

### Task 3: Update `preference_utils.py`

**Files:**
- Modify: `backend/shared/preference_utils.py`

- [ ] **Step 1: Write failing test**

```python
# backend/shared/test_preference_utils.py
import pytest
from unittest.mock import MagicMock
from pydantic import BaseModel
from shared.schemas import PreferenceUpdate, WidgetDataConfigUpdate
from shared.preference_utils import _build_update_document, _apply_update_to_preference
from core.models import WidgetPreference


def test_build_update_document_handles_grid_x_y():
    from beanie import PydanticObjectId
    upd = PreferenceUpdate(widget_id="f.tb", grid_x=2, grid_y=3, enabled=True)
    doc = _build_update_document(upd, user_object_id=PydanticObjectId(), app_id="finance")
    assert doc["$set"]["grid_x"] == 2
    assert doc["$set"]["grid_y"] == 3
    assert "config" not in doc["$set"]
    assert "config" not in doc["$setOnInsert"]


def test_apply_update_uses_grid_x_y():
    from beanie import PydanticObjectId
    pref = WidgetPreference(
        user_id=PydanticObjectId(),
        widget_id="f.tb",
        app_id="finance",
        grid_x=0,
        grid_y=0,
    )
    upd = PreferenceUpdate(widget_id="f.tb", grid_x=5, grid_y=1)
    _apply_update_to_preference(pref, upd)
    assert pref.grid_x == 5
    assert pref.grid_y == 1
    assert pref.config == {}  # still accessible but empty


def test_preference_to_schema_includes_grid_fields():
    from beanie import PydanticObjectId
    pref = WidgetPreference(
        user_id=PydanticObjectId(),
        widget_id="f.tb",
        app_id="finance",
        grid_x=3,
        grid_y=7,
        size_w=6,
        size_h=2,
        config={},
    )
    schema = preference_to_schema(pref)
    assert schema["grid_x"] == 3
    assert schema["grid_y"] == 7
    assert "config" not in schema or schema.get("config") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/linh/Downloads/superin/backend && python -m pytest shared/test_preference_utils.py -v`
Expected: FAIL — current code still uses config dict

- [ ] **Step 3: Implement**

In `backend/shared/preference_utils.py`:

**Replace `_apply_update_to_preference`**:
```python
def _apply_update_to_preference(
    pref: WidgetPreference,
    update: PreferenceUpdate,
) -> None:
    if update.enabled is not None:
        pref.enabled = update.enabled

    if update.sort_order is not None:
        pref.sort_order = update.sort_order

    # grid_x / grid_y — top-level fields
    if update.grid_x is not None:
        pref.grid_x = update.grid_x
    if update.grid_y is not None:
        pref.grid_y = update.grid_y

    if update.size_w is not None:
        pref.size_w = update.size_w
    if update.size_h is not None:
        pref.size_h = update.size_h
```

**Replace `_build_update_document`**:
```python
def _build_update_document(
    update: PreferenceUpdate,
    *,
    user_object_id: PydanticObjectId,
    app_id: str,
) -> dict[str, dict]:
    payload = update.model_dump(exclude_unset=True)
    set_payload = {
        key: payload[key]
        for key in ("enabled", "sort_order", "grid_x", "grid_y", "size_w", "size_h")
        if key in payload
    }
    insert_defaults = {
        "user_id": user_object_id,
        "app_id": app_id,
        "widget_id": update.widget_id,
        "enabled": False,
        "sort_order": 0,
        "grid_x": 0,
        "grid_y": 0,
        "size_w": None,
        "size_h": None,
    }
    set_on_insert = {
        key: value
        for key, value in insert_defaults.items()
        if key not in set_payload
    }

    update_document: dict[str, dict] = {"$setOnInsert": set_on_insert}
    if set_payload:
        update_document["$set"] = set_payload
    return update_document
```

**Update `preference_to_schema`**:
```python
def preference_to_schema(
    pref: WidgetPreference,
    schema_class: type = None,
) -> dict:
    """Convert a WidgetPreference document to a schema dict."""
    from shared.schemas import WidgetPreferenceSchema

    if schema_class is None:
        schema_class = WidgetPreferenceSchema

    return schema_class(
        id=str(pref.id),
        user_id=str(pref.user_id),
        widget_id=pref.widget_id,
        app_id=pref.app_id,
        enabled=pref.enabled,
        sort_order=pref.sort_order,
        grid_x=pref.grid_x,  # NEW
        grid_y=pref.grid_y,  # NEW
        size_w=pref.size_w,
        size_h=pref.size_h,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/linh/Downloads/superin/backend && python -m pytest shared/test_preference_utils.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/shared/preference_utils.py backend/shared/test_preference_utils.py
git commit -m "feat(shared): update preference_utils to use grid_x/y fields instead of config dict"
```

---

### Task 4: Add widget config registry and helpers

**Files:**
- Modify: `backend/core/registry.py`
- Create: `backend/core/widget_config.py`
- Test: `backend/core/test_widget_config.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/core/test_widget_config.py
import pytest
from unittest.mock import AsyncMock, patch
from pydantic import BaseModel
from core.models import WidgetDataConfig
from core.widget_config import resolve_widget_config, validate_and_serialize_config


class DummyConfig(BaseModel):
    account_id: str | None = None
    show_currency: bool = True


def test_validate_and_serialize_strips_extra_fields():
    result = validate_and_serialize_config(
        "test-widget",
        {"account_id": "vcb", "show_currency": True, "unknown_field": 123},
    )
    assert "account_id" in result
    assert "show_currency" in result
    assert "unknown_field" not in result


def test_validate_and_serialize_validates_type():
    with pytest.raises(Exception):  # Pydantic ValidationError
        validate_and_serialize_config(
            "test-widget",
            {"account_id": 123},  # should be str
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/linh/Downloads/superin/backend && python -m pytest core/test_widget_config.py -v`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement**

Add to `backend/core/registry.py` at end of file (after existing code):

```python
# ─── Widget Config Registry ───────────────────────────────────────────────────

from pydantic import BaseModel

WIDGET_CONFIG_MODELS: dict[str, type[BaseModel]] = {}
WIDGET_OPTIONS_HANDLERS: dict[str, callable] = {}


def register_widget_config_model(widget_id: str, model: type[BaseModel]) -> None:
    """Register a Pydantic model for a widget's data config."""
    WIDGET_CONFIG_MODELS[widget_id] = model


def register_widget_options_handler(widget_id: str, handler: callable) -> None:
    """Register an options generator for a widget's settings form."""
    WIDGET_OPTIONS_HANDLERS[widget_id] = handler
```

Create `backend/core/widget_config.py`:

```python
"""Widget config resolution — reads DB, validates against Pydantic model, applies defaults."""

from __future__ import annotations

import logging
from typing import Any

from beanie import PydanticObjectId
from pydantic import BaseModel, ValidationError

from core.models import WidgetDataConfig
from core.registry import WIDGET_CONFIG_MODELS

logger = logging.getLogger(__name__)


async def resolve_widget_config(
    user_id: str,
    widget_id: str,
) -> BaseModel:
    """
    Resolve a user's widget config.

    Reads WidgetDataConfig from DB, deserializes into the registered Pydantic model,
    returns the validated model instance.

    If no DB record exists, returns a model instance with all defaults.
    If Pydantic validation fails, logs the error and returns defaults (fail-safe).
    """
    model_cls = WIDGET_CONFIG_MODELS.get(widget_id)
    if model_cls is None:
        # No config model registered — return empty base model
        return BaseModel()

    doc = await WidgetDataConfig.find_one(
        WidgetDataConfig.user_id == PydanticObjectId(user_id),
        WidgetDataConfig.widget_id == widget_id,
    )

    raw_config = doc.config if doc else {}

    try:
        return model_cls.model_validate(raw_config)
    except ValidationError as e:
        logger.warning(
            "Widget config validation failed for %s (user=%s): %s",
            widget_id,
            user_id,
            e,
        )
        # Return defaults — never serve invalid config
        return model_cls()


def validate_and_serialize_config(
    widget_id: str,
    raw_config: dict[str, Any],
) -> dict[str, Any]:
    """
    Validate a raw config dict against the widget's Pydantic model.

    Raises Pydantic ValidationError if invalid.
    Returns the validated + serialized dict (extra fields are stripped).
    """
    model_cls = WIDGET_CONFIG_MODELS.get(widget_id)
    if model_cls is None:
        return raw_config

    validated = model_cls.model_validate(raw_config)
    return validated.model_dump()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/linh/Downloads/superin/backend && python -m pytest core/test_widget_config.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/core/registry.py backend/core/widget_config.py backend/core/test_widget_config.py
git commit -m "feat(core): add WIDGET_CONFIG_MODELS registry and widget_config helpers"
```

---

### Task 5: Update seeding and workspace bootstrap

**Files:**
- Modify: `backend/core/catalog/service.py`
- Modify: `backend/core/workspace/service.py`

- [ ] **Step 1: Write failing test**

```python
# backend/core/test_catalog_service.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from pydantic import PydanticObjectId
from core.catalog.service import _seed_widget_preferences


@pytest.mark.asyncio
async def test_seed_widget_preferences_sets_grid_fields():
    # Patch WidgetPreference and WidgetDataConfig
    # Verify that seeded docs have grid_x=0, grid_y=0
    # and that WidgetDataConfig is also seeded
    pass
```

- [ ] **Step 2: Implement**

In `backend/core/catalog/service.py`, replace `_seed_widget_preferences`:

```python
async def _seed_widget_preferences(user_id: str, app_id: str, widgets: list[Any]) -> None:
    """Create missing widget preferences for an installed app."""
    from core.models import WidgetDataConfig

    widget_ids = [widget.id for widget in widgets]
    if not widget_ids:
        return

    existing_prefs = await WidgetPreference.find(
        WidgetPreference.user_id == PydanticObjectId(user_id),
        In(WidgetPreference.app_id, [app_id]),
    ).to_list()
    existing_ids = {pref.widget_id for pref in existing_prefs}

    prefs_to_insert = [
        WidgetPreference(
            user_id=PydanticObjectId(user_id),
            widget_id=widget.id,
            app_id=app_id,
            enabled=True,
            sort_order=index,
            grid_x=0,
            grid_y=0,
        )
        for index, widget in enumerate(widgets)
        if widget.id not in existing_ids
    ]
    if prefs_to_insert:
        await WidgetPreference.insert_many(prefs_to_insert)

    # Also seed empty widget data configs
    existing_data_configs = await WidgetDataConfig.find(
        WidgetDataConfig.user_id == PydanticObjectId(user_id),
    ).to_list()
    existing_data_ids = {doc.widget_id for doc in existing_data_configs}

    configs_to_insert = [
        WidgetDataConfig(
            user_id=PydanticObjectId(user_id),
            widget_id=widget.id,
            config={},
        )
        for widget in widgets
        if widget.id not in existing_data_ids
    ]
    if configs_to_insert:
        await WidgetDataConfig.insert_many(configs_to_insert)
```

In `backend/core/workspace/service.py`, add `WidgetDataConfigSchema` to the workspace bootstrap. Read the file to find the `list_workspace_preferences` function and the `get_workspace` or `workspace_bootstrap` function.

After preferences are loaded, also load `WidgetDataConfig` documents and include them in the bootstrap response:

```python
from core.models import WidgetDataConfig
from shared.schemas import WidgetDataConfigSchema

# In workspace bootstrap building:
widget_data_configs = await WidgetDataConfig.find(
    WidgetDataConfig.user_id == PydanticObjectId(user_id),
).to_list()

widget_data_config_schemas = [
    WidgetDataConfigSchema(widget_id=doc.widget_id, config=doc.config)
    for doc in widget_data_configs
]

return WorkspaceBootstrap(
    installed_apps=installed_apps,
    widget_preferences=prefs_schema,
    widget_data_configs=widget_data_config_schemas,  # NEW
)
```

Also add `widget_data_configs: list[WidgetDataConfigSchema]` to `WorkspaceBootstrap` in `shared/schemas.py`.

- [ ] **Step 2: Run tests**

Run: `cd /home/linh/Downloads/superin/backend && python -m pytest core/catalog/ core/workspace/ -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/core/catalog/service.py backend/core/workspace/service.py backend/shared/schemas.py
git commit -m "feat(core): seed WidgetDataConfig on install, include in workspace bootstrap"
```

---

## Phase 2: App Widget Endpoints

### Task 6: Finance widget endpoints

**Files:**
- Modify: `backend/apps/finance/schemas.py`
- Modify: `backend/apps/finance/routes.py`
- Modify: `backend/apps/finance/__init__.py`

- [ ] **Step 1: Write failing test for widget data endpoint**

```python
# backend/apps/finance/test_widget_routes.py
import pytest
from httpx import AsyncClient, ASGITransport
from beanie import PydanticObjectId
from core.models import WidgetDataConfig


@pytest.mark.asyncio
async def test_get_widget_data_total_balance():
    # Setup: create WidgetDataConfig for user with account_id filter
    # Call GET /api/apps/finance/widgets/total-balance
    # Assert response has balance, currency, trend fields
    pass


@pytest.mark.asyncio
async def test_update_widget_data_config():
    # Setup: authenticated user
    # PUT /api/apps/finance/widgets/total-balance/config
    # Body: {"widget_id": "finance.total-balance", "config": {"account_id": "vcb-123"}}
    # Assert: WidgetDataConfig stored in DB
    pass


@pytest.mark.asyncio
async def test_get_widget_options():
    # GET /api/apps/finance/widgets/total-balance/options
    # Assert: returns account_id options with type: "select"
    pass
```

- [ ] **Step 2: Add Pydantic models to `finance/schemas.py`**

Add to the end of `backend/apps/finance/schemas.py`:

```python
# ─── Widget Config Models ─────────────────────────────────────────────────────

from pydantic import BaseModel
from typing import Literal
from datetime import datetime


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


class RecentTransactionsWidgetConfig(BaseModel):
    """Config for finance.recent-transactions widget."""

    wallet_id: str | None = None
    max_items: int = 5


# ─── Widget Response Models ────────────────────────────────────────────────────

class BudgetCategoryItem(BaseModel):
    name: str
    icon: str
    budget: float
    spent: float
    remaining: float
    percentage_used: float
    is_over_budget: bool


class TransactionItem(BaseModel):
    id: str
    title: str
    amount: float
    type: Literal["income", "expense"]
    category: str
    wallet: str
    date: datetime
    note: str | None


class TotalBalanceWidgetResponse(BaseModel):
    """Response for finance.total-balance widget."""

    balance: float
    currency: str
    account_id: str | None
    account_name: str | None
    income_this_month: float
    expense_this_month: float
    trend: Literal["up", "down", "neutral"] | None = None
    trend_percentage: float | None = None
    as_of: datetime


class BudgetOverviewWidgetResponse(BaseModel):
    """Response for finance.budget-overview widget."""

    categories: list[BudgetCategoryItem]
    total_budget: float
    total_spent: float
    remaining: float
    over_budget: bool
    period: str


class RecentTransactionsWidgetResponse(BaseModel):
    """Response for finance.recent-transactions widget."""

    transactions: list[TransactionItem]
    total_income_month: float
    total_expense_month: float


# ─── Widget Options ────────────────────────────────────────────────────────────

class WidgetOptionItem(BaseModel):
    value: str
    label: str


class WidgetFieldOptions(BaseModel):
    type: Literal["select", "multi-select", "boolean", "text", "number"]


class WidgetOptionsResponse(BaseModel):
    """Options metadata for a widget's settings form."""

    fields: dict[str, WidgetFieldOptions]
```

- [ ] **Step 3: Implement routes in `finance/routes.py`**

Add these routes at the top of `finance/routes.py` (after imports):

```python
# ─── Widget Data Endpoints ─────────────────────────────────────────────────────

from pydantic import ValidationError
from apps.finance.schemas import (
    TotalBalanceWidgetConfig,
    TotalBalanceWidgetResponse,
    BudgetOverviewWidgetConfig,
    BudgetOverviewWidgetResponse,
    RecentTransactionsWidgetConfig,
    RecentTransactionsWidgetResponse,
    WidgetOptionsResponse,
    WidgetOptionItem,
    WidgetFieldOptions,
    BudgetCategoryItem,
    TransactionItem,
)
from apps.finance.service import finance_service
from core.auth.dependencies import get_current_user
from core.models import WidgetDataConfig, User
from core.widget_config import resolve_widget_config, validate_and_serialize_config
from shared.schemas import WidgetDataConfigUpdate
from pydantic import BaseModel


# Per-widget data assembler functions

async def _get_total_balance_data(
    user_id: str,
    widget_id: str,
    config: TotalBalanceWidgetConfig,
) -> TotalBalanceWidgetResponse:
    """Assemble data for finance.total-balance widget."""
    from datetime import datetime, UTC

    user = await User.get(user_id)
    summary = await finance_service.get_summary(user)

    # Filter balance by account if config specifies one
    if config.account_id:
        wallets = await finance_service.list_wallets(user_id)
        target_wallet = next((w for w in wallets if str(w.id) == config.account_id), None)
        if target_wallet:
            balance = target_wallet.balance
            currency = target_wallet.currency
            account_name = target_wallet.name
        else:
            balance = summary.total_balance
            currency = "VND"
            account_name = None
    else:
        balance = summary.total_balance
        currency = "VND"
        account_name = None
        account_id = None

    # Trend calculation using monthly data
    trend = None
    trend_percentage = None
    if summary.total_balance > 0:
        trend = "up"

    return TotalBalanceWidgetResponse(
        balance=balance,
        currency=currency,
        account_id=config.account_id,
        account_name=account_name,
        income_this_month=summary.income_this_month,
        expense_this_month=summary.expense_this_month,
        trend=trend,
        trend_percentage=trend_percentage,
        as_of=datetime.now(UTC),
    )


async def _get_budget_overview_data(
    user_id: str,
    widget_id: str,
    config: BudgetOverviewWidgetConfig,
) -> BudgetOverviewWidgetResponse:
    """Assemble data for finance.budget-overview widget."""
    from datetime import datetime

    user = await User.get(user_id)
    budget_response = await finance_service.check_budget(user, None)

    categories = []
    total_budget = 0.0
    total_spent = 0.0

    for cat in budget_response.categories:
        total_budget += cat.budget
        total_spent += cat.spent
        categories.append(BudgetCategoryItem(
            name=cat.name,
            icon=cat.icon or "Circle",
            budget=cat.budget,
            spent=cat.spent,
            remaining=cat.remaining,
            percentage_used=cat.percentage_used,
            is_over_budget=cat.over_budget,
        ))

    return BudgetOverviewWidgetResponse(
        categories=categories,
        total_budget=total_budget,
        total_spent=total_spent,
        remaining=total_budget - total_spent,
        over_budget=total_spent > total_budget,
        period=datetime.now().strftime("%B %Y"),
    )


async def _get_recent_transactions_data(
    user_id: str,
    widget_id: str,
    config: RecentTransactionsWidgetConfig,
) -> RecentTransactionsWidgetResponse:
    """Assemble data for finance.recent-transactions widget."""
    user = await User.get(user_id)
    summary = await finance_service.get_summary(user)

    # Get actual transactions
    transactions = await finance_service.list_transactions(
        user_id,
        type_=None,
        category_id=None,
        wallet_id=config.wallet_id,
        skip=0,
        limit=config.max_items,
    )

    return RecentTransactionsWidgetResponse(
        transactions=[
            TransactionItem(
                id=str(tx.id),
                title=tx.note or f"{tx.type.value} transaction",
                amount=tx.amount,
                type=tx.type,
                category=str(tx.category_id) if tx.category_id else "Uncategorized",
                wallet=str(tx.wallet_id) if tx.wallet_id else "Unknown",
                date=tx.date,
                note=tx.note,
            )
            for tx in transactions
        ],
        total_income_month=summary.income_this_month,
        total_expense_month=summary.expense_this_month,
    )


WIDGET_DATA_GETTERS = {
    "finance.total-balance": _get_total_balance_data,
    "finance.budget-overview": _get_budget_overview_data,
    "finance.recent-transactions": _get_recent_transactions_data,
}


WIDGET_CONFIG_MODELS = {
    "finance.total-balance": TotalBalanceWidgetConfig,
    "finance.budget-overview": BudgetOverviewWidgetConfig,
    "finance.recent-transactions": RecentTransactionsWidgetConfig,
}


async def _get_widget_data(
    user_id: str,
    widget_id: str,
) -> BaseModel:
    """Generic widget data handler — dispatches to the right assembler."""
    from fastapi import HTTPException

    if widget_id not in WIDGET_DATA_GETTERS:
        raise HTTPException(status_code=404, detail=f"Widget '{widget_id}' not found")

    getter = WIDGET_DATA_GETTERS[widget_id]
    model_cls = WIDGET_CONFIG_MODELS.get(widget_id, BaseModel)
    config = await resolve_widget_config(user_id, widget_id)
    return await getter(user_id, widget_id, config)


# ─── Routes ────────────────────────────────────────────────────────────────────


@router.get("/widgets/{widget_id}", response_model=BaseModel)
async def get_widget_data(
    widget_id: str,
    user_id: str = Depends(get_current_user),
) -> BaseModel:
    """Get widget-specific data, filtered by the user's widget configuration."""
    return await _get_widget_data(user_id, widget_id)


@router.put("/widgets/{widget_id}/config", response_model=WidgetDataConfigUpdate)
async def update_widget_config(
    widget_id: str,
    request: WidgetDataConfigUpdate,
    user_id: str = Depends(get_current_user),
) -> WidgetDataConfigUpdate:
    """Save or update a user's widget data configuration."""
    from beanie import PydanticObjectId

    # Validate the config against the registered Pydantic model
    try:
        validated = validate_and_serialize_config(widget_id, request.config)
    except ValidationError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))

    # Upsert into WidgetDataConfig
    await WidgetDataConfig.find_one_and_update(
        WidgetDataConfig.user_id == PydanticObjectId(user_id),
        WidgetDataConfig.widget_id == widget_id,
        {
            "$set": {
                "config": validated,
                "user_id": PydanticObjectId(user_id),
                "widget_id": widget_id,
            },
            "$setOnInsert": {
                "user_id": PydanticObjectId(user_id),
                "widget_id": widget_id,
                "config": {},
            },
        },
        upsert=True,
    )

    return WidgetDataConfigUpdate(widget_id=widget_id, config=validated)


@router.get("/widgets/{widget_id}/options", response_model=WidgetOptionsResponse)
async def get_widget_options(
    widget_id: str,
    user_id: str = Depends(get_current_user),
) -> WidgetOptionsResponse:
    """Get settings form options for a widget."""
    from fastapi import HTTPException

    if widget_id == "finance.total-balance":
        wallets = await finance_service.list_wallets(user_id)
        wallet_options = [
            WidgetOptionItem(value="", label="Tất cả ví"),
            *[WidgetOptionItem(value=str(w.id), label=f"{w.name} ({w.currency})") for w in wallets],
        ]
        return WidgetOptionsResponse(fields={
            "account_id": WidgetFieldOptions(type="select", options=wallet_options),
            "show_currency": WidgetFieldOptions(type="boolean"),
            "comparison_period": WidgetFieldOptions(
                type="select",
                options=[
                    WidgetOptionItem(value="month", label="So với tháng trước"),
                    WidgetOptionItem(value="quarter", label="So với quý trước"),
                    WidgetOptionItem(value="year", label="So với năm trước"),
                ],
            ),
        })

    # For widgets without options, return empty
    return WidgetOptionsResponse(fields={})
```

- [ ] **Step 4: Update `finance/__init__.py` to register config models**

Add to `register_plugin()` in `backend/apps/finance/__init__.py`:

```python
from core.registry import register_widget_config_model
from apps.finance.schemas import (
    TotalBalanceWidgetConfig,
    BudgetOverviewWidgetConfig,
    RecentTransactionsWidgetConfig,
)

register_widget_config_model("finance.total-balance", TotalBalanceWidgetConfig)
register_widget_config_model("finance.budget-overview", BudgetOverviewWidgetConfig)
register_widget_config_model("finance.recent-transactions", RecentTransactionsWidgetConfig)
```

- [ ] **Step 5: Run lint + tests**

Run: `cd /home/linh/Downloads/superin/backend && ruff check apps/finance/`
Run: `cd /home/linh/Downloads/superin/backend && python -m pytest apps/finance/ -v`

- [ ] **Step 6: Commit**

```bash
git add backend/apps/finance/schemas.py backend/apps/finance/routes.py backend/apps/finance/__init__.py
git commit -m "feat(finance): add widget data endpoints, config models, and response schemas"
```

---

### Task 7: Calendar and Todo widget endpoints

**Files:** (same pattern as Finance — see Task 6 for template)
- `backend/apps/calendar/schemas.py`, `routes.py`, `__init__.py`
- `backend/apps/todo/schemas.py`, `routes.py`, `__init__.py`

For Calendar, implement:
- `calendar.month-view` → `MonthViewWidgetConfig`, `MonthViewWidgetResponse`
- `calendar.upcoming` → `UpcomingWidgetConfig`, `UpcomingWidgetResponse`
- `calendar.day-summary` → no config needed

For Todo, implement:
- `todo.task-list` → `TaskListWidgetConfig`, `TaskListWidgetResponse`
- `todo.today` → no config needed

**Pattern:** Add Pydantic models to schemas.py, add routes (get, put config, get options) to routes.py, register config models in `__init__.py`.

- [ ] **Step 1–6: Implement Calendar widget endpoints**

- [ ] **Step 7: Commit Calendar**

```bash
git add backend/apps/calendar/
git commit -m "feat(calendar): add widget data endpoints, config models, and response schemas"
```

- [ ] **Step 8–14: Implement Todo widget endpoints**

- [ ] **Step 15: Commit Todo**

```bash
git add backend/apps/todo/
git commit -m "feat(todo): add widget data endpoints, config models, and response schemas"
```

---

### Task 8: Update codegen + migration script

**Files:**
- Modify: `scripts/codegen.py`
- Create: `backend/core/migrations/migrate_widget_preference_grid.py`

- [ ] **Step 1: Update FUNCTION_NAME_OVERRIDES in codegen**

In `scripts/codegen.py`, find `FUNCTION_NAME_OVERRIDES` and add:

```python
FUNCTION_NAME_OVERRIDES = {
    "finance": {
        # ... existing entries ...
        "get_widget": "getWidgetData",
        "update_widget_data_config": "updateWidgetDataConfig",
        "get_widget_options": "getWidgetOptions",
    },
    "calendar": {
        # ... existing entries ...
        "get_widget": "getWidgetData",
        "update_widget_data_config": "updateWidgetDataConfig",
        "get_widget_options": "getWidgetOptions",
    },
    "todo": {
        # ... existing entries ...
        "get_widget": "getWidgetData",
        "update_widget_data_config": "updateWidgetDataConfig",
        "get_widget_options": "getWidgetOptions",
    },
}
```

- [ ] **Step 2: Create migration script**

Create `backend/core/migrations/migrate_widget_preference_grid.py`:

```python
"""
One-time migration: extract gridX/gridY from WidgetPreference.config dict
into top-level grid_x/grid_y fields, and seed empty WidgetDataConfig docs.

Run once:
    cd backend && python -m core.migrations.migrate_widget_preference_grid
"""

import asyncio
from core.db import init_db, get_db
from core.models import WidgetPreference, WidgetDataConfig
from beanie import PydanticObjectId


async def migrate():
    await init_db()

    collection = get_db()["widget_preferences"]
    cursor = collection.find({})
    count = 0

    async for doc in cursor:
        updates = {}
        raw_config = doc.get("config", {})

        if "gridX" in raw_config or "gridY" in raw_config:
            updates["grid_x"] = raw_config.pop("gridX", 0)
            updates["grid_y"] = raw_config.pop("gridY", 0)
            updates["config"] = raw_config  # remaining keys only
            await collection.update_one({"_id": doc["_id"]}, {"$set": updates})
            count += 1

        # Also seed WidgetDataConfig if not exists
        widget_id = doc.get("widget_id")
        user_id = doc.get("user_id")
        if widget_id and user_id:
            existing = await WidgetDataConfig.find_one(
                WidgetDataConfig.user_id == PydanticObjectId(user_id),
                WidgetDataConfig.widget_id == widget_id,
            )
            if not existing:
                await WidgetDataConfig(
                    user_id=PydanticObjectId(user_id),
                    widget_id=widget_id,
                    config={},
                ).insert()

    print(f"Migrated {count} WidgetPreference documents (extracted grid fields)")
    print("Seeded WidgetDataConfig documents for all existing preferences")


if __name__ == "__main__":
    asyncio.run(migrate())
```

- [ ] **Step 3: Run codegen**

Run: `cd /home/linh/Downloads/superin && npm run codegen`

Verify the generated `frontend/src/apps/finance/api.ts` contains `getWidgetData`, `updateWidgetDataConfig`, `getWidgetOptions` functions.

- [ ] **Step 4: Commit**

```bash
git add scripts/codegen.py backend/core/migrations/migrate_widget_preference_grid.py
git commit -m "feat(codegen): add widget endpoint overrides, add migration script"
```

---

## Phase 3: Frontend Infrastructure

### Task 9: Update FE `useWidgetPreferences` and `layout-engine`

**Files:**
- Modify: `frontend/src/pages/dashboard/useWidgetPreferences.ts`
- Modify: `frontend/src/pages/dashboard/layout-engine.ts`
- Modify: `frontend/src/pages/dashboard/preference-utils.ts`
- Modify: `frontend/src/api/catalog.ts`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/pages/dashboard/__tests__/useWidgetPreferences.test.ts
import { renderHook, act } from "@testing-library/react";

test("buildLayoutUpdates sends grid_x/grid_y not config.gridX/Y", async () => {
  // Mock existing preferences with grid_x/grid_y top-level
  // Assert PreferenceUpdate shape
});
```

- [ ] **Step 2: Implement layout-engine changes**

In `frontend/src/pages/dashboard/layout-engine.ts`:

**Replace `getSavedGridPosition`**:
```typescript
function getSavedGridPosition(
  pref: WidgetPreferenceSchema | undefined
): { x: number; y: number } | null {
  const savedX = pref?.grid_x;
  const savedY = pref?.grid_y;
  if (typeof savedX === "number" && typeof savedY === "number") {
    return { x: savedX, y: savedY };
  }
  return null;
}
```

**Update `arePreferencesEqual`** — remove `serializePreferenceConfig` check (config no longer in layout schema):
```typescript
export function arePreferencesEqual(
  left: WidgetPreferenceSchema | undefined,
  right: WidgetPreferenceSchema | undefined
): boolean {
  if (!left || !right) return left === right;
  return (
    left._id === right._id &&
    left.user_id === right.user_id &&
    left.widget_id === right.widget_id &&
    left.app_id === right.app_id &&
    left.enabled === right.enabled &&
    left.sort_order === right.sort_order &&
    left.grid_x === right.grid_x &&
    left.grid_y === right.grid_y &&
    left.size_w === right.size_w &&
    left.size_h === right.size_h
    // config removed from comparison
  );
}
```

- [ ] **Step 3: Implement useWidgetPreferences changes**

In `frontend/src/pages/dashboard/useWidgetPreferences.ts`:

**Replace `buildLayoutUpdates`** — change from `config.gridX/Y` to top-level `grid_x/y`:

```typescript
const buildLayoutUpdates = useCallback(
  (currentLayout: Layout): PreferenceUpdate[] => {
    const updates: PreferenceUpdate[] = [];
    for (const item of currentLayout) {
      const existing = prefs.get(item.i);
      const resolved = visibleWidgetMap.get(item.i);
      if (!resolved) continue;

      const defaultConfig = getSizeConfig(resolved.widget.size);
      const nextSizeW = item.w !== defaultConfig.width ? item.w : null;
      const nextSizeH = item.h !== defaultConfig.rglH ? item.h : null;

      const prevGridX = existing?.grid_x ?? 0;
      const prevGridY = existing?.grid_y ?? 0;

      if (
        prevGridX === item.x &&
        prevGridY === item.y &&
        (existing?.size_w ?? null) === nextSizeW &&
        (existing?.size_h ?? null) === nextSizeH
      ) {
        continue;
      }

      updates.push({
        widget_id: item.i,
        grid_x: item.x,     // top-level field
        grid_y: item.y,     // top-level field
        size_w: nextSizeW,
        size_h: nextSizeH,
      });
    }
    return updates;
  },
  [prefs, visibleWidgetMap]
);
```

**Update `handleWidgetVisibilityChange`** — replace config push with grid_x/y:

```typescript
const handleWidgetVisibilityChange = useCallback(
  async (widgetId: string, enabled: boolean) => {
    setBusyWidgetId(widgetId);
    const existing = prefs.get(widgetId);
    const nextPlacement = enabled
      ? getNextWidgetPlacement(currentLayoutRef.current)
      : null;
    const updates: PreferenceUpdate[] = [
      {
        widget_id: widgetId,
        enabled,
        ...(nextPlacement
          ? { grid_x: nextPlacement.x, grid_y: nextPlacement.y }
          : {}),
      },
    ];
    // ... rest unchanged
  },
  // ... deps unchanged
);
```

**Update `handleAutoRearrange`** — replace config with grid_x/y:

```typescript
const handleAutoRearrange = useCallback(
  async (widgets: ResolvedWidget[]) => {
    if (widgets.length === 0) return;
    const newLayout = autoRearrangeWidgets(widgets, prefs);
    currentLayoutRef.current = newLayout;
    const updates: PreferenceUpdate[] = newLayout.map((item) => ({
      widget_id: item.i,
      grid_x: item.x,    // top-level field
      grid_y: item.y,    // top-level field
    }));
    // ... rest unchanged
  },
  // ... deps unchanged
);
```

- [ ] **Step 4: Verify types**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors (types updated by codegen will match)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/useWidgetPreferences.ts frontend/src/pages/dashboard/layout-engine.ts
git commit -m "feat(fe): migrate useWidgetPreferences from config.gridX/Y to grid_x/y top-level fields"
```

---

### Task 10: Widget settings registry + settings modal skeleton

**Files:**
- Create: `frontend/src/lib/widget-settings-registry.ts`
- Modify: `frontend/src/pages/dashboard/DashboardPage.tsx` (add gear icon + modal trigger)

- [ ] **Step 1: Create widget settings registry**

Create `frontend/src/lib/widget-settings-registry.ts`:

```typescript
/**
 * Widget settings registry — allows each app to register a settings modal
 * for its configurable widgets.
 *
 * Usage:
 *   // In app setup
 *   registerWidgetSettings("finance.total-balance", TotalBalanceSettings);
 *
 *   // In DashboardPage
 *   const SettingsComponent = getWidgetSettings(widgetId);
 *   if (SettingsComponent) { ...render modal }
 */

import type { ComponentType } from "react";

export interface WidgetSettingsProps {
  widgetId: string;
  currentConfig: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onClose: () => void;
}

const WIDGET_SETTINGS: Record<string, ComponentType<WidgetSettingsProps>> = {};

export function registerWidgetSettings(
  widgetId: string,
  component: ComponentType<WidgetSettingsProps>
): void {
  if (WIDGET_SETTINGS[widgetId]) {
    console.warn(`[widget-settings-registry] Widget "${widgetId}" already registered. Overwriting.`);
  }
  WIDGET_SETTINGS[widgetId] = component;
}

export function getWidgetSettings(
  widgetId: string
): ComponentType<WidgetSettingsProps> | null {
  return WIDGET_SETTINGS[widgetId] ?? null;
}
```

- [ ] **Step 2: Wire up gear icon in dashboard widget**

In `DashboardPage.tsx` (or wherever widgets are rendered), add a gear icon button to each widget header that opens the settings modal if a component is registered.

```typescript
import { getWidgetSettings } from "@/lib/widget-settings-registry";

// In widget card header:
const SettingsComponent = getWidgetSettings(widgetId);
const [showSettings, setShowSettings] = useState(false);

return (
  <WidgetCard>
    <WidgetHeader>
      <WidgetTitle>{widget.name}</WidgetTitle>
      {SettingsComponent && (
        <button onClick={() => setShowSettings(true)} aria-label="Widget settings">
          <SettingsIcon />
        </button>
      )}
    </WidgetHeader>
    {/* widget content */}
    {showSettings && SettingsComponent && (
      <Modal onClose={() => setShowSettings(false)}>
        <SettingsComponent
          widgetId={widgetId}
          currentConfig={widgetDataConfigMap[widgetId]?.config ?? {}}
          onSave={(config) => {
            // call PUT /widgets/{widget_id}/config
            // then update local state
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      </Modal>
    )}
  </WidgetCard>
);
```

- [ ] **Step 3: Finance widget settings — TotalBalanceWidgetSettings**

Create `frontend/src/apps/finance/widgets/TotalBalanceWidgetSettings.tsx`:

```typescript
import { useState } from "react";
import { getWidgetDataConfig, updateWidgetDataConfig } from "../api";
import type {
  FinanceTotalBalanceWidgetConfigUpdate,
  FinanceTotalBalanceWidgetConfig,
} from "../api";

export function TotalBalanceWidgetSettings({
  widgetId,
  currentConfig,
  onSave,
  onClose,
}: {
  widgetId: string;
  currentConfig: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const cfg = currentConfig as Partial<FinanceTotalBalanceWidgetConfig>;
  const [accountId, setAccountId] = useState<string | null>(cfg.account_id ?? null);
  const [showCurrency, setShowCurrency] = useState(cfg.show_currency ?? true);
  const [comparison, setComparison] = useState<string>(cfg.comparison_period ?? "month");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const update: FinanceTotalBalanceWidgetConfigUpdate = {
        widget_id: widgetId,
        config: {
          account_id: accountId,
          show_currency: showCurrency,
          comparison_period: comparison as "month" | "quarter" | "year",
        },
      };
      const result = await updateWidgetDataConfig(widgetId, update);
      onSave(result.config);
    } catch (err) {
      console.error("Failed to save widget config", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold">Cài đặt Total Balance</h3>

      <label className="block">
        <span className="text-sm text-muted">Ví</span>
        <select
          value={accountId ?? ""}
          onChange={(e) => setAccountId(e.target.value || null)}
          className="w-full mt-1"
        >
          <option value="">Tất cả ví</option>
          {/* Wallets options come from getWidgetOptions or getWallets */}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={showCurrency}
          onChange={(e) => setShowCurrency(e.target.checked)}
        />
        <span className="text-sm">Hiển thị đơn vị tiền tệ</span>
      </label>

      <label className="block">
        <span className="text-sm text-muted">So sánh với</span>
        <select
          value={comparison}
          onChange={(e) => setComparison(e.target.value)}
          className="w-full mt-1"
        >
          <option value="month">Tháng trước</option>
          <option value="quarter">Quý trước</option>
          <option value="year">Năm trước</option>
        </select>
      </label>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onClose}>Huỷ</Button>
        <Button onClick={handleSave} loading={saving}>Lưu</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Register in app setup**

In `frontend/src/apps/finance/index.ts` (or create a setup file):

```typescript
import { registerWidgetSettings } from "@/lib/widget-settings-registry";
import { TotalBalanceWidgetSettings } from "./widgets/TotalBalanceWidgetSettings";

export function registerFinanceWidgets() {
  registerWidgetSettings("finance.total-balance", TotalBalanceWidgetSettings);
}
```

Call `registerFinanceWidgets()` in the app providers / dashboard page init.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/widget-settings-registry.ts
git add "frontend/src/pages/dashboard/DashboardPage.tsx"  # adjust path
git add frontend/src/apps/finance/widgets/TotalBalanceWidgetSettings.tsx
git commit -m "feat(fe): add widget settings registry and TotalBalance settings modal"
```

---

## Phase 4: Widget Component Rewrites

### Task 11: Rewrite Finance widget components

**Files:**
- `frontend/src/apps/finance/widgets/TotalBalanceWidget.tsx`
- `frontend/src/apps/finance/widgets/BudgetOverviewWidget.tsx`
- `frontend/src/apps/finance/widgets/RecentTransactionsWidget.tsx`

- [ ] **Step 1: Rewrite TotalBalanceWidget to use getWidgetData**

```typescript
// frontend/src/apps/finance/widgets/TotalBalanceWidget.tsx

import { getWidgetData } from "../api";
import type { FinanceTotalBalanceWidgetResponse } from "../api";
import { swrConfig } from "@/lib/swr";
import useSWR from "swr";

export function TotalBalanceWidget({ widgetId }: { widgetId: string }) {
  const { data, isLoading, error } = useSWR(
    widgetId,
    (id) => getWidgetData(id),
    swrConfig
  );

  const resp = data as FinanceTotalBalanceWidgetResponse | undefined;

  if (isLoading) return <WidgetSkeleton />;
  if (error || !resp) return <WidgetError />;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="stat-value">
          {resp.show_currency && <span className="text-sm text-muted mr-1">{resp.currency}</span>}
          {resp.balance.toLocaleString("vi-VN")}
        </div>
        {resp.trend && resp.trend_percentage && (
          <div className={`trend-badge trend-${resp.trend}`}>
            {resp.trend === "up" ? "↑" : resp.trend === "down" ? "↓" : "→"}
            {" "}{Math.abs(resp.trend_percentage)}%
          </div>
        )}
      </div>
      <div className="flex gap-4 text-sm text-muted">
        <span>↑ {resp.income_this_month.toLocaleString("vi-VN")}</span>
        <span>↓ {resp.expense_this_month.toLocaleString("vi-VN")}</span>
      </div>
      {resp.account_name && (
        <div className="text-xs text-muted">{resp.account_name}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite BudgetOverviewWidget**

Display the budget categories with progress bars and percentage indicators. Show over-budget warnings.

```typescript
// frontend/src/apps/finance/widgets/BudgetOverviewWidget.tsx

export function BudgetOverviewWidget({ widgetId }: { widgetId: string }) {
  const { data, isLoading, error } = useSWR(widgetId, (id) => getWidgetData(id), swrConfig);
  const resp = data as FinanceBudgetOverviewWidgetResponse | undefined;

  if (isLoading) return <WidgetSkeleton />;
  if (error || !resp) return <WidgetError />;

  return (
    <div className="flex flex-col gap-3">
      {/* Summary */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted">{resp.period}</span>
        {resp.over_budget && (
          <span className="badge badge-danger text-xs">Vượt ngân sách</span>
        )}
      </div>

      {/* Overall progress */}
      <ProgressBar
        value={resp.total_spent}
        max={resp.total_budget}
        color={resp.over_budget ? "danger" : "primary"}
      />
      <div className="flex justify-between text-sm">
        <span>{resp.total_spent.toLocaleString("vi-VN")}</span>
        <span className="text-muted">{resp.remaining.toLocaleString("vi-VN")} còn lại</span>
      </div>

      {/* Category breakdown */}
      <div className="flex flex-col gap-2">
        {resp.categories.slice(0, 4).map((cat) => (
          <div key={cat.name} className="flex items-center gap-2">
            <ProgressBar value={cat.spent} max={cat.budget} color={cat.is_over_budget ? "danger" : "default"} />
            <span className="text-xs text-muted w-24 truncate">{cat.name}</span>
            <span className="text-xs">{cat.percentage_used.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite RecentTransactionsWidget**

```typescript
// frontend/src/apps/finance/widgets/RecentTransactionsWidget.tsx

export function RecentTransactionsWidget({ widgetId }: { widgetId: string }) {
  const { data, isLoading, error } = useSWR(widgetId, (id) => getWidgetData(id), swrConfig);
  const resp = data as FinanceRecentTransactionsWidgetResponse | undefined;

  if (isLoading) return <WidgetSkeleton />;
  if (error || !resp) return <WidgetError />;

  return (
    <div className="flex flex-col gap-3">
      {/* Month summary */}
      <div className="flex gap-4">
        <div className="flex items-center gap-1">
          <ArrowUpRight className="text-success w-4 h-4" />
          <span className="text-sm">{resp.total_income_month.toLocaleString("vi-VN")}</span>
        </div>
        <div className="flex items-center gap-1">
          <ArrowDownRight className="text-danger w-4 h-4" />
          <span className="text-sm">{resp.total_expense_month.toLocaleString("vi-VN")}</span>
        </div>
      </div>

      {/* Transaction list */}
      <div className="flex flex-col gap-1">
        {resp.transactions.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between py-1 border-b border-border">
            <div className="flex flex-col">
              <span className="text-sm">{tx.title}</span>
              <span className="text-xs text-muted">{tx.category} · {tx.wallet}</span>
            </div>
            <span className={`text-sm font-medium ${tx.type === "income" ? "text-success" : "text-danger"}`}>
              {tx.type === "expense" ? "-" : "+"}{tx.amount.toLocaleString("vi-VN")}
            </span>
          </div>
        ))}
        {resp.transactions.length === 0 && (
          <div className="text-sm text-muted text-center py-4">Không có giao dịch</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit`
Run: `cd frontend && npm run build`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/finance/widgets/
git commit -m "feat(finance): rewrite widget components to use getWidgetData with rich typed responses"
```

---

### Task 12: Rewrite Calendar and Todo widget components

**Files:**
- `frontend/src/apps/calendar/widgets/MonthViewWidget.tsx`
- `frontend/src/apps/calendar/widgets/UpcomingWidget.tsx`
- `frontend/src/apps/todo/widgets/TaskListWidget.tsx`
- `frontend/src/apps/todo/widgets/TodayWidget.tsx`

Apply the same pattern as Task 11: replace ad-hoc SWR calls with `getWidgetData(widgetId)`, import the typed response from generated `api.ts`, render rich data instead of just numbers.

---

## Phase 5: Verification

### Task 13: Final verification

- [ ] Run: `npm run codegen`
- [ ] Run: `cd backend && ruff check .`
- [ ] Run: `cd frontend && npx eslint --fix --max-warnings 0`
- [ ] Run: `cd frontend && npm run build`
- [ ] Run: `npm run validate:manifests`
- [ ] Run: `npm run superin -- db check-indexes`
- [ ] Manual smoke test: log in, open dashboard, verify widgets render data (not just numbers), click gear icon on a widget, settings modal opens with options from `getWidgetOptions`
