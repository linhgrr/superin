# Shin SuperApp Plugin Development Guide

## Goal

Add a new app without changing platform core code.

A complete plugin has two matching halves:
- backend plugin in `backend/apps/{app_id}`
- frontend app module in `frontend/src/apps/{app_id}`

The backend manifest is the source of truth.

## Current Protocol

### Backend files

Each backend app should contain:

```text
backend/apps/{app_id}/
  __init__.py
  manifest.py
  agent.py
  prompts.py
  tools.py
  repository.py
  service.py
  routes.py
  models.py
  schemas.py        # optional but recommended
```

Responsibilities:
- `manifest.py`: declares `AppManifestSchema` and `WidgetManifestSchema`
- `agent.py`: child LangGraph agent, must subclass `BaseAppAgent`
- `prompts.py`: app-specific prompt text, kept separate from `agent.py`
- `tools.py`: app domain tools, usually named `{app_id}_{action}`
- `repository.py`: Beanie queries only
- `service.py`: business logic only
- `routes.py`: FastAPI router
- `models.py`: Beanie documents
- `__init__.py`: `register_plugin(...)`

### Frontend files

Each frontend app should contain this protocol:

```text
frontend/src/apps/{app_id}/
  AppView.tsx
  DashboardWidget.tsx
  api.ts
  types.ts
  components/
  features/
  views/
  widgets/
  lib/
```

Responsibilities:
- `AppView.tsx`: thin public entrypoint that delegates to `views/`
- `DashboardWidget.tsx`: generated public entrypoint that maps backend widget ids to `widgets/*.tsx`
- `api.ts`: generated app-specific frontend API client helpers and contract aliases
- `types.ts`: app-local type bridge re-exporting shared dashboard widget types
- `components/`: reusable app-local UI pieces
- `features/`: domain slices with state and UI for the app page
- `views/`: top-level screen composition for the app page
- `widgets/`: individual dashboard widget renderers, one file per backend widget manifest entry
- `lib/`: app-local helpers and constants

Discovery:
- platform auto-discovers apps from `src/apps/*/AppView.tsx` and `src/apps/*/DashboardWidget.tsx`
- [index.ts](/home/linh/Downloads/superin/frontend/src/apps/index.ts) is only a thin compatibility re-export, not a handwritten registry

## Backend Contract

### Manifest

Use shared schemas from:
- [schemas.py](/home/linh/Downloads/superin/backend/shared/schemas.py)

Required manifest shape:

```python
from shared.schemas import AppManifestSchema, WidgetManifestSchema

example_widget = WidgetManifestSchema(
    id="example.summary",
    name="Example Summary",
    description="Shows the current status",
    icon="Box",
    size="standard",
)

example_manifest = AppManifestSchema(
    id="example",
    name="Example",
    version="1.0.0",
    description="Example plugin",
    icon="Box",
    color="oklch(0.65 0.21 280)",
    widgets=[example_widget],
    agent_description="Handles example-related user requests",
    tools=["example_list_items", "example_create_item"],
    models=["ExampleItem"],
    category="other",
)
```

Widget size values must be one of:
- `compact`
- `standard`
- `wide`
- `tall`
- `full`

### Agent

All app agents must subclass:
- [base_app.py](/home/linh/Downloads/superin/backend/core/agents/base_app.py)

Required shape:

```python
from langchain_core.tools import BaseTool

from core.agents.base_app import BaseAppAgent

class ExampleAgent(BaseAppAgent):
    app_id = "example"

    def tools(self) -> list[BaseTool]:
        return [
            example_list_items,
            example_create_item,
        ]

    def build_prompt(self) -> str:
        return get_example_prompt()

    async def on_install(self, user_id: str) -> None:
        ...

    async def on_uninstall(self, user_id: str) -> None:
        ...
```

Rules:
- `graph` must never be `None`
- prompts belong in `prompts.py`, not inline in `agent.py`
- child agents are invoked by the root agent through `delegate(question, thread_id)`
- `delegate(...)` should return a structured result envelope, not only plain text
- every LLM-facing app tool must wrap its domain execution with `safe_tool_call()`
- app tools should convert domain failures into structured `{ ok, data/error }` results
- app-specific tools must enforce user scoping
- startup verification fails if an app tool does not use `safe_tool_call()`

### Registration

Register the plugin in `__init__.py`:

```python
from core.registry import register_plugin

from .agent import ExampleAgent
from .manifest import example_manifest
from .models import ExampleItem
from .routes import router

register_plugin(
    manifest=example_manifest,
    agent=ExampleAgent(),
    router=router,
    models=[ExampleItem],
)
```

## Frontend Contract

### Auto-discovery contract

The platform does not read frontend app metadata. It only needs these app-local
entrypoints to exist:

```text
frontend/src/apps/{app_id}/AppView.tsx
frontend/src/apps/{app_id}/DashboardWidget.tsx
frontend/src/apps/{app_id}/api.ts
```

Rules:
- do not create `manifest.json`
- do not create app-specific `index.ts`
- do not export `FrontendAppDefinition`
- do not create `widgets/index.ts`
- do not use `registerWidget(...)`
- `AppView.tsx` should stay orchestration-only and delegate to `views/`
- `DashboardWidget.tsx` is generated and should not be edited by hand
- heavy UI and state should live below `features/`, `components/`, `views/`, `widgets/`

### Widget file convention

Each backend widget id must map to exactly one frontend component file:

```text
widget id:      {app_id}.{kebab-name}
component file: frontend/src/apps/{app_id}/widgets/{PascalCase(kebab-name)}Widget.tsx
```

Examples:
- `finance.total-balance` -> `widgets/TotalBalanceWidget.tsx`
- `todo.recent-tasks` -> `widgets/RecentTasksWidget.tsx`

### Dashboard renderer

`DashboardWidget.tsx` receives:
- `widgetId`
- `widget` metadata from catalog response

The dashboard chooses the correct app module by `app_id`, then calls that app's
single generated `DashboardWidget` component.

## Parent / Child-Agent Chat Protocol

The chat system is root-orchestrated:

```text
RootAgent
  -> ask_example(question)
  -> ExampleAgent child graph
  -> example_* domain tools
```

Rules:
- frontend does not send server tool schemas
- backend decides which `ask_{app_id}` tools exist based on installed apps
- frontend should only see root-level tool events such as `ask_finance`
- child-agent internal tool calls must stay hidden from the UI
- root-level `ask_{app_id}` results should be structured so the root agent can tell `success`, `partial`, and `failed`

See:
- [ASSISTANT_UI_INTEGRATION.md](/home/linh/Downloads/superin/docs/ASSISTANT_UI_INTEGRATION.md)

## Validation and Codegen

After changing shared schemas or manifests:

```bash
source /home/linh/miniconda3/etc/profile.d/conda.sh
conda activate linhdz
python scripts/superin.py codegen
python scripts/superin.py manifests validate
npm run build:frontend
```

What each command checks:
- `python scripts/superin.py codegen`: regenerates OpenAPI types plus app-local generated files (`api.ts`, `DashboardWidget.tsx`)
- `python scripts/superin.py manifests validate`: checks backend manifests against required frontend app files/directories and widget component file coverage
- `npm run build:frontend`: catches frontend type/runtime build errors

## CLI

The user-facing developer entrypoint is:

```bash
python scripts/superin.py <command>
```

Useful commands:

```bash
python scripts/superin.py codegen
python scripts/superin.py manifests validate
python scripts/superin.py plugin create calendar
python scripts/superin.py plugin sync-fe calendar
python scripts/superin.py plugin sync-fe --all
python scripts/superin.py dev
```

Behavior:
- `plugin create` scaffolds backend and frontend using the current protocol
- `plugin sync-fe` regenerates managed frontend app files from backend manifest data
- `dev` starts backend first, then frontend

`npm run dev` and `npm run validate:manifests` are convenience aliases that also route through this CLI.

## Recommended Build Order

1. Create backend manifest, models, repository, service, tools, routes, prompts, and agent.
2. Register the plugin in backend `__init__.py`.
3. Create the app-local view/widget/component folders under `frontend/src/apps/{app_id}`. Keep `AppView.tsx` hand-written; let codegen own `DashboardWidget.tsx` and `api.ts`.
4. Name each widget component file from the backend widget id using the required convention.
5. Run codegen and manifest validation.
6. Install the app through the app store and test:
   - sidebar install state
   - dashboard widget visibility
   - full app page
   - chat delegation through `ask_{app_id}`

## Checklist

- [ ] backend folder name matches `manifest.id`
- [ ] frontend folder name matches `manifest.id`
- [ ] every backend widget id has exactly one matching frontend component file
- [ ] app agent subclasses `BaseAppAgent`
- [ ] `graph` is compiled and non-optional
- [ ] prompts live in `prompts.py`
- [ ] tools are user-scoped
- [ ] routes call service, service calls repository
- [ ] app is registered with `register_plugin(...)`
- [ ] `AppView.tsx` is thin and delegates to `views/`
- [ ] `DashboardWidget.tsx` is generated and not hand-edited
- [ ] `api.ts` is generated and not hand-edited
- [ ] reusable app UI lives in `components/`
- [ ] app page domain slices live in `features/`
- [ ] no frontend manifest mirror or handwritten app registry
- [ ] no side-effect `registerWidget()` pattern
- [ ] `python scripts/superin.py codegen` ran if shared schema changed
- [ ] `python scripts/superin.py manifests validate` passes
- [ ] `npm run build:frontend` passes

## Generator Status

[superin.py](/home/linh/Downloads/superin/scripts/superin.py) now
scaffolds the current protocol by default:
- backend `BaseAppAgent` child agent with `prompts.py`
- frontend app module under `frontend/src/apps/{app_id}`
- generated `DashboardWidget.tsx`
- generated `api.ts`
- widget component stubs following the manifest id -> file-name convention

Generated code is only a starting point. Real app-specific feature logic still
needs to be implemented manually.
