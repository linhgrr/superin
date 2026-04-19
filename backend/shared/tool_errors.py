"""Typed tool-facing domain errors.

These errors are intended for business/domain failures that should be surfaced
to the LLM as structured tool errors rather than collapsed into generic
internal failures.
"""

from __future__ import annotations


class ToolUserError(Exception):
    """Base class for tool-facing domain failures.

    Subclasses should provide a stable ``code`` so the LLM can reason about the
    failure category without backend-specific exception knowledge.
    """

    code = "domain_error"
    retryable = False

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        retryable: bool | None = None,
    ) -> None:
        super().__init__(message)
        if code is not None:
            self.code = code
        if retryable is not None:
            self.retryable = retryable


class InvalidRequestError(ToolUserError):
    code = "invalid_request"


class NotFoundError(ToolUserError):
    code = "not_found"


class ForbiddenError(ToolUserError):
    code = "forbidden"


class ConflictError(ToolUserError):
    code = "conflict"


class InvalidStateError(ToolUserError):
    code = "invalid_state"
