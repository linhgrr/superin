"""Typed runtime context for the root orchestration graph."""

from __future__ import annotations

from asyncio import Semaphore
from dataclasses import dataclass
from datetime import datetime

from core.models import PendingQuestion

ROOT_WORKER_PARALLELISM_LIMIT = 3


@dataclass(frozen=True, slots=True)
class RootGraphContext:
    """Immutable per-run context shared across root graph nodes."""

    user_id: str
    thread_id: str
    user_tz: str
    installed_app_ids: list[str]
    assistant_message_id: str | None
    turn_id: str
    worker_semaphore: Semaphore
    deadline_monotonic: float
    turn_started_at_utc: datetime
    pending_question: PendingQuestion | None = None
