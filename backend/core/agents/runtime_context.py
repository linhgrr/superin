"""Typed runtime context passed into child agents and tools."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AppAgentContext:
    """Immutable run-scoped context for a delegated child-agent execution."""

    user_id: str
    thread_id: str
    user_tz: str
    parent_thread_id: str = ""
    app_id: str = ""
    turn_id: str = ""
    round_index: int = 0
    attempt_index: int = 0
