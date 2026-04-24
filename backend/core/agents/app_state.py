"""Shared state schema for tool-using child agents."""

from __future__ import annotations

from typing import Annotated, Literal, NotRequired

from langchain.agents.middleware.types import AgentState
from pydantic import BaseModel, Field, model_validator

from core.agents.root.schemas import ToolResult


def reduce_tool_results(
    left: list[ToolResult],
    right: list[ToolResult],
) -> list[ToolResult]:
    """Append per-tool updates emitted during an agent run."""
    return left + right


class AppAgentResponse(BaseModel):
    """Explicit final reply contract for child agents."""

    message: str = Field(
        min_length=1,
        description=(
            "Concise user-facing summary of what happened in this child-agent run. "
            "Must be non-empty and ready for the root agent to synthesize."
        ),
    )
    answer_state: Literal[
        "answered",
        "partial",
        "needs_user_input",
        "blocked",
        "no_action",
    ] = Field(
        default="answered",
        description=(
            "Whether this child run fully answered, partially answered, needs "
            "user input, is blocked by a non-retryable limitation, or needed no action."
        ),
    )
    evidence_summary: str = Field(
        default="",
        description="Short factual summary grounded in tool results or user input.",
    )
    missing_information: list[str] = Field(
        default_factory=list,
        description="Specific missing facts required to complete the request.",
    )
    followup_useful: bool = Field(
        default=False,
        description="Whether another narrower run against this same app could help.",
    )
    followup_hint: str = Field(
        default="",
        description="Specific narrower follow-up instruction for this app.",
    )
    capability_limit: str = Field(
        default="",
        description="Short snake_case label for a non-retryable limitation.",
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
    ] = Field(
        default="complete",
        description="Machine-readable stop reason for this child run.",
    )

    @model_validator(mode="after")
    def validate_contract(self) -> AppAgentResponse:
        if self.followup_useful and not self.followup_hint.strip():
            raise ValueError("followup_hint is required when followup_useful is true")
        if self.answer_state == "needs_user_input" and not self.missing_information:
            raise ValueError(
                "missing_information is required when answer_state is needs_user_input"
            )
        if self.answer_state == "blocked" and not self.capability_limit.strip():
            raise ValueError("capability_limit is required when answer_state is blocked")
        if self.answer_state == "partial" and not self.evidence_summary.strip():
            raise ValueError("evidence_summary is required when answer_state is partial")
        return self


class AppAgentState(AgentState[AppAgentResponse]):
    """Agent state with explicit structured tool results."""

    tool_results: NotRequired[Annotated[list[ToolResult], reduce_tool_results]]
    tool_call_count: NotRequired[int]
    tool_budget_soft_exhausted: NotRequired[bool]
    tool_budget_exhausted: NotRequired[bool]
    contained_mutation: NotRequired[bool]
