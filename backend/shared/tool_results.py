"""Helpers for returning tool results without aborting the agent run.

Provides:
- Structured success/error responses
- Safe execution wrapper with automatic sanitization
- Database content sanitization before returning to LLM
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from core.utils.sanitizer import sanitize_db_content_for_llm

T = TypeVar("T")

logger = logging.getLogger(__name__)


def tool_success(data: T) -> dict[str, Any]:
    """Return a successful tool result.

    Automatically sanitizes database content to prevent malicious content
    from reaching the LLM (LLM05: Output Handling security).
    """
    # Sanitize data before returning to LLM
    sanitized_data = sanitize_db_content_for_llm(data)

    return {
        "ok": True,
        "data": sanitized_data,
    }


def tool_error(
    message: str,
    *,
    code: str = "domain_error",
    retryable: bool = False,
) -> dict[str, Any]:
    """Return a failed tool result."""
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
    """Execute a tool operation safely, catching exceptions and sanitizing output.

    This wrapper ensures:
    1. Errors don't crash the agent (converted to tool_error)
    2. Database content is sanitized before reaching LLM (XSS prevention)
    3. Operations are logged for debugging

    Example:
        return await safe_tool_call(
            lambda: finance_service.transfer(user_id, from_id, to_id, amount),
            action="transferring funds"
        )
    """
    try:
        result = await operation()
        # tool_success automatically sanitizes the data
        return tool_success(result)
    except ValueError as exc:
        # Domain errors (e.g., invalid input) - not retryable
        return tool_error(str(exc), code="invalid_request", retryable=False)
    except Exception:
        # Unexpected errors - log and return retryable error
        logger.exception("Tool action failed: %s", action)
        return tool_error(
            f"Unexpected error while {action}.",
            code="internal_error",
            retryable=True,
        )
