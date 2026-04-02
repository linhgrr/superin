"""Confirmation system for destructive operations.

Defends against:
- ASI09: Human-Agent Trust Exploitation
- Accidental destructive actions

Agent-mediated confirmation - agent handles the confirmation flow.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from functools import wraps
from typing import Any, Callable, ParamSpec, TypeVar

from shared.agent_context import get_user_context
from shared.tool_results import tool_error

P = ParamSpec("P")
T = TypeVar("T")

# Timeout for confirmation (seconds)
CONFIRMATION_TIMEOUT = 300  # 5 minutes


@dataclass
class PendingConfirmation:
    """Represents a pending destructive operation awaiting confirmation."""

    confirmation_id: str
    user_id: str
    operation: str
    resource_id: str
    title: str
    description: str
    risk_level: str
    timestamp: float
    args: dict[str, Any] = field(default_factory=dict)


# In-memory store of pending confirmations: {confirmation_id: PendingConfirmation}
_pending_confirmations: dict[str, PendingConfirmation] = {}


def _generate_id() -> str:
    """Generate unique confirmation ID."""
    return str(uuid.uuid4())


def _cleanup_expired() -> None:
    """Remove expired confirmations."""
    now = time.time()
    expired = [
        cid
        for cid, pending in _pending_confirmations.items()
        if now - pending.timestamp > CONFIRMATION_TIMEOUT
    ]
    for cid in expired:
        _pending_confirmations.pop(cid, None)


def requires_confirmation(
    title: str,
    description: str,
    risk_level: str = "high",
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    """Decorator: Require agent-mediated confirmation before executing tool.

    Args:
        title: Short title for the confirmation (e.g., "Delete Wallet")
        description: Detailed description of the action and its consequences.
                     Can use {param_name} placeholders for dynamic values.
        risk_level: "high" | "medium" | "low" - affects prompt urgency

    Returns:
        Tool result dict with confirmation request if not confirmed,
        or actual tool result if confirmed.
    """

    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> dict[str, Any]:
            user_id = get_user_context()

            # Extract confirmation_id if provided
            confirmation_id: str | None = kwargs.pop("_confirmation_id", None)

            # If confirmed, verify and execute
            if confirmation_id:
                pending = _pending_confirmations.get(confirmation_id)

                if not pending:
                    return tool_error(
                        "Confirmation not found or expired. Please try again.",
                        code="confirmation_expired",
                        retryable=True,
                    )

                if pending.user_id != user_id:
                    return tool_error(
                        "Confirmation user mismatch.",
                        code="confirmation_invalid",
                        retryable=False,
                    )

                if pending.operation != func.__name__:
                    return tool_error(
                        "Confirmation operation mismatch.",
                        code="confirmation_invalid",
                        retryable=False,
                    )

                # Check timeout
                if time.time() - pending.timestamp > CONFIRMATION_TIMEOUT:
                    _pending_confirmations.pop(confirmation_id, None)
                    return tool_error(
                        "Confirmation expired. Please try again.",
                        code="confirmation_expired",
                        retryable=True,
                    )

                # Valid confirmation - clear it and execute
                _pending_confirmations.pop(confirmation_id, None)
                return await func(*args, **kwargs)

            # No confirmation - create pending and request confirmation
            _cleanup_expired()

            # Extract resource_id from kwargs
            resource_id = (
                kwargs.get("wallet_id")
                or kwargs.get("task_id")
                or kwargs.get("transaction_id")
                or kwargs.get("from_wallet_id")  # for transfer
                or "unknown"
            )

            # Format description with actual values
            try:
                formatted_description = description.format(**kwargs)
            except (KeyError, ValueError):
                formatted_description = description

            conf_id = _generate_id()
            _pending_confirmations[conf_id] = PendingConfirmation(
                confirmation_id=conf_id,
                user_id=user_id,
                operation=func.__name__,
                resource_id=str(resource_id),
                title=title,
                description=formatted_description,
                risk_level=risk_level,
                timestamp=time.time(),
                args=dict(kwargs),
            )

            # Build pending_operation for agent to auto-retry
            pending_operation = {
                "tool": func.__name__,
                "args": dict(kwargs),
                "confirmation_id": conf_id,
            }

            return {
                "ok": False,
                "requires_confirmation": True,
                "confirmation": {
                    "id": conf_id,
                    "title": title,
                    "description": formatted_description,
                    "risk_level": risk_level,
                    "resource_id": str(resource_id),
                    "expires_in_seconds": CONFIRMATION_TIMEOUT,
                },
                "pending_operation": pending_operation,
                "message": (
                    f"⚠️ **{title}**\n\n"
                    f"{formatted_description}\n\n"
                    f"⚠️ This action **cannot be undone**.\n\n"
                    f"**To confirm:** Reply 'yes' or 'confirm'\n"
                    f"**To cancel:** Reply 'no' or 'cancel'\n\n"
                    f"⏱️ Expires in {CONFIRMATION_TIMEOUT // 60} minutes"
                ),
                "instruction_for_agent": (
                    "When user replies 'yes' or 'confirm', automatically re-invoke "
                    f"{func.__name__} with the same arguments plus _confirmation_id='{conf_id}'. "
                    "Do not ask user to confirm again - the confirmation ID is already validated."
                ),
            }

        # Mark function for introspection
        wrapper._requires_confirmation = True  # type: ignore
        wrapper._confirmation_title = title  # type: ignore
        wrapper._confirmation_description = description  # type: ignore
        wrapper._confirmation_risk_level = risk_level  # type: ignore

        return wrapper

    return decorator


def get_pending_by_id(confirmation_id: str) -> PendingConfirmation | None:
    """Get pending confirmation by ID."""
    _cleanup_expired()
    return _pending_confirmations.get(confirmation_id)


def get_pending_for_user(user_id: str) -> list[PendingConfirmation]:
    """Get all pending confirmations for user."""
    _cleanup_expired()
    return [p for p in _pending_confirmations.values() if p.user_id == user_id]


def clear_all_for_user(user_id: str) -> int:
    """Clear all pending confirmations for user. Returns count cleared."""
    to_clear = [
        cid
        for cid, p in _pending_confirmations.items()
        if p.user_id == user_id
    ]
    for cid in to_clear:
        _pending_confirmations.pop(cid, None)
    return len(to_clear)
