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
  manifest.json
  index.ts
  AppView.tsx
  DashboardWidget.tsx
  api.ts
  components/
  features/
  views/
  widgets/
  lib/
```

Responsibilities:
- `manifest.json`: frontend mirror used by manifest validation
- `index.ts`: exports one `FrontendAppDefinition`
- `AppView.tsx`: thin public entrypoint that delegates to `views/`
- `DashboardWidget.tsx`: thin public entrypoint that delegates to `widgets/`
- `api.ts`: app-specific frontend API client helpers
- `components/`: reusable app-local UI pieces
- `features/`: domain slices with state and UI for the app page
- `views/`: top-level screen composition for the app page
- `widgets/`: dashboard widget dispatcher plus individual widget renderers
- `lib/`: app-local helpers and constants

Current registry:
- [index.ts](/home/linh/Downloads/superin/frontend/src/apps/index.ts)

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
    size="medium",
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
- `small`
- `medium`
- `large`
- `full-width`

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
- app-specific tools must enforce user scoping

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

### App definition

Each app exports one `FrontendAppDefinition`:

```ts
import manifest from "./manifest.json";
import AppView from "./AppView";
import DashboardWidget from "./DashboardWidget";
import type { FrontendAppDefinition } from "../types";

export const exampleApp: FrontendAppDefinition = {
  manifest,
  AppView,
  DashboardWidget,
};
```

The platform does **not** use side-effect widget registration anymore.

Do not create:
- `widgets/index.ts`
- `registerWidget(...)`
- root-level side-effect imports for app widget registration

Frontend entrypoints should stay small:
- `AppView.tsx` should be orchestration only
- `DashboardWidget.tsx` should be dispatch/orchestration only
- heavy UI and state should live below `features/`, `components/`, `views/`, `widgets/`
- each manifest widget should usually have its own file under `widgets/`

### Manifest mirror

`frontend/src/apps/{app_id}/manifest.json` must mirror backend manifest fields
needed by the frontend validator:

```json
{
  "id": "example",
  "name": "Example",
  "widgets": [
    { "id": "example.summary", "size": "medium" }
  ]
}
```

### Dashboard renderer

`DashboardWidget.tsx` receives:
- `widgetId`
- `widget` metadata from catalog response

The dashboard chooses the correct app module by `app_id`, then calls that app's
single `DashboardWidget` component.

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

See:
- [ASSISTANT_UI_INTEGRATION.md](/home/linh/Downloads/superin/docs/ASSISTANT_UI_INTEGRATION.md)

## Validation and Codegen

After changing shared schemas or manifests:

```bash
source /home/linh/miniconda3/etc/profile.d/conda.sh
conda activate linhdz
python scripts/codegen.py
node scripts/validate-manifests.mjs
npm run build:frontend
```

What each command checks:
- `python scripts/codegen.py`: regenerates OpenAPI and frontend generated types
- `node scripts/validate-manifests.mjs`: checks backend/frontend manifest integrity
- `npm run build:frontend`: catches frontend type/runtime build errors

`npm run dev` already runs manifest validation before booting both apps.

## Recommended Build Order

1. Create backend manifest, models, repository, service, tools, routes, prompts, and agent.
2. Register the plugin in backend `__init__.py`.
3. Create frontend app module with `manifest.json`, `index.ts`, `AppView.tsx`, `DashboardWidget.tsx`, `api.ts`, plus the `components/`, `features/`, `views/`, `widgets/`, and `lib/` folders as needed.
4. Add the frontend app to [index.ts](/home/linh/Downloads/superin/frontend/src/apps/index.ts).
5. Run codegen and manifest validation.
6. Install the app through the app store and test:
   - sidebar install state
   - dashboard widget visibility
   - full app page
   - chat delegation through `ask_{app_id}`

## Checklist

- [ ] backend folder name matches `manifest.id`
- [ ] frontend folder name matches `manifest.id`
- [ ] backend widget ids match frontend widget ids exactly
- [ ] backend widget sizes match frontend manifest sizes exactly
- [ ] app agent subclasses `BaseAppAgent`
- [ ] `graph` is compiled and non-optional
- [ ] prompts live in `prompts.py`
- [ ] tools are user-scoped
- [ ] routes call service, service calls repository
- [ ] app is registered with `register_plugin(...)`
- [ ] frontend exports one `FrontendAppDefinition`
- [ ] `AppView.tsx` is thin and delegates to `views/`
- [ ] `DashboardWidget.tsx` is thin and delegates to `widgets/`
- [ ] reusable app UI lives in `components/`
- [ ] app page domain slices live in `features/`
- [ ] no side-effect `registerWidget()` pattern
- [ ] `python scripts/codegen.py` ran if shared schema changed
- [ ] `node scripts/validate-manifests.mjs` passes
- [ ] `npm run build:frontend` passes

## Generator Status

[create_plugin.py](/home/linh/Downloads/superin/scripts/create_plugin.py) now
scaffolds the current protocol by default:
- backend `BaseAppAgent` child agent with `prompts.py`
- frontend app module under `frontend/src/apps/{app_id}`
- map-based widget dispatcher with one generated widget file

Generated code is only a starting point. Real app-specific feature logic still
needs to be implemented manually.
