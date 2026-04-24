# Agent Supervisor Loop + Child Checkpoint Recovery Plan (2026-04-24)

## Status

Draft implementation plan.

This document is the source of truth for implementing a production-grade root
supervisor loop and child-agent partial recovery path.

It supersedes older plan notes that assume `RunnableConfig`-first tool context or
transcript parsing as the primary worker result contract. The accepted target
architecture remains `StateGraph + Send`, `create_agent`, `context_schema`, and
`ToolRuntime`.

> **Read order:** sections 1–18 are the original draft. Section 19
> ("Production-Grade Addenda — 2026-04-24 review") contains 20 mandatory
> additions discovered during review. Where an addendum modifies an earlier
> section, the addendum wins. PR ordering in section 18 is superseded by
> Addendum A20.

## Problem

The desired product behavior is:

1. The root agent receives a user turn.
2. The root agent dispatches work to one or more specialist child agents.
3. Child agents run domain tools and return structured results.
4. Once child agents return, the root agent decides whether to:
   - ask a targeted follow-up round,
   - ask the user for missing input,
   - or finish and synthesize the final answer.
5. The root agent must not drift into unbounded retries or keep looping just
   because the answer is imperfect.

The current implementation has the right architectural foundation, but the
recovery and loop-control boundaries need to be explicit.

Current risk:

- If a child graph hits `GraphRecursionError`, `BaseAppAgent.delegate()` catches
  the exception and returns a failed worker outcome with empty `tool_results`.
- Because child agents intentionally do not have a checkpointer today, the root
  cannot inspect partial child state after the child graph terminates.
- Recent simplification removed root follow-up planning entirely, which prevents
  runaway loops but also removes useful targeted second-round behavior.
- A naive follow-up planner can become the opposite failure mode: the root keeps
  asking workers for "just one more lookup" without a hard stop.

## External Best-Practice Baseline

The implementation should align with:

- LangGraph `StateGraph` + `Send` for orchestrator-worker fan-out.
- LangGraph checkpointers for durable short-term state.
- LangGraph runtime `context_schema` for immutable per-run context.
- LangChain `create_agent` for specialist child agents.
- LangChain `ToolRuntime` for tool access to `context`, `state`, `store`, and
  stream writer.
- LangChain middleware `awrap_tool_call` for tool result shaping and centralized
  error policy.

Relevant official docs:

- LangGraph recursion limit:
  https://docs.langchain.com/oss/python/langgraph/errors/GRAPH_RECURSION_LIMIT
- LangGraph graph API:
  https://docs.langchain.com/oss/python/langgraph/graph-api
- LangChain runtime context:
  https://docs.langchain.com/oss/python/langchain/runtime
- LangChain `create_agent` reference:
  https://reference.langchain.com/python/langchain/agents/factory/create_agent

Important implication from LangGraph docs:

- Reactive handling means the graph has already terminated.
- Proactive handling uses step budget / remaining steps inside the graph and
  routes to a graceful completion node before the hard recursion limit fires.
- Checkpoint recovery is still useful as a safety net, but it should not be the
  primary loop-control mechanism.

## Non-Goals

- Do not replace LangGraph orchestration with ad hoc `asyncio.gather` at the root.
- Do not move domain business logic into prompts.
- Do not make child agents long-lived conversational agents unless there is a
  specific product requirement.
- Do not expose child-agent internal tool traces directly to the frontend.
- Do not rely on parsing transcript messages to recover structured tool results.
- Do not let the root supervisor loop run until model "confidence" feels high.

## Target Architecture

```text
chat route
  -> RootAgent.astream(user_id, new_turn, thread_id)
    -> root StateGraph, checkpointer scoped by thread_id
      -> load_turn_context
      -> plan_initial_dispatch
      -> dispatch_workers via Send("run_worker", ...)
      -> reduce_worker_outcomes
      -> supervisor_decide
           action=finish
             -> synthesize_final
           action=ask_user
             -> synthesize_clarifying_question
           action=follow_up
             -> validate_followups
             -> dispatch_workers via Send("run_worker", ...)
             -> reduce_worker_outcomes
             -> supervisor_decide
      -> persist final AI message
```

Child worker shape:

```text
BaseAppAgent.delegate(subtask, user_id, thread_id, parent_config)
  -> child create_agent graph
    -> dynamic prompt receives AppAgentContext
    -> tools receive ToolRuntime[AppAgentContext]
    -> StructuredToolResultMiddleware writes tool_results into child state
    -> response_format returns AppAgentResponse
  -> delegate returns WorkerOutcome
```

Child recovery shape:

```text
child graph near step budget
  -> proactive partial finalization
  -> returns structured AppAgentResponse(status=partial)

child graph still hits GraphRecursionError
  -> delegate catches exception
  -> delegate reads child checkpoint snapshot
  -> delegate builds WorkerOutcome(status=partial if evidence exists else failed)
```

## Core Design Principles

### 1. The Root Loop Is Bounded By Deterministic Policy

The LLM may recommend follow-ups, but deterministic code decides whether a
follow-up is allowed.

Hard limits:

- max root rounds per user turn
- max attempts per app per user turn
- max total worker calls per user turn
- max wall-clock time per user turn
- max repeated failure count
- fingerprint dedupe for `(app_id, normalized_subtask)`

The root should never loop only because the model says "more investigation may
help." The follow-up must identify a specific missing question and a specific
worker/tool surface likely to answer it.

### 2. Evidence Must Be Monotonic

Each worker round must add new useful evidence. If the current round produces no
new useful evidence, the next supervisor decision must be `finish` or `ask_user`.

Useful evidence means at least one of:

- a successful tool result not seen before,
- a partial but materially different domain summary,
- a clear non-retryable limitation,
- a clear user-actionable error,
- a clear missing input that only the user can provide.

Not useful evidence:

- same tool call with same args,
- same worker message restated,
- generic "could not complete" without tool results,
- repeating a capability limit already observed.

### 3. Child Agents Should Fail Soft Before They Fail Hard

`GraphRecursionError` should be rare. Child agents should proactively stop when
they are near their per-run step or tool-call budget and return the best partial
answer they have.

Checkpoint recovery exists for unexpected failures, not normal control flow.

### 4. Partial Is A First-Class Status

`partial` is not an error string. It is a valid worker outcome.

A partial outcome should include:

- what was successfully learned,
- what was not learned,
- whether another targeted round is likely to help,
- the exact follow-up hint if a retry is useful,
- a machine-readable stop reason.

### 5. Root Supervisor Decisions Must Be Auditable

Every root supervisor decision should include a structured reason and should be
logged without dumping private content.

For production debugging, it must be possible to answer:

- why did root dispatch this worker?
- why did root do another round?
- why did root stop?
- what cap prevented another round?
- which worker outcome caused final synthesis?

## Data Model Changes

### AppAgentResponse

Current minimal shape:

```python
class AppAgentResponse(BaseModel):
    message: str
```

Target shape:

```python
class AppAgentResponse(BaseModel):
    message: str = Field(
        min_length=1,
        description="Concise user-facing summary of what happened.",
    )
    answer_state: Literal[
        "answered",
        "partial",
        "needs_user_input",
        "blocked",
        "no_action",
    ] = Field(
        description=(
            "Whether this child run fully answered its delegated subtask, "
            "partially answered it, needs user input, is blocked by a non-retryable "
            "capability/permission issue, or needed no action."
        )
    )
    evidence_summary: str = Field(
        default="",
        description=(
            "Short factual summary of the evidence gathered. Include only facts "
            "derived from tool results or explicit user input."
        ),
    )
    missing_information: list[str] = Field(
        default_factory=list,
        description="Specific missing facts required for a complete answer.",
    )
    followup_useful: bool = Field(
        default=False,
        description=(
            "True only if another targeted run against this same app is likely "
            "to produce materially new evidence for the current user request."
        ),
    )
    followup_hint: str = Field(
        default="",
        description=(
            "A narrower follow-up instruction for this same app. Required when "
            "followup_useful is true. Must be more specific than the current subtask."
        ),
    )
    capability_limit: str = Field(
        default="",
        description=(
            "Short snake_case label for a non-retryable limitation, e.g. "
            "`no_history_support`, `permission_denied`, `missing_integration`."
        ),
    )
    stop_reason: Literal[
        "complete",
        "tool_budget",
        "recursion_budget",
        "timeout",
        "missing_user_input",
        "capability_limit",
        "no_relevant_action",
        "internal_error",
    ] = "complete"
```

Rules:

- `followup_useful=true` requires non-empty `followup_hint`.
- `capability_limit` and `followup_useful=true` should not both be set unless the
  limitation is explicitly retryable by narrowing scope.
- `answer_state="needs_user_input"` should set `missing_information`.
- `answer_state="blocked"` should set `capability_limit`.
- `answer_state="partial"` should set `evidence_summary`.

### WorkerOutcome

Target shape:

```python
class WorkerOutcomeBase(TypedDict):
    app: str
    status: DelegationStatus
    ok: bool
    message: str
    subtask: str
    tool_results: list[ToolResult]
    error: str
    answer_state: str
    evidence_summary: str
    missing_information: list[str]
    followup_useful: bool
    followup_hint: str
    capability_limit: str
    stop_reason: str


class WorkerOutcome(WorkerOutcomeBase, total=False):
    retryable: bool
    failure_kind: str
    round_index: int
    dispatch_fingerprint: str
    evidence_fingerprint: str
```

Mapping from `AppAgentResponse`:

| AppAgentResponse.answer_state | WorkerOutcome.status |
| --- | --- |
| `answered` | `success` |
| `partial` | `partial` |
| `needs_user_input` | `awaiting_confirmation` or `partial` |
| `blocked` | `failed` with `retryable=false` |
| `no_action` | `no_action` |

Use `awaiting_confirmation` only when the next step truly requires user consent
or user-provided missing data. Use `partial` when the root can still synthesize a
useful answer from evidence.

### SupervisorDecision

```python
SupervisorAction = Literal["finish", "follow_up", "ask_user"]


class SupervisorFollowup(BaseModel):
    app_id: str
    subtask: str
    missing_question: str
    expected_new_evidence: str


class SupervisorDecision(BaseModel):
    action: SupervisorAction
    rationale: str = Field(
        description="Short internal explanation for logs; not shown directly."
    )
    stop_reason: Literal[
        "sufficient_evidence",
        "needs_user_input",
        "no_new_evidence",
        "max_rounds",
        "max_attempts",
        "max_workers",
        "time_budget",
        "non_retryable_limit",
        "invalid_followup",
    ]
    followups: list[SupervisorFollowup] = Field(default_factory=list)
    user_question: str = Field(
        default="",
        description=(
            "Question to ask the user when action is `ask_user`. Empty otherwise."
        ),
    )
```

Rules:

- `action="follow_up"` requires at least one valid follow-up.
- Each follow-up must include both `missing_question` and
  `expected_new_evidence`.
- `action="ask_user"` requires `user_question`.
- `action="finish"` ignores followups.
- The root validates and may downgrade any decision to `finish`.

### RootGraphState

Target additions:

```python
class RootGraphState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    new_messages: list[BaseMessage]
    dispatches: list[WorkerDispatch]
    dispatch: WorkerDispatch
    worker_outcomes: Annotated[list[WorkerOutcome], reduce_worker_outcomes]
    current_round_outcomes: Annotated[list[WorkerOutcome], reduce_worker_outcomes]
    merged_context: str
    dispatch_round: int
    supervisor_decision: SupervisorDecision
    stop_reason: str
    started_at_monotonic: float
    dispatch_history: list[WorkerDispatch]
```

Reducer rule:

- `worker_outcomes` appends across all rounds.
- `current_round_outcomes` resets at the start of each round.
- `dispatch_history` appends every accepted dispatch for dedupe/audit.

## Root Supervisor Loop

### Constants

Start conservative:

```python
ROOT_MAX_DISPATCH_ROUNDS = 2
ROOT_MAX_DISPATCH_ROUNDS_WORKSPACE_SUMMARY = 3
ROOT_MAX_APP_ATTEMPTS_PER_TURN = 2
ROOT_MAX_TOTAL_WORKERS_PER_TURN = 8
ROOT_MAX_TURN_WALL_SECONDS = 90.0
ROOT_FOLLOWUP_MIN_NEW_EVIDENCE = 1
```

Make these settings configurable:

```python
root_agent_max_dispatch_rounds: int = 2
root_agent_max_workspace_summary_rounds: int = 3
root_agent_max_app_attempts_per_turn: int = 2
root_agent_max_total_workers_per_turn: int = 8
root_agent_max_turn_wall_seconds: float = 90.0
```

### Dispatch Fingerprint

```python
def normalize_subtask(value: str) -> str:
    return " ".join(value.lower().split())


def dispatch_fingerprint(app_id: str, subtask: str) -> str:
    return f"{app_id}::{normalize_subtask(subtask)}"
```

Reject a follow-up if:

- fingerprint has already been dispatched,
- same app exceeded attempt cap,
- global worker cap is reached,
- turn wall-clock cap is reached,
- app has non-retryable capability limit,
- previous round produced no useful evidence,
- follow-up subtask is not narrower than prior subtask.

### Useful Evidence Detection

```python
def evidence_fingerprint(outcome: WorkerOutcome) -> str:
    if outcome["tool_results"]:
        tool_parts = []
        for result in outcome["tool_results"]:
            tool_parts.append(
                f"{result.get('tool_name')}:{result.get('ok')}:{summarize_shape(result.get('data'))}"
            )
        return "|".join(tool_parts)
    return f"{outcome.get('answer_state')}:{outcome.get('stop_reason')}:{outcome.get('message', '')[:120]}"
```

Round has useful new evidence if any current outcome has an evidence fingerprint
not seen in prior outcomes.

Avoid hashing full private payloads. Use stable shape summaries or non-sensitive
IDs.

### Supervisor Node Flow

```python
async def _supervisor_decide(state, runtime):
    all_outcomes = state.get("worker_outcomes", [])
    current_round = state.get("current_round_outcomes", [])
    round_index = state.get("dispatch_round", 1)

    deterministic_stop = _deterministic_stop_reason(state, runtime)
    if deterministic_stop:
        return {
            "supervisor_decision": SupervisorDecision(
                action="finish",
                stop_reason=deterministic_stop,
                rationale=f"Stopped by deterministic guardrail: {deterministic_stop}",
            ),
            "dispatches": [],
        }

    if _requires_user_input(all_outcomes):
        return {
            "supervisor_decision": SupervisorDecision(
                action="ask_user",
                stop_reason="needs_user_input",
                user_question=_build_user_question(all_outcomes),
            ),
            "dispatches": [],
        }

    if not _round_has_useful_new_evidence(current_round, all_outcomes):
        return {
            "supervisor_decision": SupervisorDecision(
                action="finish",
                stop_reason="no_new_evidence",
                rationale="Latest round did not add materially new evidence.",
            ),
            "dispatches": [],
        }

    decision = await plan_followups_with_llm(...)
    validated = _validate_supervisor_decision(decision, state, runtime)
    return _decision_to_state_update(validated)
```

### Conditional Edges

```python
builder.add_edge("merge_results", "supervisor_decide")
builder.add_conditional_edges(
    "supervisor_decide",
    _route_after_supervisor,
    {
        "follow_up": "run_worker",
        "finish": "synthesize_final",
        "ask_user": "synthesize_user_question",
    },
)
```

If `follow_up`, the conditional function should return `Send(...)` objects, not a
single node name.

## Child Agent Partial Recovery

### Primary Path: Proactive Partial Finalization

The best production behavior is to prevent hard recursion failure.

Options:

1. Use `RemainingSteps` if compatible with the installed LangGraph/LangChain
   version and `create_agent` state.
2. Add a middleware-managed `tool_call_count` and cap.
3. Add a child graph config metadata check using `langgraph_step` if available.

Recommended first implementation:

- Add middleware that counts tool calls in `AppAgentState`.
- When count reaches `CHILD_TOOL_CALL_SOFT_LIMIT`, inject a system/developer
  instruction before the next model call:
  "Stop using tools. Produce the best structured partial response now."
- When count reaches `CHILD_TOOL_CALL_HARD_LIMIT`, block further tool calls and
  return a structured tool error that tells the model to finalize.

Example state fields:

```python
class AppAgentState(AgentState[AppAgentResponse]):
    tool_results: NotRequired[Annotated[list[ToolResult], reduce_tool_results]]
    tool_call_count: NotRequired[int]
    tool_budget_exhausted: NotRequired[bool]
```

This avoids relying on a graph-level `GraphRecursionError`.

### Safety Net: Child Checkpointer

Add an optional child checkpointer for recovery only.

Important isolation rule:

```text
child_thread_id =
  child:{user_id}:{parent_thread_id}:{turn_id}:{round_index}:{app_id}:{attempt_index}
```

Do not use only `{thread_id}:{app_id}` for child checkpointing if child agents
become persistent. That can mix separate turns and make recovery ambiguous.

Recommended config:

```python
child_config = {
    "configurable": {
        **parent_configurable,
        "thread_id": child_thread_id,
        "user_id": user_id,
        "user_tz": user_tz,
        "parent_thread_id": parent_thread_id,
        "app_id": self.app_id,
        "round_index": round_index,
        "attempt_index": attempt_index,
    },
    "recursion_limit": AGENT_RECURSION_LIMIT,
}
```

Compile child graph with checkpointer:

```python
self._graph = create_agent(
    model=get_llm(),
    tools=self.tools(),
    middleware=[
        self._make_dynamic_prompt_middleware(),
        ChildBudgetMiddleware(...),
        StructuredToolResultMiddleware(),
    ],
    response_format=AppAgentResponse,
    state_schema=AppAgentState,
    context_schema=AppAgentContext,
    store=get_store(),
    checkpointer=get_child_checkpointer(),
    name=f"{self.app_id}_agent",
)
```

Question: reuse root checkpointer or separate child checkpointer?

Recommended: reuse the same physical checkpointer collections initially, but
use child-prefixed thread ids and add TTL cleanup later. If operational load
becomes high, split child checkpoint collections.

### Recovery On GraphRecursionError

```python
except GraphRecursionError:
    snapshot = await self.graph.aget_state(child_config)
    values = snapshot.values if isinstance(snapshot.values, dict) else {}
    tool_results = values.get("tool_results", [])
    messages = values.get("messages", [])

    if tool_results:
        return self._partial_result_from_snapshot(
            subtask=subtask,
            tool_results=tool_results,
            messages=messages,
            failure_kind="recursion_limit",
            retryable=True,
        )

    return self._failed_result(
        subtask,
        "The assistant ran out of steps before gathering useful evidence.",
        retryable=True,
        failure_kind="recursion_limit",
    )
```

Do not expose raw exception text to the user.

Partial recovery message should be factual:

```text
I gathered some information but ran out of steps before completing the full
request. Here is what I found so far: ...
```

If no summary can be generated from state without another LLM call, return a
minimal message and let root synthesis use `tool_results`.

### Cleanup

Child checkpoints can grow quickly. Add cleanup policy:

- TTL index if supported by the checkpointer package.
- Otherwise scheduled cleanup by thread id prefix and created_at.
- Keep child checkpoints shorter than root checkpoints.

Suggested retention:

- root thread checkpoints: product retention policy
- child checkpoints: 24-72 hours

## Root Decision Policy

### Finish Immediately When

- all dispatched workers returned `success` or `no_action`,
- at least one worker produced enough evidence to answer,
- current round added no new useful evidence,
- max rounds reached,
- global worker cap reached,
- wall-clock cap reached,
- all remaining issues are non-retryable capability limits,
- user input is required.

### Follow Up Only When

All conditions must be true:

1. round index is below max round cap,
2. total worker cap has not been reached,
3. app attempt cap has not been reached,
4. previous round produced useful new evidence or a retryable partial,
5. at least one outcome has `followup_useful=true` or retryable failure,
6. follow-up is narrower than prior dispatch,
7. follow-up fingerprint has not been used,
8. follow-up names a specific missing question,
9. follow-up names expected new evidence,
10. no non-retryable capability limit blocks that app.

### Ask User When

- worker asks for missing required fields,
- confirmation is required before mutation,
- ambiguity could cause destructive or wrong action,
- no tool can resolve missing information,
- continuing would be speculative.

### Finish With Partial Answer When

- useful evidence exists,
- additional rounds are blocked by caps,
- additional rounds are unlikely to produce new evidence,
- child hit recursion/timeout but recovered partial tool results,
- app lacks history/audit capability and can only report current state.

## Prompt Contracts

### Child Prompt Additions

Add to child dynamic prompt:

```text
<partial_response_rules>
- If you have gathered useful evidence but cannot complete the whole subtask,
  return a partial structured response instead of repeating tool calls.
- If available tools cannot answer a history/diff/audit question, state the
  capability limit and summarize the closest current-state evidence only.
- Set followup_useful=true only when another narrower task against this same app
  is likely to produce materially new evidence.
- Set followup_hint to one specific narrower instruction when followup_useful is true.
- Do not set followup_useful just because the answer is uncertain.
- If the next step requires user-provided data or confirmation, set
  answer_state=needs_user_input and list missing_information.
</partial_response_rules>
```

### Supervisor Prompt

The supervisor prompt should be narrow and policy-heavy:

```text
You are the Superin root supervisor.
You do not answer the user.
You decide whether the root has enough worker evidence to finish, should ask
the user for missing information, or should run one more targeted worker round.

You must prefer finish over follow_up unless there is a specific missing
question and a specific worker likely to answer it.

Never request a follow-up that repeats a prior app/subtask.
Never request a follow-up for an app blocked by a non-retryable capability limit.
Never request a follow-up merely to improve confidence.
```

The prompt input should include:

- original user request,
- recent conversation context,
- installed app ids,
- dispatch round,
- remaining caps,
- prior dispatch fingerprints,
- worker outcomes with structured fields,
- current round evidence summary,
- blocked apps and reasons.

Do not include raw private tool payloads if a compact summary is enough.

## Implementation PR Plan

### PR 1: Restore Minimal Supervisor Loop

Files:

- `backend/core/agents/root/schemas.py`
- `backend/core/agents/root/routing.py`
- `backend/core/agents/root/graph.py`
- `backend/core/agents/root/prompts.py`
- `backend/core/config.py`
- `backend/tests/core/test_root_agent_tool_scoping.py`

Tasks:

- Add `SupervisorDecision` and `SupervisorFollowup`.
- Add `current_round_outcomes`, `dispatch_round`, `dispatch_history`.
- Reintroduce `plan_followups`, but make it supervisor-only.
- Add deterministic validation around every LLM supervisor decision.
- Add max rounds / attempts / total workers / duplicate fingerprint caps.
- Route `merge_results -> supervisor_decide -> follow_up|finish|ask_user`.
- Ensure no follow-up occurs when no useful evidence was added.

Acceptance:

- one successful round finishes,
- retryable partial can trigger one narrower follow-up,
- duplicate follow-up is dropped,
- non-retryable capability limit blocks follow-up,
- max rounds forces finish,
- no useful evidence forces finish,
- missing user input routes to ask-user path.

### PR 2: Expand Child Structured Response Contract

Files:

- `backend/core/agents/app_state.py`
- `backend/core/agents/base_app.py`
- child prompts/tests

Tasks:

- Expand `AppAgentResponse`.
- Map response fields into `WorkerOutcome`.
- Update child prompt response rules.
- Preserve current `message` behavior for backwards compatibility.
- Add validation helpers:
  - `followup_useful` requires `followup_hint`,
  - `needs_user_input` requires missing info,
  - blocked requires `capability_limit`.

Acceptance:

- child success returns `answer_state=answered`.
- child partial returns `status=partial`.
- child missing user input returns structured missing fields.
- invalid child structured response is converted to controlled failure.

### PR 3: Child Tool Budget Middleware

Files:

- `backend/core/agents/tool_middleware.py`
- `backend/core/agents/app_state.py`
- `backend/core/agents/base_app.py`
- tests for child budget behavior

Tasks:

- Add tool call count state updates.
- Add soft and hard child tool-call caps.
- On soft cap, inject finalization instruction before model call.
- On hard cap, block further tool call and force final response.
- Log budget events.

Acceptance:

- repeated tool calls stop before recursion.
- child returns `partial` with gathered tool results.
- no raw recursion exception reaches user-facing message.

### PR 4: Child Checkpoint Recovery

Files:

- `backend/core/db.py`
- `backend/core/agents/base_app.py`
- `backend/core/agents/runtime_context.py`
- index/cleanup tooling if needed
- tests with in-memory checkpointer

Tasks:

- Add `get_child_checkpointer()` or reuse `get_checkpointer()` with child thread id prefix.
- Compile child agent with checkpointer.
- Build child thread ids with user/thread/turn/round/app/attempt isolation.
- On `GraphRecursionError`, call `aget_state(child_config)`.
- Build partial outcome from checkpoint state when `tool_results` exist.
- Add cleanup policy doc/tooling.

Acceptance:

- simulated recursion after tool result returns `status=partial`.
- recovered outcome includes prior `tool_results`.
- child checkpoints are namespaced by user/thread/app/round/attempt.
- no cross-user thread id collision is possible.

### PR 5: Root Synthesis Hardening

Files:

- `backend/core/agents/root/synthesis.py`
- `backend/core/agents/root/merged_response.py`
- tests

Tasks:

- Never append raw `[Synthesis error: ...]` to user answer.
- Convert synthesis errors into friendly fallback.
- Ensure partial worker results are clearly but briefly surfaced.
- Ensure capability limits are not hidden when they block the requested outcome.

Acceptance:

- LLM synthesis failure returns safe fallback.
- partial worker evidence is included in final answer.
- blocked/capability errors are visible only when user-actionable.

### PR 6: Runtime Context Cleanup

Files:

- `backend/shared/tool_results.py`
- `backend/shared/tool_time.py`
- time-aware tool call sites
- tests

Tasks:

- Prefer `runtime.context.user_tz` for timezone formatting/normalization.
- Avoid repeated `User.get(user_id)` in generic tool postprocessing where runtime
  context already has timezone.
- Keep service-level user lookups only where domain rules require full user model.

Acceptance:

- tool result localization uses runtime timezone.
- time-aware tools do not need redundant user lookup for timezone only.
- tests cover user_tz propagation from root -> child -> tool.

## Test Matrix

### Unit Tests

Root supervisor:

- initial dispatch returns one worker and then finish.
- initial dispatch returns multiple workers and then finish.
- partial child with `followup_useful=true` triggers follow-up.
- partial child without `followup_useful` finishes.
- retryable timeout can trigger follow-up only once.
- recursion partial can trigger follow-up only if evidence exists.
- duplicate app/subtask follow-up is dropped.
- app attempt cap prevents third attempt.
- max round cap prevents extra round.
- global worker cap prevents extra dispatches.
- no useful new evidence prevents follow-up.
- capability limit blocks follow-up.
- missing user input routes to ask-user.

Child agent:

- structured response maps to success outcome.
- structured partial maps to partial outcome.
- missing structured response maps to controlled internal failure.
- `GraphRecursionError` with checkpointed tool_results maps to partial.
- `GraphRecursionError` without evidence maps to failed retryable outcome.
- timeout returns failed retryable outcome.
- tool budget middleware forces partial finalization.

Tool middleware:

- successful tool appends `tool_results`.
- tool user error appends failed tool result.
- unexpected tool exception appends internal-error tool result.
- tool count increments.
- hard cap blocks additional tool calls.

Chat route:

- final snapshot includes user and assistant messages.
- duplicate latest user id does not create duplicate AI messages.
- SSE sends `messages/partial`, `thinking`, `updates`, `[DONE]`.
- stream cancellation does not persist a fake final answer.

### Integration Tests

Use fake LLMs and fake tools:

- root dispatches finance + todo, both succeed, final answer combines both.
- todo hits recursion after one tool result, root synthesizes partial.
- finance partial requests narrower follow-up, root dispatches one follow-up then finishes.
- follow-up planner tries duplicate subtask, deterministic validator forces finish.
- follow-up planner tries uninstalled app, deterministic validator drops it.
- workspace summary uses up to configured workspace round cap.

### Observability Tests

Assert logs/events contain:

- `dispatch_round`
- `app_id`
- `dispatch_fingerprint`
- `supervisor_action`
- `stop_reason`
- `followup_dropped_reason`
- `worker_status`
- `failure_kind`

Avoid logging:

- raw tool payloads,
- private message content beyond short sanitized previews,
- API keys/secrets.

## Rollout Strategy

### Phase 1: Shadow Supervisor

Run the new supervisor decision after merge, but do not follow it yet.

Log:

- current production action,
- proposed supervisor action,
- proposed followups,
- would-be stop reason.

Purpose:

- detect over-follow-up risk,
- tune prompts and caps,
- collect examples before enabling loops.

### Phase 2: Enable One Follow-Up Round

Enable:

- max rounds = 2,
- max attempts per app = 2,
- max total workers = 6.

Disable:

- workspace summary extra round initially.

### Phase 3: Enable Workspace Summary Extra Round

Enable max rounds = 3 only when:

- user asks workspace-wide summary/recap/digest,
- at least two apps are relevant,
- prior round produced useful evidence,
- no cap is hit.

### Phase 4: Child Checkpoint Recovery

Enable child checkpointer behind a setting:

```python
child_agent_checkpoint_enabled: bool = False
```

Turn on in staging first. Measure checkpoint collection growth.

## Production Invariants

These must hold after implementation:

- Root conversation history is persisted by the root checkpointer.
- Child checkpoints are scoped and short-lived.
- Child tools read identity/timezone from `ToolRuntime.context`.
- Tool results are written to child state incrementally.
- Root worker outcomes are explicit structured state, not transcript parsing.
- Root follow-up decisions are validated by deterministic guardrails.
- The root never dispatches the same app/subtask fingerprint twice in one user turn.
- The root never exceeds configured max rounds.
- The root can synthesize from partial evidence.
- Raw internal exception text is not shown to users.

## Anti-Patterns To Avoid

- "Just increase recursion_limit" as the primary fix.
- Using child checkpointer as a reason to allow unbounded child loops.
- Letting supervisor LLM override max rounds or duplicate caps.
- Asking all apps again on every follow-up.
- Re-dispatching the raw user question instead of a narrower subtask.
- Treating `partial` as failed with no evidence.
- Hiding capability limits when they are the reason the request cannot be fully answered.
- Persisting child checkpoints forever.
- Using only `{thread_id}:{app_id}` for child checkpoint ids.
- Parsing `AIMessage.content` to recover tool results.

## Suggested Order Of Work

> Superseded by Addendum **A20**. Do not follow this list verbatim — start
> with PR5 (synthesis hardening) because the current `[Synthesis error: ...]`
> leak is a live regression. See A20 for the corrected dependency order.

1. Restore minimal bounded supervisor loop.
2. Expand child response contract.
3. Add child budget middleware.
4. Add child checkpoint recovery.
5. Harden synthesis fallback.
6. Clean up redundant runtime-context DB lookups.
7. Update architecture docs to match `useLangGraphRuntime`, not `useDataStreamRuntime`.

Do not start with child checkpointing alone. It improves recovery after failure
but does not solve the root problem of bounded reasoning.

## Open Questions

1. Should `ask_user` be represented as `awaiting_confirmation` or a separate
   root event type?
2. Should mutation tools require a confirmation layer before execution?
3. Should child checkpoints share root checkpoint collections or use separate
   collections with more aggressive TTL?
4. What retention window is acceptable for child checkpoints?
5. Should workspace summary get a separate planner prompt from normal follow-up?

## Definition Of Done

- Root can do one targeted follow-up round and then stop.
- Root cannot exceed configured caps under adversarial supervisor output.
- Child recursion after partial tool success produces a partial worker outcome.
- Child recursion before any useful evidence produces controlled failure.
- Final answer uses partial evidence when available.
- Tests cover success, partial, retryable failure, non-retryable limit, missing
  user input, duplicate follow-up, and max-round stop.
- Frontend receives the same public stream contract as before.
- Docs no longer describe `RunnableConfig`-first tools or data-stream runtime as
  the current target.
- **All Addendum A1–A20 acceptance criteria pass.**

## Production-Grade Addenda (2026-04-24 review)

This addendum captures the production-readiness gaps identified during plan
review. Each item references the section it modifies or extends, has a
priority (**P0** must-fix before merge, **P1** must-fix before promotion to
staging, **P2** can ship in a follow-up), and a concrete acceptance criterion.

Where an addendum modifies an earlier section, **the addendum wins**.

### A1. Reconcile turn / worker / child timeouts (P0)

Modifies: `Root Supervisor Loop > Constants`, `backend/core/agents/root/graph.py:36`.

Current state:
- `_TURN_TIMEOUT_SECONDS = 120.0` is per-worker hard timeout (module-level constant).
- `child_agent_timeout_seconds = 60.0` is per-delegate timeout (already a setting).
- Plan adds `ROOT_MAX_TURN_WALL_SECONDS = 90.0` for whole-turn budget.

A single worker can already exceed the proposed turn budget, making multi-round
impossible.

Required changes:
- Move `_TURN_TIMEOUT_SECONDS` into `Settings.root_agent_per_worker_timeout_seconds`.
- Enforce the invariant: `per_worker_timeout * max_dispatch_rounds <= max_turn_wall_seconds * 1.2` (small slack for synthesis).
- Add `runtime.context.deadline_monotonic` and pass remaining budget into each worker call:
  `effective_timeout = min(per_worker_timeout, deadline - time.monotonic())`.
- Settings validator (`pydantic.model_validator`) must fail at startup when the invariant is violated.

Acceptance:
- Startup validation rejects misconfigured timeout combinations.
- Worker dispatched near the deadline cancels with `failure_kind=time_budget` rather than running past the wall.
- Test: a 3-round configuration where one slow worker would exhaust the turn forces a deterministic `finish` with `stop_reason=time_budget`.

### A2. Multi-round stream contract (P0)

Modifies: `backend/core/agents/root/graph.py:_emit_thinking`, FE adapter docs.

Current state:
- `_emit_thinking(f"worker:{app_id}", ...)` collides between rounds when the same `app_id` is dispatched twice. FE collapses both into one indicator.

Required changes:
- Step ids must include round and attempt: `worker:{app_id}:r{round}:a{attempt}`.
- Add stable step ids for new nodes:
  - `supervisor:r{round}` for `_supervisor_decide`.
  - `ask_user` for the clarifying-question node.
  - `synthesis` already exists — keep the id.
- Add invariant test: every `step_id` is unique within a single turn.

Acceptance:
- Recorded SSE stream from a 2-round turn shows two distinct `worker:finance:*` step ids.
- FE thread runtime renders both rounds without collapse.

### A3. Exactly-one `done` event invariant (P0)

Modifies: `synthesize_direct`, `synthesize_final`, new `synthesize_clarifying_question`.

Current state:
- Both `_synthesize_direct` and `_synthesize_final` emit `{type: "done"}`. Adding a third terminal path multiplies the regression surface.

Required changes:
- Centralize emission in a single helper `_emit_done(answer, runtime)` called exactly once at every terminal node.
- Add a graph-level guard: `RootGraphState["done_emitted"]: bool`. Subsequent emit attempts log error and skip.
- Test: enumerate every terminal path (direct, final, ask_user, synthesis-error fallback, cancellation) and assert exactly one `done` per turn.

Acceptance:
- Unit test asserts a single `done` event for each terminal path.

### A4. Public stream contract for `ask_user` (P0)

Modifies: `Target Architecture`, `frontend/src/api/chat.ts` follow-up.

Current state:
- Plan adds `action="ask_user"` but never specifies what the FE actually receives.

Required spec:
- The clarifying question is streamed through the existing `text` token channel — assistant-ui renders it as a normal assistant message. **No new public event type.**
- Telemetry side-channel: emit a `thinking` event with `step_id="ask_user"`, `status="done"`, `label="Waiting for your answer"`. This is observability, not user-visible content.
- Persist on `ThreadMeta`:
  ```python
  pending_question: dict | None = {
      "round": int,
      "app_ids_in_scope": list[str],
      "missing_information": list[str],
      "asked_at_utc": datetime,
  }
  ```
  so the next user turn can be routed back to a continuation supervisor decision (see A14).

Acceptance:
- FE renders ask-user response identically to a normal assistant turn.
- A user message after an ask-user turn is detected as "resume" via `ThreadMeta.pending_question`.

### A5. Mutating tools must hard-block follow-up (P0)

Modifies: `Root Decision Policy > Follow Up Only When`, `apps/*/manifest.py`, `platform_agent`.

Current state:
- Platform agent runs install/uninstall (mutating). With supervisor loop, a transient partial could be retried automatically — risking double install / double uninstall / double transaction.

Required changes:
- Add `is_mutating: bool` to `BaseTool`-wrapping decorators (or per-tool registry).
- Add `WorkerOutcome.contained_mutation: bool` set by middleware when any executed tool had `is_mutating=True`.
- Supervisor MUST treat `contained_mutation=True` outcomes as non-retryable for follow-up, even if the LLM set `followup_useful=true`.
- Optional but recommended: `confirmation_required` flag on mutating tools that turns supervisor into `ask_user` BEFORE execution.

Acceptance:
- Test: a partial mutation outcome cannot trigger a same-app follow-up.
- Test: platform install/uninstall across two attempts is rejected by both the dispatch fingerprint guard AND the mutation guard.

### A6. Child budget middleware ordering and contract (P0)

Modifies: `Child Agent Partial Recovery > Primary Path`.

Spec the ordering explicitly:

```python
middleware = [
    self._make_dynamic_prompt_middleware(),
    ChildBudgetMiddleware(soft_limit=..., hard_limit=...),  # OUTER (counts every attempted call)
    StructuredToolResultMiddleware(),                        # INNER (rewrites results)
]
```

Reasoning:
- `ChildBudgetMiddleware` wraps `awrap_tool_call` so its count increments BEFORE inner middleware can rewrite the message into a structured tool error.
- On hard cap, the middleware MUST emit a structured tool error with `code="tool_budget_exhausted"`, `retryable=false`. **No silent swallow** (CLAUDE.md rule #6).
- Soft-cap finalization instruction is injected via a `wrap_model_call` hook (not the tool-call hook), so it runs before the next model invocation.

Acceptance:
- Test: middleware order is asserted in `BaseAppAgent.graph`.
- Test: hard cap returns `tool_budget_exhausted` to the agent loop, not silent skip.

### A7. Separate reducers for cumulative vs per-round outcomes (P0)

Modifies: `Data Model Changes > RootGraphState`, `core/agents/root/schemas.py`.

The current `reduce_worker_outcomes` resets when right side is empty. This semantic cannot serve both `worker_outcomes` (cumulative) and `current_round_outcomes` (per-round reset) simultaneously.

Required:

```python
def reduce_worker_outcomes_cumulative(left, right):
    return list(left) + list(right)


_ROUND_RESET_SENTINEL: list[WorkerOutcome] = []


def reduce_current_round_outcomes(left, right):
    if right is _ROUND_RESET_SENTINEL:
        return []
    return list(left) + list(right)
```

Or simpler: a `prepare_round` node explicitly writes `current_round_outcomes=[]` before each new dispatch, with a reducer that only appends.

Document the chosen approach. Add a unit test running two rounds and asserting `worker_outcomes` accumulates while `current_round_outcomes` resets.

Acceptance:
- Two-round graph run preserves `worker_outcomes[0..N+M]` and `current_round_outcomes==round2 only`.

### A8. Root recursion budget for multi-round (P0)

Modifies: `core/agents/root/agent.py:_compute_root_recursion_limit`.

Current single-round formula:
```python
return max(25, installed_app_count + 16)
```

For multi-round, restore a formula keyed off `max_dispatch_rounds`:

```python
def _compute_root_recursion_limit(installed_app_count: int) -> int:
    per_round_steps = max(1, installed_app_count) + 4   # plan + N workers + merge + supervisor
    return max(25, 8 + settings.root_agent_max_dispatch_rounds * per_round_steps)
```

Acceptance:
- Test: with `max_rounds=3` and `installed=10`, computed limit covers the worst-case node count of the graph.

### A9. Child recursion limit must also be configurable (P0)

Modifies: `core/constants.py:28`, `core/agents/base_app.py:228`.

`AGENT_RECURSION_LIMIT = 25` is hard-coded today. Once `ChildBudgetMiddleware` exists, this becomes the safety net AND must be tunable per environment.

Required:
- Move to `Settings.child_agent_recursion_limit: int = 25`.
- Soft cap MUST be strictly less than hard cap MUST be strictly less than recursion limit.
- Settings validator: `child_agent_tool_call_soft_limit < child_agent_tool_call_hard_limit < child_agent_recursion_limit`.

Acceptance:
- Startup rejects misconfigured caps.
- Default behavior unchanged.

### A10. Forward-compat for child checkpoint format (P1)

Modifies: `Child Agent Partial Recovery > Cleanup`.

Old code never wrote child checkpoints, so no migration is needed for first rollout. But:
- PR4 must include a one-time cleanup script that drops legacy keys matching the old `{thread_id}:{app_id}` pattern, in case any environment shipped it.
- Add a startup health check: count of child checkpoints with the old format. If >0 in production, alert.
- `aget_state(child_config)` on a missing snapshot must return an empty `values` dict (no crash) — verify with the in-memory checkpointer test.

Acceptance:
- Empty snapshot produces a `failed retryable` outcome with `failure_kind=recursion_limit` and no evidence — never an exception.

### A11. Cross-user isolation test for child checkpoints (P1)

Modifies: `Child Agent Partial Recovery > Safety Net`, test matrix.

The `child:{user_id}:{parent_thread_id}:{turn_id}:{round_index}:{app_id}:{attempt_index}` format is correct. Add explicit adversarial tests:
- Two users with identical `parent_thread_id` (legal because FE owns it). Run delegate concurrently. Assert recovered snapshots are isolated.
- Same user, two parallel rounds in the same turn. Assert each round/attempt has its own snapshot.
- Inject `parent_thread_id` containing `:` characters; assert id parser cannot ambiguously split.

Acceptance:
- Adversarial test: same `parent_thread_id` across users does not leak state under any race.

### A12. AppAgentResponse expansion needs validators + invalid fallback (P1)

Modifies: `Data Model Changes > AppAgentResponse`, `BaseAppAgent._require_structured_response`.

Required:
- Add Pydantic `model_validator(mode="after")` enforcing:
  - `followup_useful=True` → `followup_hint != ""`.
  - `answer_state="needs_user_input"` → `missing_information not empty`.
  - `answer_state="blocked"` → `capability_limit != ""`.
  - `answer_state="partial"` → `evidence_summary != ""`.
- `BaseAppAgent` MUST catch `pydantic.ValidationError` (or a missing structured response) and convert to a `failed` outcome with `failure_kind="invalid_structured_response"`, `retryable=false` — not raise.
- Smaller / cheaper LLMs frequently fail enriched structured-output schemas. Track an `invalid_structured_response_rate` metric per model.

Acceptance:
- Test: child returns malformed structured response → outcome is `failed` with the right `failure_kind`, no exception bubbles to root.

### A13. Token cap per turn (P1)

Modifies: `Root Supervisor Loop > Constants`, `Settings`.

Add:
```python
root_agent_max_total_tokens_per_turn: int = 60_000
```

Sum `usage_metadata.total_tokens` across every LLM call (router, workers, supervisor, synthesis). When the cap is hit:
- Stop dispatching new follow-ups.
- Force `synthesize_final` with the evidence already collected.
- Log `stop_reason=token_budget`.

Acceptance:
- Test: a fake LLM that reports 30k tokens per call forces `finish` after 2 calls when cap=60k.

### A14. Resume semantics after `ask_user` (P1)

Modifies: `Target Architecture`, `core/chat/service.py`, `ThreadMeta` model.

Required:
- After `ask_user`, persist `ThreadMeta.pending_question` (see A4 schema).
- Next user turn: if `pending_question` is set, the supervisor receives it as additional context in `_supervisor_decide` so the next dispatch is a continuation, not a cold restart.
- Clear `pending_question` once the supervisor decides `finish` or asks another `ask_user` round.
- TTL: drop pending_question after `pending_question_ttl_minutes` (configurable, default 30) to avoid stale resumes.

Acceptance:
- Test: ask-user turn → user replies → supervisor sees both the original outcomes and the new answer.
- Test: stale pending_question is dropped and treated as a normal turn.

### A15. Trace / observability metadata (P1)

Modifies: every worker dispatch, supervisor call, synthesis call.

Inject `metadata` into every `RunnableConfig` so LangSmith / loguru can correlate:

```python
config = {
    "configurable": {...},
    "metadata": {
        "turn_id": turn_id,
        "dispatch_round": round_index,
        "attempt_index": attempt_index,
        "app_id": app_id,
        "user_id_hash": hash_user_id(user_id),  # never log raw user_id
    },
    "run_name": f"worker:{app_id}:r{round_index}",
}
```

Acceptance:
- Trace search by `turn_id` returns all related runs in order.
- No raw user_id appears in metadata.

### A16. Phase 1 (shadow) KPI thresholds (P1)

Modifies: `Rollout Strategy > Phase 1`.

Define explicit promotion gates. Do not promote to Phase 2 until ALL pass for 7 consecutive days:

| Metric | Threshold to promote |
|---|---|
| Supervisor proposes `follow_up` rate | between 5% and 35% of turns |
| Follow-ups dropped by deterministic guardrail | < 50% of proposals |
| Follow-ups dropped by `no_new_evidence` | < 25% of proposals |
| Phase-1 simulated p95 turn latency increase | < 30% over baseline |
| Phase-1 simulated p95 token usage increase | < 50% over baseline |
| Child structured-response invalid rate | < 2% |

If any threshold is violated, do not promote. Iterate prompt and caps first.

Acceptance:
- Dashboard published with all six metrics during shadow phase.

### A17. Move `_TURN_TIMEOUT_SECONDS` to settings (P2)

Modifies: `core/agents/root/graph.py:36`, `Settings`.

Trivial cleanup. Already covered by A1 but listed separately for change tracking.

Acceptance:
- No module-level timeout constants remain in `core/agents/root/`.

### A18. Update H1 DESIGN NOTE in `base_app.py` (P2)

Modifies: `core/agents/base_app.py:42-53`.

The current docblock asserts:
- "Child agents intentionally have NO checkpointer."
- "Stateless per-delegation."
- "Singleton shared across all users."

After PR4, none of these is true. Rewrite to describe the new contract: per
`(user, parent_thread, turn, round, attempt)` checkpoint scope, no cross-user
shared state, child graph compiled once per process but checkpoint scoped per
delegation.

Acceptance:
- Docblock matches the new architecture.
- A grep for the old wording returns zero hits.

### A19. Reconcile `safe_tool_call` policy with central middleware (P2)

Modifies: `CLAUDE.md > Chat/Agent rule #4`.

`StructuredToolResultMiddleware.awrap_tool_call` already converts every tool exception into a structured result. The CLAUDE.md rule "Mọi app tool phải dùng `safe_tool_call()`" predates this middleware.

Required:
- Decide explicitly: keep both (defense in depth) OR drop `safe_tool_call` and rely on middleware.
- Update CLAUDE.md to reflect the chosen single source of truth.
- If keeping both: document `safe_tool_call` as an opt-in wrapper for explicit error-message customization, not a generic safety net.

Acceptance:
- CLAUDE.md and code agree. No tool path bypasses both.

### A20. Corrected PR ordering (P0)

Modifies: `Suggested Order Of Work`, `Implementation PR Plan`.

The original order starts with the supervisor loop, but the live regression
today is the `[Synthesis error: ...]` leak. Ship that first as a tiny
independent patch:

1. **PR5 — Synthesis hardening** (ship within 1 day of plan acceptance).
   Standalone; no schema or graph changes. Removes the live user-visible regression.
2. **PR2 — Child structured response contract.** Required before supervisor can read partial signals. Includes A12 validators.
3. **PR3 — Child budget middleware.** Primary path for recovery; checkpoint is only safety net.
4. **PR1 — Supervisor loop.** Now safe to consume the new signals. Includes A1, A2, A3, A5, A7, A8, A13.
5. **PR4 — Child checkpoint recovery.** Behind feature flag (`child_agent_checkpoint_enabled`), staging first. Includes A10, A11, A18.
6. **PR6 — Runtime context cleanup.** Independent; tracked separately.

A14 (ask-user resume) and A19 (safe_tool_call reconciliation) span multiple
PRs and can be folded into PR1 (resume) and the CLAUDE.md update phase
respectively.

Acceptance:
- PR5 merged and released within 1 day of plan acceptance.
- Subsequent PRs follow the new dependency order.
- No PR depends on a later PR's work.
