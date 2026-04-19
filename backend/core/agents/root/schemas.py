"""Input/output types for the parallel root graph (@entrypoint API)."""

from __future__ import annotations

from typing import Literal, TypedDict

from langchain_core.messages import BaseMessage
from pydantic import BaseModel, Field


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
    urgency: str | None = Field(
        default=None,
        description="Optional urgency hint for the child agent (e.g. 'high', 'low').",
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

    @property
    def app_ids(self) -> list[str]:
        """Backward-compat accessor — prefer app_decisions directly."""
        return [d.app_id for d in self.app_decisions]


class PlatformDecision(BaseModel):
    """Classifier output for whether the root should use platform tools."""

    route: Literal["none", "platform"] = "none"
    reason: str | None = Field(
        default=None,
        description="Short explanation for why this platform route was selected.",
    )


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
