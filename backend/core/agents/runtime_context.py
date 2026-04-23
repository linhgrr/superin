"""Typed runtime context passed into child agents and tools."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AppAgentContext:
    """Immutable run-scoped context for a delegated child-agent execution."""

    user_id: str
    thread_id: str
    user_tz: str
