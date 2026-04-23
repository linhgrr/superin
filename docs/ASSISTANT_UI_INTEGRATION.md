# assistant-ui + FastAPI Integration

## Current Contract

Superin uses `@assistant-ui/react-data-stream` on the frontend and
`assistant-stream` on the backend.

The backend is the source of truth for:
- available tools
- installed-app routing
- root/child-agent orchestration
- SSE event shape

The frontend is responsible for:
- sending the active thread payload assistant-ui produces
- rendering streamed text plus the final server thread snapshot
- maintaining thread-local UI state

The frontend does **not** define or forward tool schemas for the backend to use.

## End-to-End Flow

```text
frontend/AppProviders
  -> useDataStreamRuntime
  -> POST /api/chat/stream
     body:
       - messages
       - threadId
       - parentId
       - runConfig
       - unstable_assistantMessageId
       - tools: {}   # may still be emitted by assistant-ui runtime; backend ignores it

backend/core/chat/routes.py
  -> authenticated FastAPI route
  -> extracts the latest non-empty user message from the request payload
  -> calls root_agent.astream(...)
  -> converts root text into assistant-stream chunks
  -> emits a final thread snapshot from persisted LangGraph state

backend/core/agents/root/agent.py
  -> loads installed apps and runtime context
  -> runs the root StateGraph orchestrator
  -> emits internal orchestration events such as:
       - app_result
       - merged_context
       - token
       - done

backend/core/agents/base_app.py
  -> each child app is a compiled LangGraph agent
  -> delegate(question, thread_id) returns a structured result for the root agent
```

## Request Payload

`assistant-ui` sends message history using AI SDK V2-style parts.

Relevant shapes:

```json
{
  "messages": [
    {
      "role": "user",
      "content": [{ "type": "text", "text": "check các ví hiện có" }]
    }
  ],
  "threadId": "__LOCALID_xxx",
  "parentId": "abc123",
  "runConfig": {},
  "tools": {}
}
```

Notes:
- `tools: {}` is harmless. The backend ignores it.
- assistant and tool messages may be present in the payload, but the backend chat route currently extracts only the latest non-empty user message for the new turn.
- canonical history comes from LangGraph checkpoint state keyed by `threadId`.

## Backend Parsing Rules

`RootAgent.astream()` only needs the latest user turn:

- user text -> `HumanMessage`
- assistant/tool payloads are ignored for root turn input because prior context is loaded from the checkpointer

## Streaming Rules

The route `POST /api/chat/stream` uses SSE data-stream responses.

Root agent emits internal events in this normalized shape:

```python
{"type": "app_result", "app_id": "...", "status": "success", "ok": True}
{"type": "merged_context", "content": "..."}
{"type": "token", "content": "..."}
{"type": "done"}
```

The FastAPI route currently forwards only:
- `token` -> `messages/partial`
- final persisted history -> `updates`
- errors -> `error`

Important:
- child-internal domain tools such as `finance_add_transaction` stay hidden from the frontend
- root orchestration metadata such as `app_result` and `merged_context` is currently server-internal, even though the root graph can emit it
- child-agent tool results are normalized centrally via tool middleware and carried in child-agent state, so app-domain tools can return raw domain objects and raise user-facing errors directly

## Parent / Child-Agent Boundary

This project uses a root orchestrator-worker pattern:

- root `StateGraph` plans dispatch
- worker runners invoke `platform`, `finance`, `todo`, `calendar`, or other installed child agents
- child agents may call domain tools internally

The child agent may call domain tools like:
- `finance_list_wallets`
- `finance_add_transaction`
- `todo_list_tasks`

But those child-internal events are **not** streamed to the frontend.
The UI should only see:
- root assistant text chunks
- the final normalized thread history snapshot

This prevents duplicated messages and avoids exposing child-agent internals.

## Threading and Memory

- Frontend callers may send the full active-thread history each turn.
- The backend uses `threadId` to load canonical thread state from the LangGraph checkpointer.
- Root agent persists conversation state through the checkpointer and the route updates thread metadata after streaming.
- Child app agents are currently stateless per invocation.

Important:
- MongoDB persistence currently stores user/assistant text turns, not the full
  structured internal orchestration history.
- assistant-ui sessions work correctly because thread replay comes from persisted server state.

## Frontend Runtime

The runtime is created in [AppProviders.tsx](/home/linh/Downloads/superin/frontend/src/components/providers/AppProviders.tsx).

Current setup:

```tsx
const runtime = useDataStreamRuntime({
  api: `${API_BASE_URL}/api/chat/stream`,
  protocol: "data-stream",
  credentials: "include",
  headers: () => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});
```

Current rendering:
- `messages/partial` chunks render the assistant text stream
- `updates` replaces the visible thread with the persisted server snapshot
- error states render via `MessagePrimitive.Error` / `ErrorPrimitive`
- no frontend-side `execute` handlers

## Verification Checklist

- `backend/core/chat/routes.py` returns the SSE stream
- `frontend` uses `useDataStreamRuntime`
- backend turn input is derived from the latest user message
- root agent does not stream child-agent internals to the UI
- frontend does not send tool schemas as backend authority
- `threadId` is forwarded from frontend to backend

## Files

- [routes.py](/home/linh/Downloads/superin/backend/core/chat/routes.py)
- [agent.py](/home/linh/Downloads/superin/backend/core/agents/root/agent.py)
- [base_app.py](/home/linh/Downloads/superin/backend/core/agents/base_app.py)
- [graph.py](/home/linh/Downloads/superin/backend/core/agents/root/graph.py)
- [AppProviders.tsx](/home/linh/Downloads/superin/frontend/src/components/providers/AppProviders.tsx)
- [ChatThread.tsx](/home/linh/Downloads/superin/frontend/src/components/chat/ChatThread.tsx)
