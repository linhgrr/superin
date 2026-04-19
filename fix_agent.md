# Fix Plan: Agent System → Production Grade

> **Scope:** `backend/core/agents/` + `backend/shared/agent_context.py` + `backend/core/chat/` + tool call-sites ở `backend/apps/*/tools*.py`.
> **Mục tiêu:** Bỏ toàn bộ code đang tự cài lại LangGraph/LangChain, bắt mọi failure mode đúng exception, chuyển short-term state sang checkpointer chính thống, chuẩn hóa tool context qua `RunnableConfig`, tracing 100% LLM calls, và pass lint/test/verify.
> **Stack target:** `langgraph==0.4.x`, `langgraph-checkpoint-mongodb==0.1.2`, `langgraph-store-mongodb==0.1.0`, `langgraph-prebuilt==0.1.8`, `langchain-core>=0.3.82`.

---

## 0. Nguyên tắc (non-negotiable)

1. **Một source of truth cho state.** Short-term conversation state nằm ở checkpointer của LangGraph. `ConversationMessage` collection chỉ phục vụ REST API list/export — không phải input cho graph.
2. **Không LLM call ngoài graph.** Mọi `llm.ainvoke / astream / with_structured_output.ainvoke` phải chạy bên trong `@entrypoint` hoặc `@task` để được trace/replay/checkpoint.
3. **Không ContextVar cho business identity.** `user_id`, `thread_id`, `user_tz` đi qua `RunnableConfig.configurable`. ContextVar chỉ được dùng cho cross-cutting concern không mang business meaning (ví dụ request-id logging).
4. **Không silent catch.** Mọi `except` phải log hoặc re-raise hoặc convert thành structured result. Vi phạm CLAUDE.md rule #6.
5. **Không duplicate guardrail.** Một thuộc tính (recursion, timeout, size limit) được enforce ở đúng một tầng.
6. **Typed, traced, tested.** Mọi function public có type hints + docstring; mọi path error có test; mọi LLM call có LangSmith trace.

---

## 1. Kiến trúc mục tiêu

```
Frontend ──POST /api/chat/stream──▶ RootAgent.astream
                                          │
                                          ▼  (user_id, thread_id → configurable)
                        ┌──────────────── @entrypoint root_agent ────────────────┐
                        │  checkpointer = AsyncMongoDBSaver                       │
                        │  store        = MongoDBStore                            │
                        │                                                         │
                        │   previous: RootState | None   ◀── auto-inject          │
                        │                                                         │
                        │   ┌─ @task decide_target_apps(messages, catalog) ─┐     │
                        │   │   structured LLM call (traced, retryable)     │     │
                        │   └───────────────────────────────────────────────┘     │
                        │                                                         │
                        │   ┌─ for app_id in target_apps:                 ─┐     │
                        │   │     future = app_worker_task(question, cfg)  │     │
                        │   │     futures.append((app_id, future))         │     │
                        │   │ results = await asyncio.gather(*futures)     │     │
                        │   └──────────────────────────────────────────────┘     │
                        │                                                         │
                        │   ┌─ @task synthesize(messages, merged, previous) ┐    │
                        │   │   LLM astream() with writer() for token push   │    │
                        │   └────────────────────────────────────────────────┘    │
                        │                                                         │
                        │   return RootState(..., last_answer=...)                │
                        └─────────────────────────────────────────────────────────┘

RunnableConfig.configurable = {
  thread_id, user_id, user_tz, locale, installed_app_ids
}
# auto-propagate xuống @task, xuống child graph, xuống tool
```

---

## 2. Fix plan theo từng Pull Request

Mỗi mục là một commit/PR độc lập, có test cover. Thứ tự bắt buộc (P0 chặn P1 chặn P2 …). Không gộp để tránh blast-radius lớn.

### PR-0 Hotfixes (P0 — đưa lên main trong 1 ngày)

Chỉ sửa bug, không đổi contract.

#### 0.1 `zip(futures, cf_futures)` destructuring bug

`backend/core/agents/root/graph.py`:

```python
# ❌ Before (L139-143)
cf_futures = [f for _, f in futures]
for (app_id, cf_future) in zip(futures, cf_futures):
    result = await cf_future
```

```python
# ✅ After
for app_id, future in futures:
    result = await future
```

Xóa biến `cf_futures`. Viết test kiểm chứng `writer()` nhận `app_id: str` chứ không phải tuple:

```python
# backend/tests/core/test_root_graph_events.py
async def test_writer_emits_string_app_id(monkeypatch):
    events: list[dict] = []
    ...
    assert all(isinstance(e["app_id"], str) for e in events if e["type"] == "app_result")
```

#### 0.2 Catch `GraphRecursionError`

`backend/core/agents/base_app.py`:

```python
from langgraph.errors import GraphRecursionError

try:
    result = await asyncio.wait_for(...)
except TimeoutError:
    ...
except GraphRecursionError:
    logger.warning(
        "child agent exceeded recursion_limit",
        extra={"app_id": self.app_id, "limit": AGENT_RECURSION_LIMIT},
    )
    return self._failed_result(
        question,
        f"{self.app_id} cần quá nhiều bước để hoàn thành. Hãy thử câu đơn giản hơn.",
    )
except (AttributeError, TypeError, ValueError) as exc:
    ...
```

Đồng thời refactor các return `{...}` thành `self._failed_result(question, msg)` helper để tránh lặp shape.

#### 0.3 Bỏ silent catch ở `_extract_args`

`backend/core/agents/root/agent.py:308-317`:

```python
def _extract_args(args_str: Any) -> dict:
    if isinstance(args_str, dict):
        return args_str
    if isinstance(args_str, str):
        try:
            return json.loads(args_str)
        except json.JSONDecodeError as exc:
            logger.warning(
                "tool_call args are not valid JSON, falling back to empty dict",
                extra={"preview": args_str[:200], "error": str(exc)},
            )
            return {}
    logger.warning("tool_call args of unexpected type %s, using {}", type(args_str).__name__)
    return {}
```

#### 0.4 Fix import path `BaseStore`

`backend/core/agents/root/helpers.py:16-17`:

```python
# ❌ Before
if TYPE_CHECKING:
    from langchain.store.base import BaseStore
```

```python
# ✅ After
if TYPE_CHECKING:
    from langgraph.store.base import BaseStore
```

#### 0.5 Cập nhật docstring lệch

- `backend/core/agents/root/__init__.py` — bỏ nhắc `asyncio.as_completed`, `MemorySaver`.
- `backend/core/agents/root/memory.py:1-8` — bỏ nhắc `MemorySaver`.
- Sẽ viết lại sau PR-1 (khi checkpointer thật sự có) nhưng tạm thời xóa claim sai.

**PR-0 acceptance:** tất cả test hiện tại pass; thêm 2 test mới cho 0.1 và 0.2; không đổi API contract của frontend.

---

### PR-1 Short-term memory chuẩn: `AsyncMongoDBSaver` checkpointer

**Mục tiêu:** Thay `RootAgent._build_message_list` (đọc `ConversationMessage` mỗi turn, rebuild list messages) bằng checkpointer tự quản lý state theo `thread_id`.

#### 1.1 Thêm checkpointer vào `core/db.py`

```python
# backend/core/db.py
from langgraph.checkpoint.mongodb.aio import AsyncMongoDBSaver
from langgraph.store.mongodb import MongoDBStore

_checkpointer: AsyncMongoDBSaver | None = None
_store: MongoDBStore | None = None

async def init_db() -> None:
    global _client, _sync_client, _store, _checkpointer

    _client = AsyncIOMotorClient(settings.mongodb_uri)
    _sync_client = MongoClient(settings.mongodb_uri)  # MongoDBStore yêu cầu sync

    # Long-term store (unchanged)
    _store = MongoDBStore(_sync_client[settings.mongodb_database]["agent_store"])

    # Short-term checkpointer (NEW)
    _checkpointer = AsyncMongoDBSaver(
        client=_client,                            # async motor client
        db_name=settings.mongodb_database,
        checkpoint_collection_name="agent_checkpoints",
        writes_collection_name="agent_checkpoint_writes",
    )
    await _checkpointer.setup()   # tạo indexes cần thiết

    await init_beanie(...)        # như cũ


def get_checkpointer() -> AsyncMongoDBSaver:
    if _checkpointer is None:
        raise RuntimeError("Checkpointer not initialized. Call init_db() first.")
    return _checkpointer
```

Index contract: thêm `agent_checkpoints` và `agent_checkpoint_writes` vào `core/utils/index_contract.py` để `db check-indexes` hiểu collections này (LangGraph tự tạo indexes ở `.setup()`; index_contract chỉ cần whitelist tên).

#### 1.2 Đổi root `@entrypoint` dùng checkpointer + `previous`

```python
# backend/core/agents/root/graph.py
from typing import TypedDict
from langchain_core.messages import BaseMessage
from langgraph.func import entrypoint
from langgraph.types import StreamWriter

class RootState(TypedDict):
    """State persisted per thread_id qua checkpointer."""
    messages: list[BaseMessage]
    last_answer: str
    last_app_results: list[dict]


def _build_entrypoint(store, checkpointer):
    @entrypoint(store=store, checkpointer=checkpointer)
    async def root_agent(
        new_input: NewTurnInput,
        *,
        previous: RootState | None,
        writer: StreamWriter,
        config: RunnableConfig,
    ) -> RootState:
        prior_messages: list[BaseMessage] = (previous or {}).get("messages", [])
        new_messages: list[BaseMessage] = new_input["new_messages"]
        messages = prior_messages + new_messages

        cfg = config["configurable"]
        user_id = cfg["user_id"]
        installed_app_ids = cfg["installed_app_ids"]

        target_apps, question = await decide_target_apps_task(messages, installed_app_ids)
        ...
        final_answer = await synthesize_task(messages, merged, user_id)

        return {
            "messages": messages + [AIMessage(content=final_answer)],
            "last_answer": final_answer,
            "last_app_results": app_results,
        }
    return root_agent
```

`NewTurnInput` chỉ chứa messages **của turn mới** (thường là 1 HumanMessage), không phải toàn bộ history. History được load tự động qua `previous`.

#### 1.3 `RootAgent.astream` gọn lại

```python
# backend/core/agents/root/agent.py
async def astream(self, user_id, new_turn_messages, thread_id=None):
    thread = _resolve_thread(user_id, thread_id)
    user = await User.find_one(User.id == PydanticObjectId(user_id))
    tz_name = get_user_timezone_context(user).tz_name if user else "UTC"
    installed = await _load_installed_app_ids(user_id)

    graph = get_root_agent_graph()
    config = {
        "configurable": {
            "thread_id": thread,
            "user_id": user_id,
            "user_tz": tz_name,
            "installed_app_ids": sorted(installed),
        },
    }
    new_input = {"new_messages": _parse_new_turn(new_turn_messages)}

    async for chunk in graph.astream(new_input, config=config, stream_mode="custom"):
        ...
```

Hai điểm quan trọng:
- `new_turn_messages` chỉ là turn mới từ FE (không phải toàn bộ history). Frontend đã gửi toàn bộ history vì BE không có state — sau PR-1 thì ngược lại.
- `MessageParser` thu nhỏ còn `_parse_new_turn` chỉ parse đúng turn mới, đơn giản hơn nhiều.

#### 1.4 Route chat ở `core/chat/routes.py`

- REST `GET /api/chat/threads/{thread_id}/messages` tiếp tục trả từ `ConversationMessage` (source cho UI list history).
- `POST /api/chat/stream` chỉ gửi new user message (không gửi full history nữa). Backend append vào `ConversationMessage` sau khi stream done (write-behind) để UI list vẫn thấy.
- Migration: giữ handler cũ nhận full history trong 1 release, log deprecation, rồi bỏ.

#### 1.5 Frontend hợp đồng

`frontend/src/components/chat/ChatThread.tsx` (hoặc component gọi `/api/chat/stream`):

- Trước: gửi `{ messages: [full thread] }`.
- Sau: gửi `{ new_messages: [last user message] }`.
- BE vẫn hỗ trợ cả hai trong 1 release (feature flag `use_checkpointer_history`) để an toàn rollout.

#### 1.6 Test

```python
# test_root_agent_checkpointer.py
async def test_root_agent_uses_previous_from_checkpointer(async_mongo_saver):
    graph = _build_entrypoint(store=None, checkpointer=async_mongo_saver)

    cfg = {"configurable": {"thread_id": "user:u1", "user_id": "u1", ...}}

    # Turn 1
    await graph.ainvoke({"new_messages": [HumanMessage("liệt kê ví")]}, cfg)

    # Turn 2 — chỉ gửi turn mới
    state = await graph.ainvoke({"new_messages": [HumanMessage("thêm ví nữa")]}, cfg)

    # State phải chứa cả 2 turn
    assert len(state["messages"]) >= 2
    assert any("liệt kê ví" in m.content for m in state["messages"] if isinstance(m, HumanMessage))
```

**PR-1 acceptance:** graph state persist qua restart, routing LLM thấy ngữ cảnh đa-turn, `ConversationMessage` không còn là input cho agent.

---

### PR-2 `user_id` / `user_tz` qua `RunnableConfig` — bỏ `ContextVar`

**Scope ảnh hưởng (đã scan):**
- `backend/core/agents/base_app.py`
- `backend/apps/calendar/agent.py`, `apps/calendar/tools/{events,tasks,calendars,recurring}.py`
- `backend/apps/todo/agent.py`, `apps/todo/tools.py`
- `backend/apps/finance/agent.py`, `apps/finance/tools.py`
- `backend/shared/tool_results.py`
- `backend/shared/agent_context.py` (sẽ xóa)

#### 2.1 Thêm `RunnableConfig` vào mọi tool

Pattern chuẩn cho tool nhận config:

```python
# backend/apps/finance/tools.py
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig

@tool("finance_add_transaction")
async def finance_add_transaction(
    wallet_id: str,
    amount: float,
    category_id: str,
    note: str = "",
    *,
    config: RunnableConfig,
) -> dict:
    """Add a transaction to the user's finance ledger."""
    cfg = config["configurable"]
    user_id = cfg["user_id"]
    tz = cfg["user_tz"]
    return await _add_transaction_impl(user_id, wallet_id, amount, category_id, note, tz)
```

LangChain/LangGraph tự inject `config` nếu function có tham số tên `config: RunnableConfig`. Không cần decorator phụ.

#### 2.2 Child graph nhận config từ `@task`

`@task` của LangGraph tự forward config từ caller xuống callee. Không cần pass tay.

`BaseAppAgent.delegate` đổi:

```python
# base_app.py
async def delegate(
    self,
    question: str,
    *,
    config: RunnableConfig,
) -> dict[str, Any]:
    cfg = config["configurable"]
    user_id = cfg["user_id"]
    thread_id = cfg["thread_id"]
    child_thread_id = f"{thread_id}:{self.app_id}"

    # Build child config — scope thread_id, giữ user_id và user_tz
    child_config = {
        "configurable": {
            **cfg,
            "thread_id": child_thread_id,
        },
        "recursion_limit": AGENT_RECURSION_LIMIT,
    }

    try:
        result = await asyncio.wait_for(
            self.graph.ainvoke(
                {"messages": [HumanMessage(content=question)]},
                config=child_config,
            ),
            timeout=settings.llm_request_timeout_seconds,
        )
        ...
```

Bỏ `set_user_context`, `set_thread_context`, bỏ `get_user_context()` fallback. Tool nào không nhận `config` → raise `TypeError` rõ ràng (tốt hơn nhận empty string silently).

#### 2.3 Dynamic prompt function cho child agent

Thay cách hiện tại ghép "Current date: ... " vào user message:

```python
# base_app.py
from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig

def _make_prompt(build_system_text):
    def prompt(state, config: RunnableConfig):
        cfg = config["configurable"]
        tz = cfg.get("user_tz", "UTC")
        now_ctx = get_user_timezone_context_for_tz(tz)
        date_str, time_str = now_ctx.get_date_time_tuple()
        system = (
            f"Current date: {date_str}, current time: {time_str}.\n\n"
            f"{build_system_text()}"
        )
        return [SystemMessage(content=system), *state["messages"]]
    return prompt


class BaseAppAgent:
    @property
    def graph(self) -> CompiledStateGraph:
        if self._graph is None:
            self._graph = create_react_agent(
                model=get_llm(),
                tools=self.tools(),
                prompt=_make_prompt(self.build_prompt),
                name=f"{self.app_id}_agent",
            )
        return self._graph
```

User message giữ nguyên nội dung gốc — không còn bị bẩn bởi prefix datetime.

#### 2.4 Xóa `backend/shared/agent_context.py`

Sau khi migrate hết tools. Để 1 release transition:
- Release N: thêm config, tools đọc cả config và ContextVar, log deprecation khi fallback ContextVar.
- Release N+1: bỏ ContextVar, xóa file.

#### 2.5 Test

```python
async def test_tool_reads_user_id_from_config():
    result = await finance_add_transaction.ainvoke(
        {"wallet_id": "w1", "amount": 100, "category_id": "c1"},
        config={"configurable": {"user_id": "u1", "user_tz": "Asia/Ho_Chi_Minh"}},
    )
    assert result["ok"] is True

async def test_tool_raises_without_user_id_in_config():
    with pytest.raises((KeyError, TypeError)):
        await finance_add_transaction.ainvoke({...}, config={"configurable": {}})
```

**PR-2 acceptance:** không còn file nào import `get_user_context`; tất cả tools có `config: RunnableConfig`; `grep -r "agent_context" backend/` chỉ trả result rỗng.

---

### PR-3 LLM calls trong graph — `@task` cho routing & synthesize

**Mục tiêu:** 100% LLM call đi qua `@task` → LangSmith traces + retry policy + checkpoint.

#### 3.1 Routing → `@task`

```python
# backend/core/agents/root/workers.py
from langgraph.func import task
@task(retry_policy={"max_attempts": 2, "backoff_factor": 2.0})
async def decide_target_apps_task(
    messages: list[BaseMessage],
    installed_app_ids: list[str],
) -> tuple[list[str], str]:
    from .helpers import decide_target_apps  # pure logic helper
    return await decide_target_apps(messages, installed_app_ids)
```

`@task` retry policy tự handle transient LLM failures mà hiện tại đang silent-swallow.

#### 3.2 Synthesize → `@task` + `writer` forward

LangGraph cho phép `@task` nhận `writer`:

```python
@task
async def synthesize_task(
    messages: list[BaseMessage],
    merged_context: str,
    user_id: str,
    *,
    writer: StreamWriter,
    store: BaseStore | None,
) -> str:
    from .helpers import synthesize
    return await synthesize(messages, writer, user_id, store, merged_context=merged_context)
```

Gọi từ entrypoint: `final_answer = await synthesize_task(messages, merged, user_id)`. Writer được LangGraph tự inject nếu `@task` declare nó trong signature.

#### 3.3 Routing prompt dùng `agent_description` + multi-turn context

`backend/core/agents/root/helpers.py`:

```python
def _build_routing_catalog(installed_app_ids: list[str]) -> str:
    from core.registry import PLUGIN_REGISTRY
    lines = []
    for aid in installed_app_ids:
        plugin = PLUGIN_REGISTRY.get(aid)
        if plugin is None:
            continue
        desc = plugin["manifest"].agent_description or "(no description)"
        lines.append(f"- `{aid}`: {desc}")
    return "\n".join(lines) if lines else "(no apps installed)"


async def decide_target_apps(
    messages: list[BaseMessage],
    installed_app_ids: list[str],
) -> tuple[list[str], str]:
    if not installed_app_ids:
        return ([], "")

    question = extract_question(messages)
    if not question:
        return ([], "")

    catalog = _build_routing_catalog(installed_app_ids)

    # Include last N turns for context
    recent = [m for m in messages[-6:] if isinstance(m, (HumanMessage, AIMessage))]

    system = (
        "You are a routing assistant. Decide which installed apps are needed.\n"
        f"Installed apps:\n{catalog}\n\n"
        "Rules:\n"
        "- Return a JSON array of app_ids.\n"
        "- [] if none apply.\n"
        "- Include multiple apps only when the answer genuinely needs them.\n"
        "- Take conversation history into account for short follow-ups "
        "(e.g. 'thêm cái nữa' refers to whatever the last turn was about)."
    )

    structured_llm = get_llm().with_structured_output(RoutingDecision)
    response = await structured_llm.ainvoke(
        [SystemMessage(content=system), *recent, HumanMessage(content=question)],
    )
    valid = [a for a in response.app_ids if a in installed_app_ids]
    logger.debug(
        "routing_decision",
        extra={"question": question[:100], "decided": response.app_ids, "valid": valid},
    )
    return valid, question
```

#### 3.4 Test

```python
async def test_routing_uses_agent_description(monkeypatch):
    # Inject 2 plugins có agent_id không self-descriptive
    monkeypatch.setattr("core.registry.PLUGIN_REGISTRY", {
        "health2": {"manifest": make_manifest("health2", agent_description="Track weight, sleep, exercise.")},
        "fin": {"manifest": make_manifest("fin", agent_description="Manage money, budgets, wallets.")},
    })
    # Câu hỏi money-related → phải chọn `fin`
    apps, _ = await decide_target_apps([HumanMessage("how much did I spend this week?")], ["health2", "fin"])
    assert apps == ["fin"]


async def test_routing_uses_recent_context():
    msgs = [
        HumanMessage("liệt kê các ví của tôi"),
        AIMessage("Bạn có 2 ví: Main ($100), Savings ($500)."),
        HumanMessage("thêm một cái nữa"),
    ]
    apps, _ = await decide_target_apps(msgs, ["finance", "todo"])
    assert "finance" in apps
```

**PR-3 acceptance:** LangSmith trace cho 1 chat turn hiện đủ: entrypoint → routing task → N worker tasks → synthesize task. Không có raw LLM call nào ngoài graph.

---

### PR-4 Bỏ guard trùng & fan-out chuẩn

#### 4.1 Bỏ `MAX_TOOL_CALLS_PER_DELEGATION`

`backend/core/agents/base_app.py`:

- Xóa block count trong `_extract_tool_results` (L215-250).
- Xóa constant `MAX_TOOL_CALLS_PER_DELEGATION` trong `core/constants.py`.
- `recursion_limit=AGENT_RECURSION_LIMIT` + `GraphRecursionError` handler ở PR-0.2 đã đủ.

#### 4.2 Fan-out: `asyncio.gather` thay vì for-loop

```python
# graph.py — Step 3
import asyncio

results_or_exc = await asyncio.gather(
    *(future for _, future in futures),
    return_exceptions=True,
)

app_results: list[dict] = []
app_errors: list[dict] = []
for (app_id, _), result in zip(futures, results_or_exc):
    if isinstance(result, Exception):
        logger.error("worker_failed", extra={"app_id": app_id, "error": str(result)})
        result = _failed_worker_dict(app_id, question, str(result))

    (app_errors if result.get("status") == "failed" else app_results).append(result)
    writer({
        "type": "app_result",
        "app_id": app_id,
        "status": result.get("status", "unknown"),
        "ok": result.get("ok", False),
    })
```

Đồng bộ docstring `__init__.py` để nói đúng `asyncio.gather`. Lý do dùng được: từ `langgraph>=0.3` `SyncFuture` của `@task` đã awaitable qua `asyncio.gather`. Viết test xác nhận parallel:

```python
async def test_fan_out_runs_in_parallel(monkeypatch):
    delays = [0.2, 0.2, 0.2]
    # Mock mỗi app_worker sleep 200ms
    ...
    start = time.monotonic()
    await graph.ainvoke({"new_messages": [...]}, config=...)
    elapsed = time.monotonic() - start
    assert elapsed < 0.5  # parallel, không phải 0.6 sequential
```

#### 4.3 `refresh_workers` refresh thật

```python
# workers.py
def refresh_workers() -> None:
    """Clear registry và re-register toàn bộ workers từ PLUGIN_REGISTRY."""
    task = _get_task_decorator()
    TASK_REGISTRY.clear()
    _registered_app_ids.clear()

    for app_id, plugin in PLUGIN_REGISTRY.items():
        agent: BaseAppAgent = plugin["agent"]

        @task
        async def app_worker(
            question: str,
            _app_id: str = app_id,
            _agent: BaseAppAgent = agent,
            *,
            config: RunnableConfig,
        ) -> dict[str, Any]:
            return await _run_app_delegate(question, _app_id, _agent, config=config)

        TASK_REGISTRY[app_id] = app_worker
        _registered_app_ids.add(app_id)
        logger.info("registered_worker", extra={"app_id": app_id})
```

Test:

```python
def test_refresh_workers_picks_up_new_plugin(monkeypatch):
    monkeypatch.setattr("core.registry.PLUGIN_REGISTRY", {"a": ...})
    refresh_workers()
    assert "a" in TASK_REGISTRY

    monkeypatch.setattr("core.registry.PLUGIN_REGISTRY", {"a": ..., "b": ...})
    refresh_workers()
    assert "b" in TASK_REGISTRY
```

**PR-4 acceptance:** parallel test < sequential threshold; `refresh_workers` re-register; không còn `MAX_TOOL_CALLS_PER_DELEGATION`.

---

### PR-5 Replace custom parsers bằng LangChain utilities

#### 5.1 `_content_to_text` → `BaseMessage.text()`

`base_app.py`:

```python
def _extract_reply(self, messages: list[BaseMessage]) -> str:
    for message in reversed(messages):
        if isinstance(message, AIMessage):
            text = message.text().strip()   # langchain-core >= 0.3
            if text:
                return text
    if messages:
        return messages[-1].text().strip()
    return ""
```

Xóa function `_content_to_text` (L32-48).

#### 5.2 `extract_question` dùng `message.text()`

`helpers.py`:

```python
def extract_question(messages: list[BaseMessage]) -> str:
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return msg.text().strip()
    return ""
```

#### 5.3 `MessageParser` thu nhỏ

Sau PR-1, FE chỉ gửi turn mới. MessageParser không cần xử lý assistant/tool messages nữa (history nằm ở checkpointer). Đơn giản còn:

```python
async def _parse_new_turn(raw: list[dict]) -> list[BaseMessage]:
    from core.utils.sanitizer import sanitize_user_content_async
    out: list[BaseMessage] = []
    for msg in raw:
        if msg.get("role") != "user":
            logger.warning("ignoring non-user message in new turn", extra={"role": msg.get("role")})
            continue
        content = msg.get("content", "")
        text = content if isinstance(content, str) else _content_to_text_from_parts(content)
        sanitized, _ = await sanitize_user_content_async(text)
        out.append(HumanMessage(content=sanitized, id=msg.get("id")))
    return out
```

~50 dòng thay vì ~130.

**PR-5 acceptance:** grep `_content_to_text` trả về 0 match; test snapshot cho AIMessage text extraction pass với multimodal (text + image_url) content.

---

### PR-6 Observability, config, limits

#### 6.1 LangSmith tracing config

`core/config.py`:

```python
langsmith_api_key: str | None = None
langsmith_project: str = "superin-prod"
langsmith_tracing_enabled: bool = False
```

`core/main.py` lifespan:

```python
if settings.langsmith_tracing_enabled and settings.langsmith_api_key:
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key
    os.environ["LANGSMITH_PROJECT"] = settings.langsmith_project
```

#### 6.2 Config validation

Dùng `pydantic.BaseModel` cho `configurable`:

```python
class AgentConfigurable(BaseModel):
    thread_id: str
    user_id: str
    user_tz: str = "UTC"
    installed_app_ids: list[str]

    @field_validator("thread_id")
    @classmethod
    def thread_must_be_user_scoped(cls, v, info):
        if not v.startswith(f"user:{info.data.get('user_id', '')}"):
            raise ValueError("thread_id must be user-scoped")
        return v
```

`RootAgent.astream` validate config trước khi gọi graph.

#### 6.3 Tool timeout per-tool, not per-delegation

Hiện tại timeout cả child graph 1 lần. Với tools I/O nặng, nên có per-tool timeout qua `RunnableConfig` hoặc decorator. Nếu chưa cấp thiết, note để làm sau.

#### 6.4 Metrics

Bổ sung `prometheus_client` counters (nếu dự án đã dùng):

- `agent_turn_total{status}`
- `agent_worker_duration_seconds{app_id, status}`
- `agent_routing_decision_total{app_id}` (1 count/app mỗi turn nó được chọn)
- `agent_recursion_limit_exceeded_total{app_id}`

**PR-6 acceptance:** LangSmith traces thấy được từ dashboard khi flag bật; configurable được validate strict; metrics expose qua `/metrics`.

---

### PR-7 Cleanup & docs

- Xóa `backend/shared/agent_context.py` (sau khi PR-2 migrate xong).
- Xóa file đã bị git mark là deleted nhưng còn tham chiếu: `graph_cache.py`, `prompts.py`, `root_tools.py`, `streaming_handler.py`, `tool_scoping.py`, `tools.py` (đã xóa trong diff, verify không còn import).
- Cập nhật CLAUDE.md section "Chat/Agent":
  - Thêm rule: "Mọi tool phải khai báo `config: RunnableConfig` và đọc `user_id`, `user_tz` từ `config['configurable']`."
  - Thêm rule: "Không LLM call ngoài `@entrypoint`/`@task`."
  - Thêm rule: "Short-term state thuộc về checkpointer; `ConversationMessage` chỉ phục vụ REST/list, không phải input cho graph."
- Update `backend/core/agents/root/__init__.py` module docstring reflect đúng architecture.

---

## 3. Testing strategy

| Layer | Test |
|---|---|
| Unit — helpers | `decide_target_apps` happy/error, catalog builder, `extract_question` multimodal |
| Unit — base_app | `GraphRecursionError`, timeout, dynamic prompt injects tz, config propagation |
| Unit — workers | `refresh_workers` clear+reregister, `_run_app_delegate` error shape |
| Unit — agent.py | `_resolve_thread` enforces user-scope, `_parse_new_turn` sanitizes, no ContextVar side-effects |
| Integration — graph | `@entrypoint` + `AsyncMongoDBSaver` (in-memory via mongomock): turn 1 lưu, turn 2 thấy `previous` |
| Integration — fan-out | 3 worker tasks sleep 200ms, elapsed < 500ms |
| Integration — tools | tool gọi từ graph nhận đúng `user_id` qua config |
| Contract | `RoutingDecision` schema, `RootState` shape, `AgentConfigurable` validator |
| Lint | `ruff check backend`, `mypy backend/core/agents` (nếu mypy được bật) |

Thêm 1 fixture `async_mongo_saver` dùng `mongomock-motor` hoặc testcontainers MongoDB để integration test.

---

## 4. Rollout & rollback

### Rollout

1. Merge PR-0 → verify bug fix trong staging (1 ngày).
2. Merge PR-1 sau feature flag `USE_CHECKPOINTER_HISTORY=false`. Bật flag cho 10% traffic → 50% → 100%. Mỗi bước quan sát `agent_turn_total{status="failed"}`.
3. PR-2 tương tự: flag `USE_CONFIG_CONTEXT=true` với fallback ContextVar nếu config thiếu, log deprecation.
4. PR-3 → PR-6 rollout thường.
5. PR-7 sau khi PR-1/PR-2 ở 100% 2 tuần.

### Rollback

- Mỗi PR có flag tương ứng. Rollback = flip flag, không cần revert commit.
- `AsyncMongoDBSaver` ghi vào collection riêng (`agent_checkpoints`); rollback = ngưng dùng (data tồn tại không ảnh hưởng).
- PR-2 rollback: bật lại path ContextVar (còn trong transition release).

---

## 5. Checklist trước khi ship từng PR

- [ ] `npm run codegen` nếu đụng schema.
- [ ] `ruff check backend --fix` pass.
- [ ] `pytest backend/tests` pass (bao gồm test mới).
- [ ] `npm run superin -- db check-indexes` pass (PR-1 có thêm collection).
- [ ] `npm run validate:manifests` pass.
- [ ] `cd frontend && npm run build` pass (PR-1 đổi API contract).
- [ ] LangSmith trace verify thủ công 1 turn (PR-3 trở đi).
- [ ] Không còn `except: pass`, `.catch(() => {})`, `except Exception: return {}` không log.
- [ ] Không còn import `shared.agent_context` sau PR-7.
- [ ] CLAUDE.md cập nhật với rule mới (PR-7).
- [ ] Commit message theo Conventional Commits: `refactor(core): ...`, `feat(core): ...`.

---

## 6. Tham chiếu

- LangGraph Functional API: `@entrypoint`, `@task`, `previous`, `StreamWriter` — `langgraph.func`.
- Checkpointer Mongo: `langgraph.checkpoint.mongodb.aio.AsyncMongoDBSaver` (đã cài via `langgraph-checkpoint-mongodb==0.1.2`).
- Store Mongo: `langgraph.store.mongodb.MongoDBStore`.
- Prebuilt ReAct: `langgraph.prebuilt.create_react_agent` — hỗ trợ `prompt` function nhận `(state, config)`.
- RunnableConfig propagation: LangChain tự forward `config` từ runnable cha xuống con nếu signature tool có `config: RunnableConfig`.
- `GraphRecursionError`: `langgraph.errors.GraphRecursionError`.
- `BaseMessage.text()`: `langchain-core >= 0.3`.

---

## 7. Anti-regression notes (thêm vào CLAUDE.md sau PR-7)

- **Tool context**: Tool phải nhận `config: RunnableConfig` và đọc `user_id`, `user_tz` từ `config["configurable"]`. Cấm gọi `get_user_context()` hoặc đọc ContextVar module-level.
- **Graph state**: Short-term history nằm ở `@entrypoint` `previous` qua `AsyncMongoDBSaver`. `ConversationMessage` chỉ phục vụ REST list; không được rebuild messages từ collection rồi pass vào graph.
- **LLM call**: Mọi LLM call (routing, synthesize, tool-internal) phải chạy trong `@entrypoint` hoặc `@task` để được trace/replay. Cấm `llm.ainvoke`/`astream` trực tiếp trong async function ngoài graph.
- **Child thread_id**: Child agent thread_id phải dẫn xuất từ parent thread_id dưới dạng `f"{parent}:{app_id}"` qua `child_config["configurable"]["thread_id"]`, không set ContextVar.
- **Exception handling**: Phân biệt `TimeoutError`, `GraphRecursionError`, `(AttributeError, TypeError, ValueError)` — không catch-all `Exception` ở layer dưới graph.
- **Parallel fan-out**: Dùng `asyncio.gather(*futures, return_exceptions=True)` cho fan-out `@task`. Không iterate `await` tuần tự — dễ gây hiểu nhầm và khó đo parallelism.
- **Refresh contract**: `refresh_workers()` và `refresh_graph()` phải clear toàn bộ cache (TASK_REGISTRY, graph singleton) rồi rebuild từ `PLUGIN_REGISTRY` hiện tại.
