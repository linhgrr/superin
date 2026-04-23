"""Tool result serialization helpers for the agent runtime."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Any, NotRequired, Protocol, TypeAlias, TypedDict, TypeVar, cast

from langchain.tools import ToolRuntime
from loguru import logger
from pydantic import BaseModel

from core.models import User
from core.utils.sanitizer import sanitize_db_content_for_llm
from core.utils.timezone import convert_utc_strings_to_local, get_user_timezone_context
from shared.tool_time import (
    TemporalFieldKind,
    ToolTimeContext,
    build_tool_time_context,
    normalize_temporal_payload,
)

JsonScalar: TypeAlias = str | int | float | bool | None
ToolPayload: TypeAlias = dict[str, Any] | list[Any] | JsonScalar
ToolSerializable: TypeAlias = BaseModel | Mapping[str, Any] | Sequence[Any] | JsonScalar
TResult = TypeVar("TResult")


class RuntimeContextWithUserId(Protocol):
    """Minimum runtime context contract required by user-scoped tools."""

    @property
    def user_id(self) -> str: ...


TRuntimeContext = TypeVar("TRuntimeContext", bound=RuntimeContextWithUserId)


class ToolErrorPayload(TypedDict):
    message: str
    code: str
    retryable: bool


class ToolSuccessResult(TypedDict):
    ok: bool
    data: ToolPayload


class ToolFailureResult(TypedDict):
    ok: bool
    error: ToolErrorPayload
    data: NotRequired[ToolPayload]


ToolExecutionResult: TypeAlias = ToolSuccessResult | ToolFailureResult
_SLOW_TOOL_RESULT_INFO_SECONDS = 0.5
_SLOW_TOOL_RESULT_WARNING_SECONDS = 2.0


def _to_tool_payload(data: ToolSerializable) -> ToolPayload:
    """Convert supported tool data into plain JSON-like structures."""
    if isinstance(data, BaseModel):
        return _to_tool_payload(data.model_dump(mode="json"))
    if isinstance(data, (bytes, bytearray)):
        return data.decode("utf-8", errors="replace")
    if isinstance(data, Mapping):
        return {str(key): _to_tool_payload(value) for key, value in data.items()}
    if isinstance(data, Sequence) and not isinstance(data, (str, bytes, bytearray)):
        return [_to_tool_payload(item) for item in data]
    return cast(ToolPayload, data)


def _sanitize_tool_payload(payload: ToolPayload) -> ToolPayload:
    if isinstance(payload, (dict, list, str)) or payload is None:
        return cast(ToolPayload, sanitize_db_content_for_llm(payload))
    return cast(ToolPayload, payload)


def summarize_tool_payload(payload: object) -> str:
    """Return a compact shape summary for logs without dumping full content."""
    if payload is None:
        return "none"
    if isinstance(payload, str):
        return f"str(len={len(payload)})"
    if isinstance(payload, list):
        sample_types = [type(item).__name__ for item in payload[:3]]
        suffix = "..." if len(payload) > 3 else ""
        return f"list(len={len(payload)}, sample_types={sample_types}{suffix})"
    if isinstance(payload, dict):
        keys = list(payload.keys())[:5]
        suffix = "..." if len(payload) > 5 else ""
        return f"dict(len={len(payload)}, keys={keys}{suffix})"
    return type(payload).__name__


def _log_tool_result_timings(
    *,
    tool_name: str | None,
    tool_call_id: str | None,
    payload_summary: str,
    localize: bool,
    to_payload_elapsed: float,
    user_lookup_elapsed: float,
    localize_elapsed: float,
    sanitize_elapsed: float,
    total_elapsed: float,
) -> None:
    log_method = logger.debug
    if total_elapsed >= _SLOW_TOOL_RESULT_WARNING_SECONDS or sanitize_elapsed >= _SLOW_TOOL_RESULT_WARNING_SECONDS:
        log_method = logger.warning
    elif total_elapsed >= _SLOW_TOOL_RESULT_INFO_SECONDS or sanitize_elapsed >= _SLOW_TOOL_RESULT_INFO_SECONDS:
        log_method = logger.info

    log_method(
        "TOOL_RESULT_POSTPROCESS  tool={}  call_id={}  localize={}  to_payload={:.3f}s  user_lookup={:.3f}s  localize_phase={:.3f}s  sanitize={:.3f}s  total={:.3f}s  payload={}",
        tool_name or "unknown_tool",
        tool_call_id or "unknown_tool_call",
        localize,
        to_payload_elapsed,
        user_lookup_elapsed,
        localize_elapsed,
        sanitize_elapsed,
        total_elapsed,
        payload_summary,
    )


def require_runtime_user_id(runtime: ToolRuntime[TRuntimeContext]) -> str:
    user_id = runtime.context.user_id
    if not user_id:
        raise RuntimeError(
            "Tool invoked without runtime.context.user_id. "
            "Ensure the parent agent forwards a valid runtime context."
        )
    return user_id


def tool_success(data: ToolSerializable) -> ToolSuccessResult:
    """Return a successful tool result after sanitizing LLM-visible content."""
    sanitized_data = _sanitize_tool_payload(_to_tool_payload(data))
    return {
        "ok": True,
        "data": sanitized_data,
    }


async def tool_success_async(
    data: ToolSerializable,
    *,
    localize: bool = True,
    user_id: str | None = None,
    tool_name: str | None = None,
    tool_call_id: str | None = None,
) -> ToolSuccessResult:
    """Sanitize tool payloads off the event loop before returning to the LLM."""
    started_at = time.perf_counter()
    phase = "to_payload"
    localized_data = _to_tool_payload(data)
    to_payload_elapsed = time.perf_counter() - started_at
    user_lookup_elapsed = 0.0
    localize_elapsed = 0.0

    try:
        if localize and user_id:
            phase = "user_lookup"
            lookup_started_at = time.perf_counter()
            try:
                user = await User.get(user_id)
            except (AttributeError, TypeError):
                user = None
            except Exception:
                logger.exception("User lookup failed during tool result localization")
                user = None
            user_lookup_elapsed = time.perf_counter() - lookup_started_at

            phase = "localize"
            localize_started_at = time.perf_counter()
            formatter = get_user_timezone_context(user).format_datetime
            localized_data = convert_utc_strings_to_local(localized_data, formatter)
            localize_elapsed = time.perf_counter() - localize_started_at

        payload_summary = summarize_tool_payload(localized_data)
        phase = "sanitize"
        sanitize_started_at = time.perf_counter()
        sanitized_data = await asyncio.to_thread(_sanitize_tool_payload, localized_data)
        sanitize_elapsed = time.perf_counter() - sanitize_started_at
        total_elapsed = time.perf_counter() - started_at

        _log_tool_result_timings(
            tool_name=tool_name,
            tool_call_id=tool_call_id,
            payload_summary=payload_summary,
            localize=localize and bool(user_id),
            to_payload_elapsed=to_payload_elapsed,
            user_lookup_elapsed=user_lookup_elapsed,
            localize_elapsed=localize_elapsed,
            sanitize_elapsed=sanitize_elapsed,
            total_elapsed=total_elapsed,
        )
    except asyncio.CancelledError:
        logger.warning(
            "TOOL_RESULT_POSTPROCESS_CANCELLED  tool={}  call_id={}  phase={}  elapsed={:.3f}s  localize={}",
            tool_name or "unknown_tool",
            tool_call_id or "unknown_tool_call",
            phase,
            time.perf_counter() - started_at,
            localize and bool(user_id),
        )
        raise

    return {
        "ok": True,
        "data": sanitized_data,
    }


def tool_error(
    message: str,
    *,
    code: str = "domain_error",
    retryable: bool = False,
) -> ToolFailureResult:
    """Return a failed tool result."""
    return {
        "ok": False,
        "error": {
            "message": message,
            "code": code,
            "retryable": retryable,
        },
    }


def encode_tool_result(result: ToolExecutionResult) -> str:
    """Serialize a structured tool result for ToolMessage.content."""
    return json.dumps(result, ensure_ascii=False)


def parse_tool_message_content(content: object) -> ToolPayload | str | list[dict[str, Any]]:
    """Decode ToolMessage content back into a JSON-like payload when possible."""
    if isinstance(content, str):
        try:
            parsed = json.loads(content)
        except Exception:
            return content
        return cast(ToolPayload | str | list[dict[str, Any]], parsed)
    return cast(ToolPayload | str | list[dict[str, Any]], content)


async def run_tool_with_runtime(
    runtime: ToolRuntime[TRuntimeContext],
    *,
    operation: Callable[[str], Awaitable[TResult]],
) -> TResult:
    """Resolve ``user_id`` from runtime context and execute a user-scoped operation."""
    user_id = require_runtime_user_id(runtime)
    return await operation(user_id)


async def run_time_aware_tool_with_runtime(
    runtime: ToolRuntime[TRuntimeContext],
    *,
    payload: dict[str, Any],
    temporal_fields: dict[str, TemporalFieldKind],
    operation: Callable[[str, dict[str, Any], ToolTimeContext], Awaitable[TResult]],
) -> TResult:
    """Normalize temporal inputs using the runtime user context before execution."""
    user_id = require_runtime_user_id(runtime)
    time_context = await build_tool_time_context(user_id)
    normalized_temporals = normalize_temporal_payload(
        payload,
        temporal_fields,
        time_context,
    )
    return await operation(user_id, normalized_temporals, time_context)
