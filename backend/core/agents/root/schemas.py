"""Typed schemas for the root orchestration graph."""

from __future__ import annotations

from typing import Annotated, Literal

from langchain_core.messages import BaseMessage
from langgraph.graph import add_messages
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

DelegationStatus = Literal["success", "no_action", "failed", "partial", "awaiting_confirmation"]
ThinkingStatus = Literal["active", "done"]
SupervisorAction = Literal["finish", "follow_up", "ask_user"]


class ToolError(TypedDict, total=False):
    message: str
    code: str
    retryable: bool


class ToolResult(TypedDict, total=False):
    tool_name: str
    tool_call_id: str | None
    ok: bool
    data: object | None
    error: ToolError | str | None
    is_mutating: bool


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
    contained_mutation: bool


class WorkerOutcome(WorkerOutcomeBase, total=False):
    retryable: bool
    failure_kind: str


class WorkerDispatch(TypedDict, total=False):
    app_id: str
    subtask: str
    round_index: int
    attempt_index: int
    fingerprint: str


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
    subtask: str = Field(
        description=(
            "A focused, domain-specific task phrased as a standalone question "
            "or instruction for the target app."
        )
    )


class RoutingDecision(BaseModel):
    """Structured output for the routing LLM."""

    app_decisions: list[AppDecision] = Field(
        default_factory=list,
        description="List of per-app decisions. Empty list if no app is relevant.",
    )


class SupervisorFollowup(BaseModel):
    app_id: str
    subtask: str
    missing_question: str = ""
    expected_new_evidence: str = ""


class SupervisorDecision(BaseModel):
    action: SupervisorAction
    rationale: str = ""
    stop_reason: str
    followups: list[SupervisorFollowup] = Field(default_factory=list)
    user_question: str = ""
    missing_information: list[str] = Field(default_factory=list)


def reduce_worker_outcomes(
    left: list[WorkerOutcome],
    right: list[WorkerOutcome],
) -> list[WorkerOutcome]:
    """Append worker outcomes across branches and rounds."""
    return left + right


class RootGraphState(TypedDict, total=False):
    """Internal state for the root StateGraph run."""

    messages: Annotated[list[BaseMessage], add_messages]
    new_messages: list[BaseMessage]
    dispatches: list[WorkerDispatch]
    dispatch: WorkerDispatch
    worker_outcomes: Annotated[list[WorkerOutcome], reduce_worker_outcomes]
    current_round_outcomes: list[WorkerOutcome]
    merged_context: str
    dispatch_round: int
    turn_worker_start_index: int
    round_start_worker_index: int
    dispatch_history: list[WorkerDispatch]
    supervisor_decision: SupervisorDecision
    stop_reason: str
    started_at_monotonic: float
    done_emitted: bool


class RootState(TypedDict, total=False):
    """State persisted per thread_id via MongoDBSaver checkpointer."""

    messages: list[BaseMessage]


class NewTurnInput(TypedDict):
    """Input for a single new turn."""

    new_messages: list[BaseMessage]
