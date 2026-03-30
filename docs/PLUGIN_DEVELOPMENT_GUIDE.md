# Shin SuperApp — Plugin Development Guide

> **Goal:** Add a new app to the platform. Every plugin requires **5 files** with a mandatory 3-layer backend architecture: `repository` → `service` → `routes`. Zero changes to any core platform file.

---

## Design System

All sub-apps MUST use the shared design system. Never hardcode colors or invent new patterns.

### Tech Stack

- **UI Library:** [HeroUI v3](https://heroui.com) (`@heroui/react ^3.0.1`)
- **Styling:** Tailwind CSS v4 + CSS custom tokens (no `tailwind.config.js`)
- **Icons:** Lucide React
- **Fonts:** Open Sans (body) + Poppins (headings) — loaded via Google Fonts in `globals.css`

### Design Tokens

Tokens are defined in `src/app/globals.css` via Tailwind v4 `@theme` directive.
Use token names (e.g. `--color-primary`) NOT raw oklch values in custom CSS.

```css
/* In globals.css — already configured */
@theme {
  --color-primary:       oklch(0.65 0.21 280);  /* Electric blue/violet */
  --color-primary-foreground: oklch(0.98 0 0);
  --color-success:      oklch(0.72 0.19 145);  /* Green */
  --color-warning:      oklch(0.75 0.18 85);   /* Yellow */
  --color-danger:       oklch(0.63 0.24 25);  /* Red */
  --color-background:   oklch(0.14 0.01 265);  /* Dark slate */
  --color-foreground:   oklch(0.95 0.01 265);  /* Near-white */
  --color-surface:      oklch(0.18 0.01 265);
  --color-surface-elevated: oklch(0.22 0.01 265);
  --color-border:       oklch(0.28 0.02 265);
  --color-muted:        oklch(0.55 0.02 265);
  --color-ring:         oklch(0.65 0.21 280);
}
```

### Widget Card (Standard Container)

```tsx
// ✅ Correct — use .widget-card class
<Card className="p-4 widget-card">
  <h3>My Widget</h3>
</Card>

// ❌ Wrong — hardcoded styles
<Card style={{ background: "oklch(0.18 0.01 265)", border: "1px solid ..." }}>
```

### Stat Value Typography

```tsx
// Use .stat-value class for large numbers
<p className="stat-value text-3xl">{balance}</p>

// Use .amount-positive / .amount-negative for money
<p className="amount-positive">+$1,200</p>  // income / positive
<p className="amount-negative">-$340</p>    // expense / negative
```

### Shared Components

Import from `src/components/ui/design-system.tsx` for common patterns:

```tsx
import { StatCard, SectionHeader } from "@/components/ui/design-system";
import { Card } from "@heroui/react";
import { Wallet, Calendar, CheckSquare } from "lucide-react";

// StatCard — for KPI widgets
<StatCard
  label="Total Balance"
  value="$4,320"
  icon={<Wallet className="w-5 h-5" style={{ color: "oklch(0.72 0.19 145)" }} />}
/>

// SectionHeader — for list widget headers
<SectionHeader title="RECENT TRANSACTIONS" />
```

### Color Usage in Widgets

```tsx
// Card backgrounds
background: "oklch(0.18 0.01 265 / 0.8)"

// Icon backgrounds (with matching text color)
style={{ background: "oklch(0.65 0.21 280 / 0.15)" }}
style={{ color: "oklch(0.65 0.21 280)" }}

// Text colors
style={{ color: "oklch(0.95 0.01 265)" }}   // primary text
style={{ color: "oklch(0.55 0.02 265)" }}   // muted text

// Borders
border: "1px solid oklch(0.22 0.02 265)"

// Glass effect
background: "oklch(0.18 0.01 265 / 0.6)"
backdrop-filter: "blur(12px)"
```

### Typography Scale

```tsx
// Headings — use Poppins via font-family or font-weight
<h3 style={{ fontFamily: "'Poppins', sans-serif" }}>Heading</h3>

// Section labels — uppercase, tracked
<p className="section-label">SECTION NAME</p>

// Body — default (Open Sans)
<p>Regular text</p>

// Sizes
text-xs  // 12px — labels, captions
text-sm  // 14px — secondary text
text-base // 16px — body
text-xl  // 20px — widget titles
text-2xl // 24px — section headers
text-3xl // 30px — KPI numbers
text-4xl // 36px — page titles
```

### Widget Size CSS Classes

The platform applies CSS classes based on `WidgetManifestSchema.size`:

| Manifest size | CSS class | Columns | When to use |
|---|---|---|---|
| `small` | `.widget-small` | span 4 / 12 | Single KPI, compact info |
| `medium` | `.widget-medium` | span 6 / 12 | Standard widget, list |
| `large` | `.widget-large` | span 8 / 12 | Chart, rich content |
| `full-width` | `.widget-full-width` | span 12 / 12 | Wide table, full feature |

Widget component itself does NOT need to set grid span — the parent `WidgetGrid`
applies the class. Widget component is responsible for its own internal layout.

### HeroUI v3 Component Usage

Only use HeroUI components that are confirmed available in v3:

**Safe to use:**
```tsx
import { Card, Button, Input, Badge, Chip, Avatar, Tooltip } from "@heroui/react";
```

**Avoid (v3 compound API differences):**
- `Select.onValueChange` → use `Select onChange`
- `AccordionItem title` prop → use `AccordionItem title={<>, content}`
- `Drawer size` prop → check v3 API, may use `className` instead
- Complex nested compound components → prefer native HTML + className

When in doubt, prefer native HTML elements with Tailwind classes and CSS tokens.

---

## Prerequisites

```bash
# Repo structure assumed:
superin/
├── backend/apps/           ← Python plugins
└── frontend/src/apps/      ← React widget components

# Backend setup
cd backend
pip install -e ".[finance]"   # install core + finance deps
python -m uvicorn core.main:app --reload

# Frontend setup
cd frontend
npm install
npm run dev
```

---

## Overview: What Makes an App

A plugin consists of **5 files** with **3-layer architecture**. All layers are **mandatory for every plugin**:

```
┌─────────────────────────────────────────────────────────────────┐
│  Backend (Python / FastAPI) — 3-layer mandatory                │
│                                                                 │
│  routes.py   → Thin layer: validate input → call service →      │
│                   return response. NO business logic here.       │
│                                                                 │
│  service.py  → Business logic: CRUD, validation, orchestration │
│                   No FastAPI/Depends imports.                   │
│                                                                 │
│  repository.py → Data access: Beanie queries only.              │
│                   Returns raw documents, no transformation.     │
│                                                                 │
│  manifest.py → AppManifestSchema (widgets, tools, description)  │
│  agent.py    → LangGraph agent (LLM logic + tools)              │
│  models.py   → Beanie Document classes (DB)                     │
│  __init__.py → register_plugin() call                           │
│                                                                 │
│  Frontend (React / TypeScript)                                  │
│  ├── pages/         → Nested pages (AppLayout wraps AppNav)      │
│  └── widgets/       → Widget components (dashboard)             │
│       ├── index.ts  → registerWidget() calls                    │
│       └── *.tsx     → Individual widget components              │
└─────────────────────────────────────────────────────────────────┘
```

> **Rule: Routes call service. Service calls repository. Repository calls Beanie.**
> Never skip layers. Even for simple plugins.

---

## Step 1: Backend — Create Plugin Folder

```bash
# 5 files mandatory (3-layer pattern) + 1 optional
mkdir -p backend/apps/{app_id}

# Mandatory — 3-layer pattern
touch backend/apps/{app_id}/__init__.py      # register_plugin()
touch backend/apps/{app_id}/manifest.py       # AppManifestSchema
touch backend/apps/{app_id}/models.py         # Beanie Document classes
touch backend/apps/{app_id}/repository.py     # Data access (Beanie queries only)
touch backend/apps/{app_id}/service.py         # Business logic (NO FastAPI imports)
touch backend/apps/{app_id}/agent.py          # LangGraph agent + tools
touch backend/apps/{app_id}/routes.py         # FastAPI router (calls service only)

# Optional
touch backend/apps/{app_id}/schemas.py        # App-specific Pydantic schemas
```

> **Repository → Service → Routes. Never reverse the dependency.**
> Service must NOT import FastAPI, Depends, HTTPException (those belong in routes).
> Repository must NOT import service (dependency goes one way).

---

## Step 2: Backend — Define the Manifest

```python
# backend/apps/todo/manifest.py

from shared.schemas import AppManifestSchema, WidgetManifestSchema, ConfigFieldSchema

task_list_widget = WidgetManifestSchema(
    id="todo.task-list",
    name="Task List",
    description="Shows pending tasks grouped by priority",
    icon="CheckSquare",
    size="medium",
    config_fields=[
        ConfigFieldSchema(
            name="filter",
            label="Show",
            type="select",
            required=False,
            default="all",
            options=[
                {"label": "All tasks", "value": "all"},
                {"label": "Due today", "value": "today"},
                {"label": "Overdue", "value": "overdue"},
            ],
        ),
    ],
)

today_widget = WidgetManifestSchema(
    id="todo.today",
    name="Today's Tasks",
    description="Only tasks due today or overdue",
    icon="Calendar",
    size="small",
    config_fields=[],
)

todo_manifest = AppManifestSchema(
    id="todo",
    name="To-Do",
    version="1.0.0",
    description="Manage tasks and reminders",
    icon="CheckSquare",
    color="oklch(0.70 0.18 145)",
    widgets=[task_list_widget, today_widget],
    agent_description="Helps users manage tasks, set reminders, and organize to-do lists.",
    tools=["todo_add_task", "todo_list_tasks", "todo_complete_task", "todo_delete_task"],
    models=["Task"],
    category="productivity",
    tags=["tasks", "productivity", "reminders"],
    author="Shin Team",
)
```

### Widget Size Reference

| Size | CSS class | Description |
|------|-----------|-------------|
| `small` | `.widget-small` | 4 of 12 columns (1/3 width) |
| `medium` | `.widget-medium` | 6 of 12 columns (half width) |
| `large` | `.widget-large` | 8 of 12 columns (2/3 width) |
| `full-width` | `.widget-full-width` | 12 of 12 columns (full row) |

---

## Step 3: Backend — Define Database Models

```python
# backend/apps/todo/models.py

from datetime import datetime
from typing import Optional, Literal
from beanie import Document, PydanticObjectId, Field

class Task(Document):
    """A single to-do item."""
    user_id: PydanticObjectId
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Literal["low", "medium", "high"] = "medium"
    status: Literal["pending", "completed"] = "pending"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

    class Settings:
        name = "todo_tasks"
        indexes = [
            [("user_id", 1), ("status", 1)],
            [("user_id", 1), ("due_date", 1)],
        ]
```

> **Rule R2:** Every query MUST filter by `user_id`. Always.

---

## Step 3b: Backend — Repository (data access)

```python
# backend/apps/todo/repository.py

from typing import Optional
from models import Task
from datetime import datetime

class TaskRepository:
    async def find_by_user(
        self,
        user_id: str,
        status: Optional[str] = None,
        limit: int = 20,
    ) -> list[Task]:
        query = {"user_id": user_id}
        if status:
            query["status"] = status
        cursor = Task.find(query).sort("-created_at").limit(limit)
        return await cursor.to_list()

    async def find_by_id(self, task_id: str, user_id: str) -> Task | None:
        return await Task.find_one(Task.id == task_id, Task.user_id == user_id)

    async def create(self, data: dict) -> Task:
        task = Task(**data)
        await task.insert()
        return task

    async def update(self, task: Task, data: dict) -> Task:
        for key, value in data.items():
            if value is not None:
                setattr(task, key, value)
        await task.save()
        return task

    async def delete(self, task: Task) -> None:
        await task.delete()

    async def delete_all_by_user(self, user_id: str) -> int:
        count = 0
        async for t in Task.find(Task.user_id == user_id):
            await t.delete()
            count += 1
        return count

task_repository = TaskRepository()
```

---

## Step 3c: Backend — Service (business logic)

```python
# backend/apps/todo/service.py

from typing import Optional
from datetime import datetime
from repository import task_repository
from models import Task

class TaskService:
    def __init__(self):
        self.repo = task_repository

    async def list_tasks(
        self,
        user_id: str,
        status: Optional[str] = None,
        limit: int = 20,
    ) -> list[dict]:
        tasks = await self.repo.find_by_user(user_id, status, limit)
        return [_task_to_dict(t) for t in tasks]

    async def create_task(
        self,
        user_id: str,
        title: str,
        description: str | None = None,
        due_date: datetime | None = None,
        priority: str = "medium",
    ) -> dict:
        data = {
            "user_id": user_id,
            "title": title,
            "description": description,
            "due_date": due_date,
            "priority": priority,
        }
        task = await self.repo.create(data)
        return _task_to_dict(task)

    async def complete_task(self, task_id: str, user_id: str) -> dict:
        task = await self.repo.find_by_id(task_id, user_id)
        if not task:
            return {"success": False, "error": "Task not found"}
        task.status = "completed"
        task.completed_at = datetime.utcnow()
        await task.save()
        return {"success": True, "title": task.title}

    async def on_install(self, user_id: str) -> None:
        """Seed sample task for new user."""
        await self.repo.create({
            "user_id": user_id,
            "title": "Welcome to To-Do!",
            "description": "Add your first task using chat or the widget.",
            "priority": "low",
        })

    async def on_uninstall(self, user_id: str) -> None:
        await self.repo.delete_all_by_user(user_id)

task_service = TaskService()


def _task_to_dict(task: Task) -> dict:
    return {
        "id": str(task.id),
        "title": task.title,
        "description": task.description,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "priority": task.priority,
        "status": task.status,
        "created_at": task.created_at.isoformat(),
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
    }
```

---

## Step 4: Backend — Define Agent

```python
# backend/apps/todo/agent.py

from langchain_core.tools import tool
from service import task_service

# ─── Tools — call SERVICE, not models directly ────────────────────────────────

@tool
def add_task(
    title: str,
    description: str | None = None,
    due_date: str | None = None,
    priority: str = "medium",
) -> dict:
    """Add a new task to the to-do list."""
    from core.auth import get_current_user_from_context
    from datetime import datetime

    user_id = get_current_user_from_context()
    due = datetime.fromisoformat(due_date) if due_date else None
    return task_service.create_task(user_id, title, description, due, priority)


@tool
def list_tasks(status: str = "pending", limit: int = 20) -> list[dict]:
    """List tasks, optionally filtered by status."""
    from core.auth import get_current_user_from_context
    user_id = get_current_user_from_context()
    return task_service.list_tasks(user_id, status, limit)


@tool
def complete_task(task_id: str) -> dict:
    """Mark a task as completed."""
    from core.auth import get_current_user_from_context
    user_id = get_current_user_from_context()
    return task_service.complete_task(task_id, user_id)


# ─── Agent ───────────────────────────────────────────────────────────────────

from core.registry import register_agent
from shared.interfaces import AgentProtocol

@register_agent("todo")
class TodoAgent(AgentProtocol):
    """To-Do app agent — handles task management via chat."""

    @property
    def graph(self):
        return None  # Reserved for future multi-step graph

    def tools(self):
        return [add_task, list_tasks, complete_task]
```

> **Tools call service, NOT repository. Service handles all business logic.**
> Agent tools are the LLM-facing interface; keep them thin.

### Agent Tool Naming Convention

All tool names MUST follow `{app_id}_{action}` pattern:

```
finance_add_transaction
finance_query_spending
todo_add_task
todo_list_tasks
calendar_create_event
```

---

## Step 5: Backend — Define Routes (3-layer)

```python
# backend/apps/todo/routes.py

from fastapi import APIRouter, Depends, HTTPException, Query

from core.auth import get_current_user
from shared.schemas import WidgetPreferenceSchema, PreferenceUpdate
from service import task_service
from repository import task_repository  # only if needed for on_install/uninstall

router = APIRouter()


# ─── Widgets ─────────────────────────────────────────────────────────────────

@router.get("/widgets")
async def list_widgets():
    from .manifest import todo_manifest
    return todo_manifest.widgets


# ─── Tasks — routes call service ──────────────────────────────────────────────

@router.get("/tasks")
async def list_tasks(
    status: str | None = None,
    limit: int = Query(default=20, le=100),
    user_id: str = Depends(get_current_user),
) -> list[dict]:
    return await task_service.list_tasks(user_id, status, limit)


@router.post("/tasks")
async def create_task(
    title: str,
    description: str | None = None,
    due_date: str | None = None,
    priority: str = "medium",
    user_id: str = Depends(get_current_user),
):
    from datetime import datetime
    due = datetime.fromisoformat(due_date) if due_date else None
    return await task_service.create_task(user_id, title, description, due, priority)


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: str,
    title: str | None = None,
    description: str | None = None,
    due_date: str | None = None,
    priority: str | None = None,
    status: str | None = None,
    user_id: str = Depends(get_current_user),
):
    task = await task_repository.find_by_id(task_id, user_id)
    if not task:
        raise HTTPException(404, "Task not found")
    updates = {"title": title, "description": description, "priority": priority, "status": status}
    from datetime import datetime
    if due_date:
        updates["due_date"] = datetime.fromisoformat(due_date)
    return await task_repository.update(task, updates)


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    user_id: str = Depends(get_current_user),
):
    task = await task_repository.find_by_id(task_id, user_id)
    if not task:
        raise HTTPException(404, "Task not found")
    await task_repository.delete(task)
    return {"success": True}
```

---

## Step 6: Backend — Register the Plugin

```python
# backend/apps/todo/__init__.py

from core.registry import register_plugin
from .manifest import todo_manifest
from .agent import TodoAgent
from .routes import router
from .models import Task

register_plugin(
    manifest=todo_manifest,
    agent=TodoAgent(),
    router=router,
    models=[Task],
)
```

> **That's it.** The platform auto-discovers this file at startup via `importlib`
> and adds the plugin to `PLUGIN_REGISTRY`. No changes to any core file needed.

### What register_plugin() Does

```python
# backend/core/registry.py

PLUGIN_REGISTRY: dict[str, AppPlugin] = {}

def register_plugin(
    manifest: AppManifestSchema,
    agent: AgentProtocol,
    router: APIRouter,
    models: list[type[Document]] = [],
) -> None:
    PLUGIN_REGISTRY[manifest.id] = AppPlugin(
        manifest=manifest,
        agent=agent,
        router=router,
        models=models,
    )
    # Also registers Beanie document classes so init_beanie() picks them up
    for model in models:
        _register_model(model)
```

### How Discovery Works

```python
# backend/core/main.py — startup lifespan

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()          # ← Beanie connects to MongoDB
    await discover_apps()    # ← Scans apps/ and imports each __init__.py
    yield
    await close_db()

# backend/core/discovery.py

def discover_apps() -> None:
    apps_dir = Path(__file__).parent.parent / "apps"
    for app_dir in sorted(apps_dir.iterdir()):
        if app_dir.is_dir() and not app_dir.name.startswith("_"):
            importlib.import_module(f"apps.{app_dir.name}")
```

---

## Step 7: Frontend — Create Widget Components

```bash
mkdir -p frontend/src/apps/todo/pages
mkdir -p frontend/src/apps/todo/widgets
```

### Register Widgets

```typescript
// frontend/src/apps/todo/widgets/index.ts

import TaskList from "./TaskList";
import TodayWidget from "./TodayWidget";
import { registerWidget } from "@/types/widget";

registerWidget("todo.task-list", TaskList);
registerWidget("todo.today", TodayWidget);
```

```typescript
// frontend/src/apps/todo/pages/TodoPage.tsx

import type { AppPageProps } from "@/types/app";

export default function TodoPage({ appId, userId }: AppPageProps) {
  return (
    <div className="space-y-4">
      <h1>To-Do</h1>
      <TaskList appId={appId} userId={userId} config={{}} />
    </div>
  );
}
```

### Example Widget Component

```typescript
// frontend/src/apps/todo/widgets/TaskList.tsx

"use client";

import { useState, useEffect } from "react";
import { Card } from "@heroui/react";
import { CheckSquare } from "lucide-react";
import type { WidgetComponentProps } from "@/types/widget";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
  due_date: string | null;
}

const PRIORITY_COLORS = {
  low: "text-blue-400",
  medium: "text-yellow-400",
  high: "text-red-400",
};

export default function TaskList({
  appId,
  userId,
  config,
}: WidgetComponentProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<string>(
    (config.filter as string) ?? "all"
  );

  useEffect(() => {
    const params = filter !== "all" ? `?status=${filter}` : "";
    fetch(`/api/apps/${appId}/tasks${params}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
      .then((r) => r.json())
      .then(setTasks);
  }, [appId, filter]);

  return (
    <Card className="p-4 widget-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-green-400" />
          <span className="text-sm font-semibold" style={{ color: "oklch(0.95 0.01 265)" }}>
            Task List
          </span>
        </div>
        <select
          className="bg-transparent text-xs px-2 py-1 rounded border"
          style={{ borderColor: "oklch(0.60 0.02 265)", color: "oklch(0.70 0.02 265)" }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="today">Due today</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="text-xs" style={{ color: "oklch(0.55 0.02 265)" }}>
            No tasks yet. Add one via chat!
          </p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-start gap-2 p-2 rounded-lg"
              style={{ background: "oklch(0.20 0.02 265)" }}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full mt-1 ${PRIORITY_COLORS[task.priority]}`}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm truncate"
                  style={{
                    color: task.status === "completed"
                      ? "oklch(0.55 0.02 265)"
                      : "oklch(0.95 0.01 265)",
                    textDecoration: task.status === "completed" ? "line-through" : "none",
                  }}
                >
                  {task.title}
                </p>
                {task.due_date && (
                  <p className="text-xs mt-0.5" style={{ color: "oklch(0.55 0.02 265)" }}>
                    Due: {new Date(task.due_date).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function getAccessToken(): string {
  // Implemented via the auth hook in real code
  return "";
}
```

### Wire Frontend to App Registry

```typescript
// frontend/src/apps/todo/index.ts
// Import the widgets module to trigger side-effect registration
export { } from "./widgets/index";
```

```typescript
// frontend/src/shared/apps/index.ts
// Add the import here:
import "@/apps/finance/widgets/index";
import "@/apps/todo/widgets/index";   // ← new
// ... future apps
```

> **Note:** In production, use `import.meta.glob` for auto-discovery:
> ```typescript
> const registers = import.meta.glob("./apps/*/index.ts", { eager: true });
> for (const mod of Object.values(registers)) {
>   // modules self-register
> }
> ```

---

## Step 8: Running and Testing

### Start the Backend

```bash
cd backend
pip install -e .
python -m uvicorn core.main:app --reload --port 8000
```

### Start the Frontend

```bash
cd frontend
npm run dev
```

### Test the Plugin

```bash
# 1. Check catalog — todo should appear
curl http://localhost:8000/api/apps/catalog

# 2. Install the app for a user
curl -X POST http://localhost:8000/api/apps/install \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"app_id": "todo"}'

# 3. Check widgets
curl http://localhost:8000/api/apps/todo/widgets

# 4. Create a task
curl -X POST "http://localhost:8000/api/apps/todo/tasks" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy groceries", "priority": "high"}'

# 5. List tasks
curl "http://localhost:8000/api/apps/todo/tasks" \
  -H "Authorization: Bearer <token>"
```

---

## Adding Dynamic Widget Config Options

Some widget config fields need dynamic options (e.g., which wallet to show).
Register a resolver for dynamic option sources.

### Backend: Register a Resolver

```python
# backend/apps/todo/resolvers.py

from typing import Annotated
from shared.schemas import SelectOption

async def resolve_filter_options(user_id: str, field: str) -> list[SelectOption]:
    if field == "filter":
        return [
            {"label": "All tasks", "value": "all"},
            {"label": "Due today", "value": "today"},
            {"label": "Overdue", "value": "overdue"},
            {"label": "High priority", "value": "high"},
        ]
    return []
```

```python
# backend/apps/todo/routes.py

from core.widget_resolvers import register_resolver

register_resolver("todo.filters", resolve_filter_options)
```

### Frontend: Use options_source in Manifest

```python
# In manifest.py, add to config_fields:
ConfigFieldSchema(
    name="filter",
    label="Filter",
    type="select",
    options_source="todo.filters",   # ← triggers resolver lookup
)
```

The frontend API endpoint `/api/widgets/config-options?widgetId=todo.task-list&field=filter`
calls the resolver and returns `SelectOption[]`.

---

## Troubleshooting

### Plugin not appearing in catalog

Check that `__init__.py` calls `register_plugin()` and that discovery hasn't raised an error:

```bash
python -c "from core.discovery import discover_apps; discover_apps(); from core.registry import PLUGIN_REGISTRY; print(list(PLUGIN_REGISTRY.keys()))"
```

### Widget not showing on dashboard

1. Check `widgets/index.ts` is imported in `shared/apps/index.ts`
2. Verify widget `id` matches exactly: `{app_id}.{kebab-name}`
3. Check the user has the app installed (`UserAppInstallation` record)

### Agent not responding

1. Verify tool names in manifest match function names
2. Check agent is registered with `register_agent("todo")`
3. Verify `on_install` ran (check MongoDB for seeded data)

### MongoDB query returns empty

**Always** add `user_id` filter:

```python
# ✅ Correct
Task.find(Task.user_id == user_id, Task.status == "pending")

# ❌ Wrong — security violation + will return all users' data
Task.find(Task.status == "pending")
```

---

## Checklist Before Submitting

- [ ] `backend/apps/{app_id}/__init__.py` calls `register_plugin()`
- [ ] `manifest.py` has a valid `AppManifestSchema` with unique `id`
- [ ] All widget `id`s follow `{app_id}.{kebab-name}` pattern
- [ ] `models.py` uses Beanie `Document`, has `Settings.name` set
- [ ] `repository.py` exists and contains **all Beanie queries** (no business logic)
- [ ] `service.py` exists and contains **all business logic** (NO FastAPI/Depends imports)
- [ ] `routes.py` calls `service` methods only (no direct Beanie calls except preferences)
- [ ] All tool names follow `{app_id}_{action}` convention
- [ ] Agent tools call `task_service`, NOT repository directly
- [ ] `routes.py` includes GET `/widgets`, GET/PUT `/preferences` endpoints
- [ ] `frontend/src/apps/{app_id}/widgets/index.ts` calls `registerWidget()` for each widget
- [ ] `frontend/src/shared/apps/index.ts` imports the new app's widgets
- [ ] Widget components export as default or are registered via `registerWidget()`
- [ ] Codegen ran if schemas were changed
