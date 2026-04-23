"""Typed schemas for the root orchestration graph."""

from __future__ import annotations

from typing import Annotated, Literal, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph import add_messages
from pydantic import BaseModel, Field

DelegationStatus = Literal["success", "no_action", "failed", "partial", "awaiting_confirmation"]
ThinkingStatus = Literal["active", "done"]
SupervisorAction = Literal["redispatch", "synthesize"]


class ToolError(TypedDict, total=False):
    message: str
    code: str


class ToolResult(TypedDict):
    tool_name: str
    tool_call_id: str | None
    ok: bool
    data: object | None
    error: ToolError | str | None


class WorkerOutcomeBase(TypedDict):
    app: str
    status: DelegationStatus
    ok: bool
    message: str
    subtask: str
    tool_results: list[ToolResult]
    error: str


class WorkerOutcome(WorkerOutcomeBase, total=False):
    retryable: bool
    failure_kind: str
    followup_useful: bool
    followup_hint: str
    capability_limit: str


class WorkerDispatch(TypedDict):
    app_id: str
    subtask: str


class TokenEvent(TypedDict):
    type: Literal["token"]
    content: str


class ThinkingEvent(TypedDict):
    type: Literal["thinking"]
    step_id: str
    label: str
    status: ThinkingStatus


class DoneEvent(TypedDict):
    type: Literal["done"]
    content: str


RootGraphEvent = TokenEvent | ThinkingEvent | DoneEvent


class AppDecision(BaseModel):
    """One child-agent decision produced by the orchestrator LLM."""

    app_id: str
    """Which installed app to delegate to."""

    subtask: str = Field(
        description=(
            "A focused, domain-specific task phrased as a standalone question "
            "or instruction for the target app. This is NOT the raw user question — "
            "it is a reformulated subtask that gives the child agent the specific "
            "context it needs without requiring it to filter the original request. "
            "Example: 'Check my todo list for tasks due today or overdue' instead of "
            "'what did I ask about earlier?'"
        )
    )


class RoutingDecision(BaseModel):
    """Structured output for the routing LLM — which apps to delegate to and HOW.

    The orchestrator LLM decides which apps are needed AND crafts a
    domain-specific subtask for each one. Passing the same raw user question
    to every agent is the anti-pattern being fixed here.
    """

    app_decisions: list[AppDecision] = Field(
        default_factory=list,
        description="List of per-app decisions. Empty list if no app is relevant.",
    )


class FollowupDecision(BaseModel):
    """Structured decision for whether the root should run another worker round."""

    action: SupervisorAction = Field(
        description=(
            "Use `redispatch` only when another targeted worker round is likely "
            "to produce materially new evidence. Otherwise use `synthesize`."
        )
    )
    rationale: str = Field(
        default="",
        description="Short internal explanation for logs; not shown to the user.",
    )
    app_decisions: list[AppDecision] = Field(
        default_factory=list,
        description=(
            "Optional follow-up worker dispatches. Leave empty when action is `synthesize`."
        ),
    )


def reduce_worker_outcomes(
    left: list[WorkerOutcome],
    right: list[WorkerOutcome],
) -> list[WorkerOutcome]:
    """Reset on empty update, otherwise append parallel worker outcomes."""
    if not right:
        return []
    return left + right


class RootGraphState(TypedDict, total=False):
    """Internal state for the root StateGraph run."""

    messages: Annotated[list[BaseMessage], add_messages]
    new_messages: list[BaseMessage]
    dispatches: list[WorkerDispatch]
    dispatch: WorkerDispatch
    worker_outcomes: Annotated[list[WorkerOutcome], reduce_worker_outcomes]
    current_round_outcomes: Annotated[list[WorkerOutcome], reduce_worker_outcomes]
    merged_context: str
    dispatch_round: int


class RootState(TypedDict, total=False):
    """State persisted per thread_id via MongoDBSaver checkpointer.

    Only ``messages`` is needed; ``last_answer`` and ``last_app_results`` were
    dead fields — written but never read downstream.
    """

    messages: list[BaseMessage]
    """All conversation messages for this thread (Human + AI)."""


class NewTurnInput(TypedDict):
    """Input for a single new turn — just the new messages, history is in previous."""

    new_messages: list[BaseMessage]
    """HumanMessage(s) for this turn only. History comes from checkpointer via previous."""
