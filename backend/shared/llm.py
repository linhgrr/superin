"""
LLM factory — single shared source for the ChatOpenAI instance.

Used by RootAgent and any other component that needs the LLM.
Lazy import avoids requiring OPENAI_API_KEY at import time.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)

_llm: Any | None = None


def get_llm() -> Any:
    """
    Get or create the LLM instance. Requires OPENAI_API_KEY to be set.

    Returns:
        ChatOpenAI instance configured from settings.
    """
    global _llm
    if _llm is None:
        from langchain_openai import ChatOpenAI

        from core.config import settings

        logger.info("🔗 LLM init — base_url=%s model=%s", settings.openai_base_url, settings.openai_model)
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
            model_kwargs={"extra_headers": extra_headers} if extra_headers else {},
        )
    return _llm
