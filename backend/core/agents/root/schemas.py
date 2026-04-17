"""Input/output types for the parallel root graph (@entrypoint API)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TypedDict

from langchain_core.messages import BaseMessage
from pydantic import BaseModel


class RoutingDecision(BaseModel):
    """Structured output for the routing LLM — which apps to delegate to."""

    app_ids: list[str]
    """App IDs to query. Empty list if no app is relevant."""


class ParallelGraphInput(TypedDict):
    """Input passed to the @entrypoint root_agent."""

    messages: list[BaseMessage]
    """LangChain messages from the canonical thread history."""
    user_id: str
    """ID of the user making the request."""
    thread_id: str
    """ID of the chat thread."""
    installed_app_ids: list[str]
    """List of app IDs installed for this user (pre-resolved by RootAgent)."""


@dataclass(frozen=True)
class ParallelGraphOutput:
    """Output returned by the @entrypoint root_agent."""

    app_results: list[dict]
    """Results from each successfully completed app worker."""
    app_errors: list[dict]
    """Results from each app worker that failed."""
    merged_context: str
    """Formatted merged output from all app results."""
    final_answer: str
    """Synthesized final answer from the LLM."""
