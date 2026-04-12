"""
LLM factory — single shared source for the ChatOpenAI instance.

Used by RootAgent and any other component that needs the LLM.
Lazy import avoids requiring OPENAI_API_KEY at import time.
"""

import importlib
import inspect
import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

_llm: Any | None = None
_patch_guard: bool = False
_lock = threading.Lock()

def _to_safe_int(value: Any) -> int:
    """Convert nullable/unknown token counters to a safe integer."""
    if value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _patch_langchain_openai_usage_metadata() -> None:
    """
    Patch legacy langchain_openai usage parser to tolerate null token counters.

    Some OpenAI-compatible providers return completion token counts as null.
    Older langchain_openai versions can crash while computing totals in stream
    conversion. This patch normalizes token fields before delegating.
    """
    try:
        lc_openai_base = importlib.import_module("langchain_openai.chat_models.base")
    except Exception:
        return

    if getattr(lc_openai_base, "_superin_usage_patch", False):
        return

    original_create_usage_metadata = getattr(lc_openai_base, "_create_usage_metadata", None)
    if original_create_usage_metadata is None:
        return
    try:
        signature = inspect.signature(original_create_usage_metadata)
        supports_service_tier = len(signature.parameters) >= 2
    except Exception:
        supports_service_tier = True

    def _safe_create_usage_metadata(
        oai_token_usage: dict[str, Any], service_tier: str | None = None
    ) -> Any:
        usage = dict(oai_token_usage or {})
        prompt_tokens = _to_safe_int(usage.get("prompt_tokens"))
        completion_tokens = _to_safe_int(usage.get("completion_tokens"))
        total_tokens_raw = usage.get("total_tokens")
        total_tokens = (
            _to_safe_int(total_tokens_raw)
            if total_tokens_raw is not None
            else prompt_tokens + completion_tokens
        )
        usage["prompt_tokens"] = prompt_tokens
        usage["completion_tokens"] = completion_tokens
        usage["total_tokens"] = total_tokens
        if supports_service_tier:
            return original_create_usage_metadata(usage, service_tier)
        return original_create_usage_metadata(usage)

    lc_openai_base._create_usage_metadata = _safe_create_usage_metadata
    lc_openai_base._superin_usage_patch = True


def get_llm() -> Any:
    """
    Get or create the LLM instance. Requires OPENAI_API_KEY to be set.

    Returns:
        ChatOpenAI instance configured from settings.
    """
    global _llm, _patch_guard
    # Fast path: avoid lock acquisition when already initialized
    if _llm is not None:
        return _llm
    with _lock:
        # Double-checked locking: re-check under lock to prevent double init
        if _llm is None:
            from langchain_openai import ChatOpenAI

            from core.config import settings

            logger.info("🔗 LLM init — base_url=%s model=%s", settings.openai_base_url, settings.openai_model)
            if not _patch_guard:
                _patch_langchain_openai_usage_metadata()
                _patch_guard = True
            extra_headers: dict[str, str] = {}
            # Skip ngrok browser warning page when calling through ngrok tunnel
            if "ngrok" in settings.openai_base_url.lower():
                extra_headers["ngrok-skip-browser-warning"] = "1"
            _llm = ChatOpenAI(
                api_key=settings.openai_api_key,
                base_url=settings.openai_base_url,
                model=settings.openai_model,
                temperature=0,
                timeout=settings.llm_request_timeout_seconds,
                max_retries=1,
                # Some OpenAI-compatible providers omit completion token usage in
                # stream chunks. Disabling streamed usage avoids downstream
                # `langchain_openai` crashes when token counts are null.
                stream_usage=False,
                model_kwargs={"extra_headers": extra_headers} if extra_headers else {},
            )
    return _llm
