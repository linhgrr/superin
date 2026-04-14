"""Helpers for returning tool results without aborting the agent run.

Provides:
- Structured success/error responses
- Safe execution wrapper with automatic sanitization
- Database content sanitization before returning to LLM
"""

from __future__ import annotations

import asyncio
from loguru import logger
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from core.models import User
from core.utils.sanitizer import sanitize_db_content_for_llm
from core.utils.timezone import convert_utc_strings_to_local, get_user_timezone_context
from shared.agent_context import get_user_context

T = TypeVar("T")



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


async def _tool_success_async(data: T, localize: bool = True) -> dict[str, Any]:
    """Sanitize tool payloads off the event loop before returning to the LLM."""
    localized_data = data
    if localize:
        user_id = get_user_context()
        if user_id:
            try:
                user = await User.get(user_id)
            except Exception:
                user = None
            formatter = get_user_timezone_context(user).format_datetime
            localized_data = convert_utc_strings_to_local(data, formatter)

    sanitized_data = await asyncio.to_thread(sanitize_db_content_for_llm, localized_data)
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
    localize: bool = True,
) -> dict[str, Any]:
    """Execute a tool operation safely, catching exceptions and sanitizing output.

    This wrapper ensures:
    1. Errors don't crash the agent (converted to tool_error)
    2. Database content is sanitized before reaching LLM (XSS prevention)
    3. Operations are logged for debugging
    4. Datetimes are optionally localized for the user.

    Example:
        return await safe_tool_call(
            lambda: finance_service.transfer(user_id, from_id, to_id, amount),
            action="transferring funds"
        )
    """
    try:
        result = await operation()
        return await _tool_success_async(result, localize=localize)
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
