"""Typed runtime context for the root orchestration graph."""

from __future__ import annotations

from asyncio import Semaphore
from dataclasses import dataclass

ROOT_WORKER_PARALLELISM_LIMIT = 3


@dataclass(frozen=True, slots=True)
class RootGraphContext:
    """Immutable per-run context shared across root graph nodes."""

    user_id: str
    thread_id: str
    user_tz: str
    installed_app_ids: list[str]
    assistant_message_id: str | None
    worker_semaphore: Semaphore
