"""Centralized tool execution policy for child agents."""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

from langchain.agents.middleware.types import AgentMiddleware, ContextT, ResponseT
from langchain_core.messages import SystemMessage, ToolMessage
from langgraph.types import Command
from loguru import logger

from core.agents.app_state import AppAgentState
from core.agents.root.schemas import ToolResult
from shared.tool_errors import ToolUserError
from shared.tool_results import (
    encode_tool_result,
    parse_tool_message_content,
    summarize_tool_payload,
    tool_error,
    tool_success_async,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from langchain.agents.middleware.types import ToolCallRequest


class StructuredToolResultMiddleware(AgentMiddleware[AppAgentState, ContextT, ResponseT]):
    """Wrap tool outcomes into the repo's structured `{ok, data/error}` contract."""

    state_schema = AppAgentState

    def _should_localize(self, tool_name: str) -> bool:
        return not tool_name.startswith("platform_")

    def _build_error_message(
        self,
        *,
        tool_name: str,
        tool_call_id: str,
        message: str,
        code: str,
        retryable: bool,
    ) -> ToolMessage:
        payload = tool_error(message, code=code, retryable=retryable)
        return ToolMessage(
            content=encode_tool_result(payload),
            artifact=payload,
            name=tool_name,
            tool_call_id=tool_call_id,
            status="error",
        )

    def _build_tool_result(
        self,
        *,
        tool_name: str,
        tool_call_id: str | None,
        payload: object,
        is_mutating: bool = False,
    ) -> ToolResult:
        if isinstance(payload, dict) and "ok" in payload:
            return {
                "tool_name": tool_name,
                "tool_call_id": tool_call_id,
                "ok": bool(payload.get("ok")),
                "data": payload.get("data"),
                "error": payload.get("error"),
                "is_mutating": is_mutating,
            }

        return {
            "tool_name": tool_name,
            "tool_call_id": tool_call_id,
            "ok": True,
            "data": payload,
            "error": None,
            "is_mutating": is_mutating,
        }

    def _build_command_update(
        self,
        message: ToolMessage,
        payload: object,
        *,
        is_mutating: bool = False,
    ) -> Command[Any]:
        update: dict[str, Any] = {
            "messages": [message],
            "tool_results": [
                self._build_tool_result(
                    tool_name=message.name or "unknown_tool",
                    tool_call_id=message.tool_call_id,
                    payload=payload,
                    is_mutating=is_mutating,
                )
            ],
        }
        if is_mutating:
            update["contained_mutation"] = True
        return Command(update=update)

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> Command[Any]:
        tool_name = request.tool_call["name"]
        tool_call_id = request.tool_call.get("id") or "unknown_tool_call"
        user_id = getattr(request.runtime.context, "user_id", "") or None
        is_mutating = bool(getattr(request.tool, "extras", {}).get("is_mutating", False))
        started_at = time.perf_counter()

        try:
            handler_started_at = time.perf_counter()
            response = await handler(request)
            handler_elapsed = time.perf_counter() - handler_started_at
        except ToolUserError as exc:
            message = self._build_error_message(
                tool_name=tool_name,
                tool_call_id=tool_call_id,
                message=str(exc),
                code=exc.code,
                retryable=exc.retryable,
            )
            return self._build_command_update(message, message.artifact, is_mutating=is_mutating)
        except ValueError as exc:
            message = self._build_error_message(
                tool_name=tool_name,
                tool_call_id=tool_call_id,
                message=str(exc),
                code="invalid_request",
                retryable=False,
            )
            return self._build_command_update(message, message.artifact, is_mutating=is_mutating)
        except PermissionError as exc:
            message = self._build_error_message(
                tool_name=tool_name,
                tool_call_id=tool_call_id,
                message=str(exc),
                code="forbidden",
                retryable=False,
            )
            return self._build_command_update(message, message.artifact, is_mutating=is_mutating)
        except RuntimeError as exc:
            logger.warning("Tool action rejected: {} — {}", tool_name, exc)
            message = self._build_error_message(
                tool_name=tool_name,
                tool_call_id=tool_call_id,
                message=str(exc),
                code="invalid_context",
                retryable=False,
            )
            return self._build_command_update(message, message.artifact, is_mutating=is_mutating)
        except Exception:
            logger.exception("Tool action failed: {}", tool_name)
            message = self._build_error_message(
                tool_name=tool_name,
                tool_call_id=tool_call_id,
                message=f"Unexpected error while using tool '{tool_name}'.",
                code="internal_error",
                retryable=True,
            )
            return self._build_command_update(message, message.artifact, is_mutating=is_mutating)

        if isinstance(response, Command):
            return response

        if not isinstance(response, ToolMessage):
            message = self._build_error_message(
                tool_name=tool_name,
                tool_call_id=tool_call_id,
                message="Tool execution returned an unsupported response type.",
                code="invalid_tool_response",
                retryable=False,
            )
            return self._build_command_update(message, message.artifact, is_mutating=is_mutating)

        if response.status == "error":
            raw_error = parse_tool_message_content(response.content)
            error_message = raw_error if isinstance(raw_error, str) else str(raw_error)
            tool_message = self._build_error_message(
                tool_name=response.name or tool_name,
                tool_call_id=response.tool_call_id or tool_call_id,
                message=error_message,
                code="tool_error",
                retryable=False,
            )
            return self._build_command_update(
                tool_message,
                tool_message.artifact,
                is_mutating=is_mutating,
            )

        parse_started_at = time.perf_counter()
        payload = parse_tool_message_content(response.content)
        parse_elapsed = time.perf_counter() - parse_started_at
        payload_summary = summarize_tool_payload(payload)

        postprocess_started_at = time.perf_counter()
        structured = await tool_success_async(
            payload,
            localize=self._should_localize(tool_name),
            user_id=user_id,
            tool_name=response.name or tool_name,
            tool_call_id=response.tool_call_id or tool_call_id,
        )
        postprocess_elapsed = time.perf_counter() - postprocess_started_at
        total_elapsed = time.perf_counter() - started_at

        log_method = logger.debug
        if total_elapsed >= 2.0 or postprocess_elapsed >= 2.0:
            log_method = logger.warning
        elif total_elapsed >= 0.5 or postprocess_elapsed >= 0.5:
            log_method = logger.info

        log_method(
            "TOOL_MIDDLEWARE_FLOW  tool={}  call_id={}  handler={:.3f}s  parse={:.3f}s  postprocess={:.3f}s  total={:.3f}s  payload={}",
            response.name or tool_name,
            response.tool_call_id or tool_call_id,
            handler_elapsed,
            parse_elapsed,
            postprocess_elapsed,
            total_elapsed,
            payload_summary,
        )

        tool_message = ToolMessage(
            content=encode_tool_result(structured),
            artifact=structured,
            name=response.name or tool_name,
            tool_call_id=response.tool_call_id or tool_call_id,
            status="success",
        )
        return self._build_command_update(tool_message, structured, is_mutating=is_mutating)


class ChildBudgetMiddleware(AgentMiddleware[AppAgentState, ContextT, ResponseT]):
    """Track child tool-call budgets and force graceful partial finalization."""

    state_schema = AppAgentState

    def __init__(self, *, soft_limit: int, hard_limit: int) -> None:
        self.soft_limit = soft_limit
        self.hard_limit = hard_limit

    async def abefore_model(
        self,
        state: AppAgentState,
        runtime: Any,
    ) -> dict[str, Any] | None:
        if state.get("tool_budget_exhausted"):
            return {
                "messages": [
                    SystemMessage(
                        content=(
                            "Tool budget exhausted. Do not call any more tools. "
                            "Produce the best structured partial response now."
                        )
                    )
                ]
            }
        if state.get("tool_budget_soft_exhausted"):
            return {
                "messages": [
                    SystemMessage(
                        content=(
                            "You are at the tool-call soft limit. Stop using tools and "
                            "return the best structured partial response now."
                        )
                    )
                ]
            }
        return None

    async def awrap_tool_call(
        self,
        request: Any,
        handler: Callable[[Any], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]:
        current_count = int(request.state.get("tool_call_count", 0) or 0)
        next_count = current_count + 1
        tool_name = request.tool_call["name"]
        tool_call_id = request.tool_call.get("id") or "unknown_tool_call"
        is_mutating = bool(getattr(request.tool, "extras", {}).get("is_mutating", False))

        if current_count >= self.hard_limit:
            logger.warning(
                "CHILD_TOOL_BUDGET_HARD_LIMIT  tool={}  count={}  hard_limit={}",
                tool_name,
                next_count,
                self.hard_limit,
            )
            payload = tool_error(
                "Tool budget exhausted. Finalize with the evidence already gathered.",
                code="tool_budget_exhausted",
                retryable=False,
            )
            message = ToolMessage(
                content=encode_tool_result(payload),
                artifact=payload,
                name=tool_name,
                tool_call_id=tool_call_id,
                status="error",
            )
            return Command(
                update={
                    "messages": [message],
                    "tool_results": [
                        {
                            "tool_name": tool_name,
                            "tool_call_id": tool_call_id,
                            "ok": False,
                            "data": None,
                            "error": payload["error"],
                            "is_mutating": is_mutating,
                        }
                    ],
                    "tool_call_count": next_count,
                    "tool_budget_soft_exhausted": True,
                    "tool_budget_exhausted": True,
                    "contained_mutation": is_mutating,
                }
            )

        response = await handler(request)
        update: dict[str, Any] = {
            "tool_call_count": next_count,
            "tool_budget_soft_exhausted": next_count >= self.soft_limit,
            "tool_budget_exhausted": next_count >= self.hard_limit,
        }
        if is_mutating:
            update["contained_mutation"] = True

        if isinstance(response, Command):
            existing_update = response.update if isinstance(response.update, dict) else {}
            return Command(update={**existing_update, **update})

        return Command(update={"messages": [response], **update})
