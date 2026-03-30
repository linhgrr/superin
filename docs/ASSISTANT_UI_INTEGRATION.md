# assistant-ui + FastAPI Integration Spec

## 1. Architecture Overview

```
Frontend (React + Vite)                     Backend (FastAPI + LangGraph)
──────────────────────────                   ──────────────────────────────
AssistantRuntimeProvider
  └─ useDataStreamRuntime                    POST /api/chat
       └─ api: "/api/chat"                      │
       └─ body.tools → JSON Schema          LangGraph RootAgent
       └─ body.messages                     ├─ executes tools (server-side)
                                              └─ streams text + tool_call events
       ┌──────────────────────────────────────────┐
       │  SSE: data stream protocol (assistant-stream) │
       └──────────────────────────────────────────┘
              │
              ▼
       Thread component renders:
       ├─ text parts (live)
       ├─ tool_call parts (show what was called)
       └─ tool_result parts (show execution result)
```

**Two design decisions upfront:**

1. **Tools execute server-side (LangGraph)** — FastAPI/LangGraph owns the tool logic.
   Frontend only needs tool schemas for UI rendering, not actual implementations.
   Result: backend sends `tool_call` + `tool_result` events in the stream.

2. **Assistant transport: `assistant-stream` Python package** — handles SSE protocol.
   Backend uses `createAssistantStreamResponse(controller => ...)` from `assistant-stream`.
   Frontend uses `@assistant-ui/react-data-stream` with `useDataStreamRuntime`.

---

## 2. Backend — FastAPI + assistant-stream

### 2.1 Install

```bash
# backend/
pip install assistant-stream
```

### 2.2 Dependencies to clarify

| Package | Purpose |
|---|---|
| `assistant-stream` (Python) | Server-side SSE protocol. `createAssistantStreamResponse`, event types. |
| `@assistant-ui/react-data-stream` | Client-side runtime. `useDataStreamRuntime`. |
| `@assistant-ui/react` | UI primitives: `Thread`, `MessagePrimitive`, `ComposerPrimitive`. |
| `assistant-stream` (JS) | Tool schema serialization. `toToolsJSONSchema()`. |

### 2.3 Data Stream Event Format

Backend streams newline-delimited JSON. Each line is one event:

```
event: text
data: {"type":"text","content":"Đã thêm giao dịch"}

event: tool_call
data: {"type":"tool_call","toolName":"finance_add_transaction","toolCallId":"tc_001","args":{"wallet_id":"...","amount":500}}

event: tool_result
data: {"type":"tool_result","toolCallId":"tc_001","result":{"success":true,"id":"..."}}

event: done
data: {"type":"done"}
```

### 2.4 Chat Endpoint (FastAPI)

```python
# backend/apps/chat.py

from fastapi import APIRouter, Depends, Request
from assistant_stream import createAssistantStreamResponse, RunController
from core.auth import get_current_user
from core.agents.root import root_agent

router = APIRouter()

@router.post("/stream")
async def chat_stream(
    request: Request,
    user_id: str = Depends(get_current_user),
):
    """
    POST /api/chat/stream
    Body: {
        "messages": GenericMessage[],
        "tools": ToolDefinition[]   # optional — from frontend
    }
    Returns: SSE (assistant-stream data stream protocol)
    """

    body = await request.json()
    messages = body.get("messages", [])
    incoming_tools = body.get("tools", [])

    async def run(controller: RunController):
        async for event in root_agent.astream(
            messages=messages,
            user_id=user_id,
            tools=incoming_tools,      # forwarded to app agents
        ):
            event_type = event.get("type")

            if event_type == "text":
                controller.append_text(event["content"])

            elif event_type == "tool_call":
                controller.add_tool_call(
                    tool_name=event["toolName"],
                    tool_call_id=event["toolCallId"],
                    args=event.get("args", {}),
                )

            elif event_type == "tool_result":
                controller.add_tool_result(
                    tool_call_id=event["toolCallId"],
                    result=event["result"],
                )

            elif event_type == "done":
                controller.complete()

    return createAssistantStreamResponse(run)
```

### 2.5 LangGraph RootAgent — stream events

```python
# backend/core/agents/root.py

async def astream(
    self,
    messages: list[GenericMessage],
    user_id: str,
    tools: list[ToolDefinition] | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Yields data-stream events for assistant-ui.
    Each yield = one SSE data line.
    """
    # ... (invoke LangGraph graph)
    async for event in graph.astream_events({"messages": messages, ...}, ...):
        if event["type"] == "on_chat_model_stream":
            yield {"type": "text", "content": event["data"]["chunk"].content}
        elif event["type"] == "on_tool_start":
            yield {
                "type": "tool_call",
                "toolName": event["name"],
                "toolCallId": event["id"],
                "args": event["data"].get("input", {}),
            }
        elif event["type"] == "on_tool_end":
            yield {
                "type": "tool_result",
                "toolCallId": event["id"],
                "result": event["data"]["output"],
            }
```

### 2.6 Tool Definition Forwarding

Frontend sends tool schemas. RootAgent receives them and passes to app agents:

```python
# backend/core/agents/root.py

async def astream(..., tools=None):
    user_apps = await get_user_apps(user_id)

    # Merge platform tools + frontend-provided tools
    all_tools = []
    for app_id in user_apps:
        plugin = PLUGIN_REGISTRY.get(app_id)
        if plugin:
            all_tools.extend(plugin.agent.get_tools())

    if tools:
        # Override/add tools from frontend schema
        for tool_def in tools:
            # Convert JSON Schema → LangChain tool if needed
            ...

    # Invoke graph with merged tools
    async for event in graph.astream_events({"messages": messages, "tools": all_tools}):
        yield format_event(event)
```

---

## 3. Frontend — React + assistant-ui

### 3.1 Install

```bash
# frontend/
npm install @assistant-ui/react \
           @assistant-ui/react-data-stream \
           assistant-stream
```

### 3.2 App Provider

```tsx
// frontend/src/components/providers.tsx

"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const runtime = useDataStreamRuntime({
    api: "/api/chat/stream",
    body: {
      // tools serialized from frontend definitions
      tools: toToolsJSONSchema(myTools),
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

> **Key:** `useDataStreamRuntime` automatically handles SSE parsing,
> text streaming, tool_call/tool_result rendering.
> Tool execution (with `execute:`) runs client-side.
> Since our tools are server-side, we omit `execute:` — backend handles it.

### 3.3 Tool Definitions (Frontend)

Frontend defines tools for UI rendering (schema + optional local execute):

```tsx
// frontend/src/lib/assistant-tools.ts

import { tool } from "@assistant-ui/react";
import { toToolsJSONSchema } from "assistant-stream";
import { z } from "zod";

const myTools = {
  // ── Finance tools ────────────────────────────────────────────
  finance_add_transaction: tool({
    description: "Add a new income or expense transaction",
    parameters: z.object({
      wallet_id: z.string(),
      category_id: z.string(),
      type: z.enum(["income", "expense"]),
      amount: z.number().positive(),
      date: z.string(),
      note: z.string().optional(),
    }),
    // No execute — server-side. Just for UI schema + button rendering.
  }),

  finance_list_wallets: tool({
    description: "List all wallets of the user",
    parameters: z.object({}),
  }),

  todo_add_task: tool({
    description: "Add a new task to the to-do list",
    parameters: z.object({
      title: z.string(),
      description: z.string().optional(),
      due_date: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
    }),
  }),

  todo_list_tasks: tool({
    description: "List tasks, optionally filtered by status",
    parameters: z.object({
      status: z.enum(["pending", "completed"]).default("pending"),
      limit: z.number().optional(),
    }),
  }),
};

// Serialize for backend
export const serializedTools = toToolsJSONSchema(myTools);

// Export for use in AppProviders
export { myTools };
```

### 3.4 Thread Component

```tsx
// frontend/src/components/chat/ChatThread.tsx

"use client";

import { Thread } from "@assistant-ui/react";

export function ChatThread() {
  return <Thread />;
}
```

### 3.5 Dashboard Layout

```tsx
// frontend/src/components/dashboard/DashboardShell.tsx

import { AppProviders } from "@/components/providers";
import { ChatThread } from "@/components/chat/ChatThread";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <div className="dashboard-grid">
        <aside className="sidebar">{/* app list */}</aside>
        <main>{children}</main>
        <aside>
          <ChatThread />
        </aside>
      </div>
    </AppProviders>
  );
}
```

---

## 4. Confirmed Answers

### Q1: ✅ `createAssistantStreamResponse` works with FastAPI

Package `assistant-stream` Python có hỗ trợ FastAPI trực tiếp:

```python
from assistant_stream import create_run
from assistant_stream.serialization import DataStreamResponse

stream = create_run(run_callback, state=request.state)
return DataStreamResponse(stream)
```

Không cần tự implement raw SSE. `DataStreamResponse` tự xử lý.

### Q2: ✅ Backend không parse tools — chỉ forward cho LLM

Frontend gửi `tools: toToolsJSONSchema(myTools)` (JSON Schema). Backend nhận nhưng **không cần parse** — forward trực tiếp cho AI provider (OpenAI, Anthropic, v.v.) để provider biết tool schemas. Assistant-ui dùng để render tool UI phía client.

```python
# Backend chỉ forward
{ tools } = await request.json()
response = await ai.generate({ messages, tools })  # ← gửi tiếp
```

### Q3: ✅ Mode B (server-side execute) confirmed

Backend chạy tool → stream `tool_call` → `tool_result`. Assistant-ui **tự động render** cả hai. Không cần manual intervention.

```
Backend: tool_call event  →  tool_result event  →  text event  →  done
Frontend: tool button        result chip           text           end
```

### Q4: ✅ LangGraph mapping tự động qua helper

```python
from assistant_stream.modules.langgraph import append_langgraph_event

async for namespace, event_type, chunk in graph.astream_events(...):
    append_langgraph_event(controller.state, namespace, event_type, chunk)
```

Tuy nhiên: với use case chỉ cần text + tool_call + tool_result → **Data Stream Protocol đơn giản hơn**, không cần Assistant Transport. Dùng trực tiếp `controller.append_text()`, `controller.add_tool_call()`, `controller.add_tool_result()`.

### Q5: ✅ Auto-scroll + multi-turn built-in

```tsx
<ThreadPrimitive.Viewport autoScroll={true} turnAnchor="top" />
```

- `autoScroll={true}` — default, cuộn khi có content mới
- `turnAnchor="top"` — modern UX (câu hỏi ở trên, câu trả lời chảy xuống)
- Messages persist trong thread runtime tự động
- Không cần quản lý state thủ công

### Q6: ⚠️ Không có MUI built-in — custom CSS cần thiết

Assistant-ui built on Tailwind + shadcn. Dark mode = custom CSS wrapper:
- Override className của `Thread`, `ComposerPrimitive`
- Hoặc fork shadcn Thread component + reskin
- Design system hiện tại (oklch tokens) → áp dụng qua CSS variables hoặc Tailwind `dark:` prefix

---

## 5. Implementation Steps (confirmed)

### Bước A: Backend — chat endpoint với assistant-stream

```bash
pip install assistant-stream
```

```python
# backend/apps/chat.py

from assistant_stream import create_run
from assistant_stream.serialization import DataStreamResponse
from fastapi import Depends

@router.post("/stream")
async def chat_stream(request: Request, user_id=Depends(get_current_user)):
    body = await request.json()
    messages = body.get("messages", [])
    incoming_tools = body.get("tools", [])  # JSON Schema — chỉ forward

    async def run(controller):
        async for event in root_agent.astream(user_id, messages, incoming_tools):
            et = event["type"]
            if et == "text":
                controller.append_text(event["content"])
            elif et == "tool_call":
                controller.add_tool_call(event["toolName"], event["toolCallId"], event["args"])
            elif et == "tool_result":
                controller.add_tool_result(event["toolCallId"], event["result"])
            elif et == "done":
                controller.complete()

    return DataStreamResponse(create_run(run, state={"messages": messages}))
```

Test: `curl -X POST http://localhost:8000/api/chat/stream -H "Authorization: Bearer $TOKEN" -d '{"messages":[{"role":"user","content":[{"type":"text","text":"hi"}]}]}'`

### Bước B: RootAgent — stream data stream events

LangGraph → direct controller calls (không cần `append_langgraph_event` helper):

```python
# backend/core/agents/root.py

async def astream(self, user_id, messages, incoming_tools):
    user_apps = await get_user_apps(user_id)
    all_tools = []
    for app_id in user_apps:
        plugin = PLUGIN_REGISTRY.get(app_id)
        if plugin:
            all_tools.extend(plugin.agent.tools())

    graph = build_graph(all_tools)  # LangGraph StateGraph

    async with graph.astream_events({"messages": messages, "user_id": user_id}) as stream:
        async for namespace, event_type, chunk in stream:
            if event_type == "on_chat_model_stream":
                yield {"type": "text", "content": chunk.content}
            elif event_type == "on_tool_start":
                yield {
                    "type": "tool_call",
                    "toolName": chunk.name,
                    "toolCallId": chunk.id,
                    "args": chunk.input,
                }
            elif event_type == "on_tool_end":
                yield {
                    "type": "tool_result",
                    "toolCallId": chunk.id,
                    "result": chunk.output,
                }
```

### Bước C: Frontend — useDataStreamRuntime

```bash
npm install @assistant-ui/react \
           @assistant-ui/react-data-stream \
           assistant-stream
```

```tsx
// frontend/src/components/providers.tsx

import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";
import { toToolsJSONSchema } from "assistant-stream";
import { myTools } from "@/lib/assistant-tools";  // tool defs without execute:

const runtime = useDataStreamRuntime({
  api: "/api/chat/stream",
  body: {
    tools: toToolsJSONSchema(myTools),
  },
});
```

Tools là **server-side** — không có `execute:`. Backend chạy tool + stream result.

### Bước D: Thread UI + dark mode CSS

Thread component cần custom CSS để match design system:

```tsx
// frontend/src/components/chat/ChatThread.tsx
import { Thread } from "@assistant-ui/react";

export function ChatThread() {
  return (
    <div className="h-full flex flex-col" style={{ background: "oklch(0.14 0.01 265)" }}>
      <Thread className="chat-thread" />
    </div>
  );
}
```

```css
/* globals.css thêm */
.chat-thread {
  --aui-background: oklch(0.14 0.01 265);
  --aui-surface: oklch(0.18 0.01 265);
  --aui-border: oklch(0.28 0.02 265);
  --aui-text: oklch(0.95 0.01 265);
  --aui-muted: oklch(0.55 0.02 265);
  --aui-primary: oklch(0.65 0.21 280);
}
```

### Bước E: Wire vào AppProviders + DashboardShell

```tsx
// frontend/src/components/dashboard/DashboardShell.tsx
import { AppProviders } from "@/components/providers";
import { ChatThread } from "@/components/chat/ChatThread";

export function DashboardShell({ children }) {
  return (
    <AppProviders>
      <div className="dashboard-grid">
        <aside className="sidebar">...</aside>
        <main>{children}</main>
        <aside className="flex flex-col">
          <ChatThread />
        </aside>
      </div>
    </AppProviders>
  );
}
```

---

## 6. File changes (update IMPLEMENTATION_PLAN)

| Task | File | Changes |
|------|------|---------|
| 10 (Chat route) | `backend/apps/chat.py` | Rewrite với `assistant-stream` + `DataStreamResponse` |
| 11 (RootAgent) | `backend/core/agents/root.py` | Add `astream()` generator → `{type, content}` events |
| **New 11b** | `backend/pyproject.toml` | Thêm `assistant-stream` |
| **New 12** | `frontend/src/lib/assistant-tools.ts` | Tool defs (no execute) + `toToolsJSONSchema` |
| **New 12b** | `frontend/src/components/providers.tsx` | `useDataStreamRuntime` + `AppProviders` |
| **New 12c** | `frontend/src/components/chat/ChatThread.tsx` | `Thread` wrapper |
| 19 (Chat UI) | → merged vào New 12b/12c | |
| 18 (Dashboard) | `frontend/src/components/dashboard/DashboardShell.tsx` | Add `AppProviders` + chat column |
| 15 (API client) | `frontend/src/api/client.ts` | Thêm `/api/chat/stream` endpoint wrapper (nếu cần)
