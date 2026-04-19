"""Helpers for returning tool results without aborting the agent run.

Provides:
- Structured success/error responses
- Safe execution wrapper with automatic sanitization
- Database content sanitization before returning to LLM
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from loguru import logger

from core.models import User
from core.utils.sanitizer import sanitize_db_content_for_llm
from core.utils.timezone import convert_utc_strings_to_local, get_user_timezone_context
from shared.agent_config import require_user_id
from shared.tool_errors import ToolUserError
from shared.tool_time import (
    TemporalFieldKind,
    ToolTimeContext,
    build_tool_time_context,
    normalize_temporal_payload,
)

T = TypeVar("T")


def tool_success(data: T) -> dict[str, Any]:
    """Return a successful tool result.

    Automatically sanitizes database content to prevent malicious content
    from reaching the LLM (LLM05: Output Handling security).
    """
    sanitized_data = sanitize_db_content_for_llm(data)

    return {
        "ok": True,
        "data": sanitized_data,
    }


async def _tool_success_async(
    data: T,
    *,
    localize: bool = True,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Sanitize tool payloads off the event loop before returning to the LLM.

    ``user_id`` is used to look up the user's timezone for datetime localization.
    When ``user_id`` is not provided (or the lookup fails), output is returned
    in UTC — callers should prefer passing ``user_id`` explicitly from
    ``RunnableConfig`` via ``shared.agent_config.get_user_id``.
    """
    localized_data = data
    if localize and user_id:
        try:
            user = await User.get(user_id)
        except (AttributeError, TypeError):
            user = None
        except Exception:
            logger.exception("User lookup failed during tool result localization")
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
    user_id: str | None = None,
) -> dict[str, Any]:
    """Execute a tool operation safely, catching exceptions and sanitizing output.

    This wrapper ensures:
    1. Errors don't crash the agent (converted to tool_error)
    2. Database content is sanitized before reaching LLM (XSS prevention)
    3. Operations are logged for debugging
    4. Datetimes are optionally localized for the user when ``user_id`` is given.

    Example::

        user_id = require_user_id(config)
        return await safe_tool_call(
            lambda: finance_service.transfer(user_id, from_id, to_id, amount),
            action="transferring funds",
            user_id=user_id,
        )
    """
    try:
        result = await operation()
        return await _tool_success_async(result, localize=localize, user_id=user_id)
    except ToolUserError as exc:
        return tool_error(str(exc), code=exc.code, retryable=exc.retryable)
    except ValueError as exc:
        # Legacy fallback for older code that has not been migrated to ToolUserError yet.
        return tool_error(str(exc), code="invalid_request", retryable=False)
    except PermissionError as exc:
        # Legacy fallback for older code that still raises bare PermissionError.
        return tool_error(str(exc), code="forbidden", retryable=False)
    except RuntimeError as exc:
        # Context/config errors (e.g. missing user_id in RunnableConfig).
        logger.warning("Tool action rejected: {} — {}", action, exc)
        return tool_error(str(exc), code="invalid_context", retryable=False)
    except Exception:
        logger.exception("Tool action failed: {}", action)
        return tool_error(
            f"Unexpected error while {action}.",
            code="internal_error",
            retryable=True,
        )


async def run_tool_with_user(
    config: Any,
    *,
    action: str,
    operation: Callable[[str], Awaitable[T]],
    localize: bool = True,
) -> dict[str, Any]:
    """Resolve user_id from RunnableConfig and run operation safely.

    This is a thin convenience wrapper over ``safe_tool_call`` to remove
    repeated boilerplate in tool implementations.
    """
    user_id = require_user_id(config)
    return await safe_tool_call(
        lambda: operation(user_id),
        action=action,
        localize=localize,
        user_id=user_id,
    )


async def run_time_aware_tool_with_user(
    config: Any,
    *,
    action: str,
    payload: dict[str, Any],
    temporal_fields: dict[str, TemporalFieldKind],
    operation: Callable[[str, dict[str, Any], ToolTimeContext], Awaitable[T]],
    localize: bool = True,
) -> dict[str, Any]:
    """Resolve user + timezone context, normalize temporal inputs, then run safely."""
    user_id = require_user_id(config)

    async def time_aware_operation() -> T:
        time_context = await build_tool_time_context(user_id)
        normalized_temporals = normalize_temporal_payload(
            payload,
            temporal_fields,
            time_context,
        )
        return await operation(user_id, normalized_temporals, time_context)

    return await safe_tool_call(
        time_aware_operation,
        action=action,
        localize=localize,
        user_id=user_id,
    )
