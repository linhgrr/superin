# Shin SuperApp Architecture

## Overview

Shin SuperApp is a plugin-based platform with:
- React + Vite frontend
- FastAPI + LangGraph backend
- MongoDB persistence via Beanie
- `assistant-ui` chat UI with SSE streaming

The platform has two main extension surfaces:
- backend app plugins in `backend/apps/*`
- frontend app modules in `frontend/src/apps/*`

Backend manifests are the source of truth. Frontend app modules must match them.

## High-Level System

```text
Browser
  -> React Router
  -> AppShell
  -> Dashboard / App pages / Store
  -> assistant-ui runtime

Frontend API + SSE
  -> GET/POST /api/...
  -> POST /api/chat/stream

FastAPI
  -> auth
  -> catalog
  -> install/uninstall
  -> app-specific routers
  -> root chat route

Plugin runtime
  -> discover backend/apps/*
  -> register_plugin(...)
  -> build PLUGIN_REGISTRY
  -> expose app manifests, routers, models, child agents

LangGraph chat orchestration
  -> RootAgent
  -> ask_finance / ask_todo tools
  -> FinanceAgent / TodoAgent child graphs
  -> domain tools

MongoDB
  -> auth/session-related models
  -> widget preferences
  -> app-specific data
  -> persisted chat text turns
```

## Current Repo Layout

```text
backend/
  apps/
    catalog.py
    chat.py
    finance/
      __init__.py
      manifest.py
      agent.py
      prompts.py
      tools.py
      repository.py
      service.py
      routes.py
      models.py
      schemas.py
    todo/
      ...
  core/
    agents/
      base_app.py
      root/
        __init__.py
        agent.py
        prompts.py
        tools.py
    auth.py
    discovery.py
    registry.py
    main.py
    models.py
  shared/
    schemas.py
    interfaces.py
    enums.py
    agent_context.py
    llm.py

frontend/
  src/
    api/
    apps/
      index.ts
      types.ts
      finance/
        manifest.json
        index.ts
        AppView.tsx
        DashboardWidget.tsx
        api.ts
      todo/
        manifest.json
        index.ts
        AppView.tsx
        DashboardWidget.tsx
        api.ts
    components/
      chat/
      dashboard/
      providers/
    pages/
      AppShell.tsx
      DashboardPage.tsx
      StorePage.tsx
      AppPage.tsx
      Sidebar.tsx
    lib/
      widget-sizes.ts
    types/generated/

scripts/
  superin.py
  codegen.py
```

## Backend Plugin Model

Each backend app plugin registers:
- `manifest`
- `agent`
- `router`
- `models`

The registry contract lives in [registry.py](/home/linh/Downloads/superin/backend/core/registry.py).

```python
class PluginEntry(TypedDict):
    manifest: AppManifestSchema
    agent: BaseAppAgent
    router: APIRouter
    models: list[type]
```

Rules:
- plugin folder name must match `manifest.id`
- all app-specific Beanie models belong to the plugin
- install/uninstall hooks live on the app agent
- app routes own app CRUD and preferences/config endpoints

## Frontend App Module Model

Each frontend app module exports one `FrontendAppDefinition`:

```ts
export interface FrontendAppDefinition {
  manifest: {
    id: string;
    name: string;
    widgets: { id: string; size: WidgetSizeName }[];
  };
  AppView: ComponentType;
  DashboardWidget: ComponentType<DashboardWidgetProps>;
}
```

Current registry:
- [index.ts](/home/linh/Downloads/superin/frontend/src/apps/index.ts)

Current live apps:
- `finance`
- `todo`

## Manifest Source of Truth

Backend `AppManifestSchema` and `WidgetManifestSchema` live in
[schemas.py](/home/linh/Downloads/superin/backend/shared/schemas.py).

Contract flow:

```text
backend/shared/schemas.py
  -> python scripts/superin.py codegen
  -> openapi.json
  -> frontend/src/types/generated/api.ts

backend apps/*/manifest.py
  -> python scripts/superin.py manifests validate
  -> checked against frontend/src/apps/*/manifest.json
```

Developer commands:
- `python scripts/superin.py codegen`
- `python scripts/superin.py manifests validate`
- `python scripts/superin.py plugin create <app_id>`
- `python scripts/superin.py plugin sync-fe <app_id>`
- `python scripts/superin.py dev`
- `npm run dev`

`npm run dev` now delegates to the unified CLI.

## Dashboard / Widget System

The dashboard is manifest-driven:
- app catalog returns each installed app with its widgets
- widget preferences determine enabled state, position, and config
- frontend chooses the correct app module via `getFrontendApp(appId)`
- dashboard renders the app module's `DashboardWidget`

Size contract:
- `small`
- `medium`
- `large`
- `full-width`

The same size contract must match:
- backend manifest
- generated frontend types
- `frontend/src/lib/widget-sizes.ts`
- dashboard layout logic

## Chat Architecture

### Root agent

The root chat agent lives in:
- [root/agent.py](/home/linh/Downloads/superin/backend/core/agents/root/agent.py)

Responsibilities:
- determine which installed apps are available for the current user
- build `ask_{app_id}` tools from installed child agents
- parse assistant-ui message history into LangChain messages
- stream root text + root tool call/result events
- persist latest user/assistant text turns

### Child app agents

All child agents must subclass:
- [base_app.py](/home/linh/Downloads/superin/backend/core/agents/base_app.py)

Contract:
- `graph` is always a compiled LangGraph graph
- `tools()` returns app domain tools
- `build_prompt()` returns app-specific prompt text
- `delegate(question, thread_id)` runs the app on an app-scoped child thread

Current child agents:
- [finance/agent.py](/home/linh/Downloads/superin/backend/apps/finance/agent.py)
- [todo/agent.py](/home/linh/Downloads/superin/backend/apps/todo/agent.py)

### Streaming rule

The frontend should only receive root-level orchestration:
- `ask_finance`
- `ask_todo`
- root assistant text

Child-agent internals such as `finance_list_wallets` are not streamed to the UI.

### assistant-ui route

The SSE route is:
- [chat.py](/home/linh/Downloads/superin/backend/apps/chat.py)

The runtime is created in:
- [AppProviders.tsx](/home/linh/Downloads/superin/frontend/src/components/providers/AppProviders.tsx)

Important behavior:
- frontend sends full message history each turn
- backend route uses `skip_db_load=True`
- backend ignores `tools` in request body
- frontend does not own server-side tool schemas

## Sidebar / Catalog State

Installed-app state is shared via:
- [AppProviders.tsx](/home/linh/Downloads/superin/frontend/src/components/providers/AppProviders.tsx)

This shared catalog state is used by:
- sidebar
- store page
- dashboard

Install/uninstall updates use optimistic state and refresh on failure.

## Known Limitations

- MongoDB chat persistence currently stores user/assistant text turns, not the
  full structured tool-call/tool-result history.
- Child-agent memory uses in-process LangGraph `MemorySaver`, so it is not yet
  durable across server restarts.
- `scripts/create_plugin.py` still needs to be brought fully in line with the
  newer frontend sub-app structure described in the plugin guide.

## Verification

For contract-sensitive changes, run:

```bash
source /home/linh/miniconda3/etc/profile.d/conda.sh
conda activate linhdz
python scripts/codegen.py
node scripts/validate-manifests.mjs
npm run build:frontend
python -m py_compile backend/apps/chat.py backend/core/agents/root/agent.py backend/core/agents/base_app.py
```
