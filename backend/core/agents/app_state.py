"""Shared state schema for tool-using child agents."""

from __future__ import annotations

from typing import Annotated, NotRequired

from langchain.agents.middleware.types import AgentState
from pydantic import BaseModel, Field

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
    followup_useful: bool = Field(
        default=False,
        description=(
            "True only when another round against this same app is likely to yield "
            "materially new evidence for the current user request."
        ),
    )
    followup_hint: str = Field(
        default="",
        description=(
            "Optional narrower follow-up instruction for the root supervisor to consider "
            "if followup_useful is true. Leave empty otherwise."
        ),
    )
    capability_limit: str = Field(
        default="",
        description=(
            "Short snake_case label for a tool/capability limitation that blocks fuller "
            "answers, such as no_history_support. Leave empty when no such limitation exists."
        ),
    )


class AppAgentState(AgentState[AppAgentResponse]):
    """Agent state with explicit structured tool results."""

    tool_results: NotRequired[Annotated[list[ToolResult], reduce_tool_results]]
