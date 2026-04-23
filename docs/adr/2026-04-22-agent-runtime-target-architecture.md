# ADR 2026-04-22: Agent Runtime Target Architecture

## Status

Accepted; key runtime pieces are now implemented

## Context

After comparing the local codebase with the current LangChain/LangGraph direction, the current backend agent architecture is serviceable but not the long-term shape to keep.

The repo already has several correct foundations:

- repository / service / mapper / route layering is sound
- routing and synthesis are separated in the root agent
- short-term memory uses a checkpointer and long-term memory uses a store
- specialist per-app agents are still the right model for this product

The current codebase is also already partway through the migration:

- child app agents in [backend/core/agents/base_app.py](/home/linh/Downloads/superin/backend/core/agents/base_app.py:1) already use `create_agent`
- child agents already have a typed `context_schema` via [backend/core/agents/runtime_context.py](/home/linh/Downloads/superin/backend/core/agents/runtime_context.py:1)
- root platform tools in [backend/core/agents/root/platform_tools.py](/home/linh/Downloads/superin/backend/core/agents/root/platform_tools.py:1) already use `ToolRuntime[AppAgentContext]`

Several target pieces are now in place:

- the root orchestrator in [backend/core/agents/root/graph.py](/home/linh/Downloads/superin/backend/core/agents/root/graph.py:1) now uses `StateGraph + Send`
- tool execution policy is centralized through middleware in [backend/core/agents/tool_middleware.py](/home/linh/Downloads/superin/backend/core/agents/tool_middleware.py:1)
- app tools now use `ToolRuntime` rather than per-tool `RunnableConfig` plumbing

The main runtime target pieces are now in place:

- structured `tool_results` are carried explicitly in child-agent state via [backend/core/agents/app_state.py](/home/linh/Downloads/superin/backend/core/agents/app_state.py:1)
- child agents also return an explicit typed final reply through `response_format`, and [backend/core/agents/base_app.py](/home/linh/Downloads/superin/backend/core/agents/base_app.py:1) now reads that structured response instead of inferring reply text from transcript messages

That means the system runs, but it is still carrying transition-era patterns that are more brittle than they need to be.

## Decision

The target architecture for this repo is:

- `StateGraph + Send` for the root orchestrator-worker graph
- `create_agent` for specialist child agents
- `ToolRuntime + context_schema` for tool context injection
- middleware `wrap_tool_call` or `ToolNode` policy for centralized tool execution rules
- keep the existing `service -> mapper -> schema` layering for domain logic

Stated directly: the repo should keep the new `StateGraph + Send` root and continue simplifying the remaining boundaries around worker outputs.

## What Is Already Correct

- Domain layering is good and should stay: repository, service, mapper, schema, route.
- Keeping specialist agents by app is the right tradeoff for the product.
- Routing and synthesis as distinct responsibilities is correct.
- Using checkpointer for thread state and store for long-term memory is correct.

## What Is Not Yet Best Practice

### Root Orchestration

The repo now uses `StateGraph + Send` for root orchestration. This is the right fit for an orchestrator-worker system with fan-out, reduction, retries, and richer state transitions.

Why:

- state transitions become explicit nodes instead of implicit control flow
- worker dispatch is represented as graph structure instead of ad hoc `asyncio.gather`
- reducers can aggregate worker outputs as first-class graph state
- observability and future changes are easier when orchestration is node-first

### Tool Context Injection

App tools now read execution context through `ToolRuntime[AppAgentContext]` instead of per-tool `RunnableConfig` plumbing.

This is the preferred boundary because:

- tools accept `ToolRuntime[AppContext]`
- `AppContext` carries typed execution context such as `user_id`, `thread_id`, and `user_tz`
- parent agents define `context_schema` once and pass context through the runtime

### Tool Execution Policy

The repo has moved away from helper-centric execution wrappers and now centralizes tool result shaping in middleware.

That remains the right direction for cross-cutting execution policy:

- error mapping
- retry policy
- tool execution wrapping
- response shaping rules
- logging and monitoring

Those concerns belong in middleware `wrap_tool_call` and/or `ToolNode` policy rather than being repeated at individual tool call sites.

### Worker Outcome Extraction

`BaseAppAgent` no longer parses `ToolMessage` transcript content to recover structured tool results, and it no longer uses the last AI message as the source of truth for the child-agent reply. Middleware writes `tool_results` directly into child-agent state, and the agent's final reply is enforced through a typed structured response contract.

The target direction is:

- worker graphs produce explicit typed results
- reducers combine those results in graph state
- transcript parsing becomes a compatibility layer at most, not the primary contract

## Target Shape

The root graph should be node-first and roughly follow this flow:

1. `load_context`
2. `plan_dispatch`
3. `assign_workers`
4. `run_worker`
5. `reduce_worker_results`
6. `synthesize_final`
7. `persist_and_return`

### Root Node Responsibilities

`load_context`
- Resolve `user_id`, `thread_id`, `user_tz`, installed apps, and store handles.

`plan_dispatch`
- Use the routing model to produce a `RoutingDecision`.

`assign_workers`
- Emit `Send(...)` calls for each worker job.

`run_worker`
- Invoke the appropriate specialist graph for a specific `app_id`.

`reduce_worker_results`
- Merge `WorkerOutcome` values via explicit reducers.

`synthesize_final`
- Produce the final answer from conversation history plus reduced worker results.

`persist_and_return`
- Persist any final graph state and return the response payload.

## Specialist Agent Contract

Each specialist app agent should:

- use `create_agent`
- expose a typed `context_schema`
- receive execution context through `ToolRuntime`
- keep prompts focused on domain reasoning, not low-level dependency injection details

This direction is already partially implemented for child agents and should be completed rather than rolled back.

## Tool Contract

Tool design should move toward:

- typed runtime context via `ToolRuntime[AppAgentContext]`
- clean business logic inside tools and services
- centralized error / retry / execution policy in middleware or tool-node configuration

Tool implementations should not have to repeatedly:

- extract `user_id` from config
- hand-roll structured error envelopes
- duplicate execution wrappers for localization or policy concerns

## Domain Layering Decision

The existing domain layering stays:

- services own orchestration and business rules
- mappers own model-to-schema conversion
- schemas own typed external/domain-facing structures

The agent migration is a runtime/orchestration migration, not a reason to collapse domain boundaries.

## Migration Plan

1. Finish moving all app tools from `RunnableConfig` plumbing to `ToolRuntime`.
2. Introduce centralized tool middleware for error/retry/execution policy.
3. Keep the explicit child-agent state boundary for tool results.
4. Keep the explicit structured child-agent reply contract.
5. Keep service / mapper / schema contracts stable while the runtime layer changes.

## Consequences

### Benefits

- cleaner dependency injection
- less tool boilerplate
- more explicit orchestration state
- better fit with current LangChain/LangGraph runtime patterns
- lower brittleness at the worker-result boundary

### Costs

- tests that directly invoke tools must be updated along with the runtime contract
- some compatibility helpers can be removed only after the runtime migration is complete

## Notes

- This ADR started as a target doc and now also records the migration direction that has already landed.
- When this ADR conflicts with older docs that still describe `RunnableConfig`-first tools or transcript-derived worker contracts as the intended end state, this ADR wins.
