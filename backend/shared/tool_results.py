"""Helpers for returning tool results without aborting the agent run."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

T = TypeVar("T")

logger = logging.getLogger(__name__)


def tool_success(data: T) -> dict[str, Any]:
    return {
        "ok": True,
        "data": data,
    }


def tool_error(
    message: str,
    *,
    code: str = "domain_error",
    retryable: bool = False,
) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {
            "message": message,
            "code": code,
            "retryable": retryable,
        },
    }


async def safe_tool_call(
    operation: Callable[[], Awaitable[T]],
    *,
    action: str,
) -> dict[str, Any]:
    try:
        return tool_success(await operation())
    except ValueError as exc:
        return tool_error(str(exc), code="invalid_request", retryable=False)
    except Exception:
        logger.exception("Tool action failed: %s", action)
        return tool_error(
            f"Unexpected error while {action}.",
            code="internal_error",
            retryable=True,
        )
