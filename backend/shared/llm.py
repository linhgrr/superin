"""
LLM factory — single shared source for the ChatOpenAI instance.

Used by RootAgent and any other component that needs the LLM.
Lazy import avoids requiring OPENAI_API_KEY at import time.
"""

from typing import Any

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

        _llm = ChatOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            model=settings.openai_model,
            temperature=0,
        )
    return _llm
