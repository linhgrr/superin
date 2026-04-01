# assistant-ui + FastAPI Integration

## Current Contract

Shin SuperApp uses `@assistant-ui/react-data-stream` on the frontend and
`assistant-stream` on the backend.

The backend is the source of truth for:
- available tools
- installed-app routing
- root/child-agent orchestration
- SSE event shape

The frontend is responsible for:
- sending message history for the active thread
- rendering streamed text/tool-call/tool-result parts
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

backend/apps/chat.py
  -> authenticated FastAPI route
  -> calls root_agent.astream(..., skip_db_load=True)
  -> converts root events to assistant-stream data stream

backend/core/agents/root/agent.py
  -> builds tools from installed apps only
  -> wraps each installed child app as ask_{app_id}
  -> streams:
       - root assistant text
       - root tool call/result events
  -> hides child-agent internal tool calls/tokens from the UI

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
    },
    {
      "role": "assistant",
      "content": [
        {
          "type": "tool-call",
          "toolCallId": "call_1",
          "toolName": "ask_finance",
          "input": { "question": "check các ví hiện có" }
        }
      ]
    },
    {
      "role": "tool",
      "content": [
        {
          "type": "tool-result",
          "toolCallId": "call_1",
          "toolName": "ask_finance",
          "output": {
            "type": "json",
            "value": { "wallets": [] }
          }
        }
      ]
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
- `input` is the correct tool-call argument field from assistant-ui.
- `output.value` is the correct tool-result payload field.

## Backend Parsing Rules

`RootAgent.astream()` parses incoming message history into LangChain messages:

- user text -> `HumanMessage`
- assistant tool call -> `AIMessage.tool_calls[*].args` from `input`
- tool result -> `ToolMessage.content` from `output.value`

This avoids the previous bug where `args=None` caused:

```text
2 validation errors for AIMessage
tool_calls.0.args
```

## Streaming Rules

The route `POST /api/chat/stream` uses assistant-stream `DataStreamResponse`.

Root agent emits internal events in this normalized shape:

```python
{"type": "token", "content": "..."}
{"type": "tool_call", "toolName": "ask_finance", "toolCallId": "run_id", "args": {...}}
{"type": "tool_result", "toolCallId": "run_id", "result": ...}
{"type": "done"}
```

The FastAPI route converts them into assistant-ui stream parts:
- text -> `append_text(...)`
- tool call -> `add_tool_call(...)`
- tool result -> `set_response(...)` or `add_tool_result(...)`

Important:
- only root-level tool events are streamed to assistant-ui
- child-internal domain tools such as `finance_add_transaction` must stay hidden from the frontend
- every streamed tool result must correspond to a previously streamed root-level tool call id

## Parent / Child-Agent Boundary

This project uses the LangGraph pattern where the outer/root agent wraps each
child app agent as a tool:

- `ask_finance(question)`
- `ask_todo(question)`

The child agent may call domain tools like:
- `finance_list_wallets`
- `finance_add_transaction`
- `todo_list_tasks`

But those child-internal events are **not** streamed to the frontend.
The UI should only see:
- the root tool call `ask_finance`
- the root tool result for `ask_finance`
- the root assistant's final text

This prevents duplicated messages and avoids exposing child-agent internals.
`ask_{app_id}` results are structured objects, not plain text strings.

## Threading and Memory

- Frontend callers send the full active-thread history each turn.
- Therefore the chat route uses `skip_db_load=True`.
- Root agent still persists the latest user/assistant text turns to MongoDB after streaming.
- Child app agents are currently stateless per invocation.

Important:
- MongoDB persistence currently stores user/assistant text turns, not the full
  structured tool-call/tool-result history.
- assistant-ui sessions work correctly because the frontend sends full history.

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
- `text` parts render as markdown bubbles
- `tool-call` parts render as compact badges
- error states render via `MessagePrimitive.Error` / `ErrorPrimitive`
- no frontend-side `execute` handlers

## Verification Checklist

- `backend/apps/chat.py` returns `DataStreamResponse`
- `frontend` uses `useDataStreamRuntime`
- root agent parses `input` and `output.value`
- root agent does not stream child-agent internals
- frontend does not send tool schemas as backend authority
- `threadId` is forwarded from frontend to backend

## Files

- [chat.py](/home/linh/Downloads/superin/backend/apps/chat.py)
- [agent.py](/home/linh/Downloads/superin/backend/core/agents/root/agent.py)
- [base_app.py](/home/linh/Downloads/superin/backend/core/agents/base_app.py)
- [tools.py](/home/linh/Downloads/superin/backend/core/agents/root/tools.py)
- [AppProviders.tsx](/home/linh/Downloads/superin/frontend/src/components/providers/AppProviders.tsx)
- [ChatThread.tsx](/home/linh/Downloads/superin/frontend/src/components/chat/ChatThread.tsx)
