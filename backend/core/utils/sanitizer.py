"""Input sanitization and validation for AI agent security.

Uses professional libraries:
- nh3: HTML sanitization (Rust-based)
- confusables: Homoglyph detection

Provides defense against:
- ASI01: Agent Goal Hijacking (prompt injection)
- ASI06: Memory Poisoning via malicious content
- Unicode confusables / homoglyph attacks

All CPU-intensive sanitization operations run in thread pools
to avoid blocking the async event loop.
"""

from __future__ import annotations

import asyncio
import base64
import re
import unicodedata
from typing import Any

import confusables
import nh3

from core.constants import (
    MAX_MESSAGE_LENGTH,
    MAX_TOOL_CALL_ARGUMENTS_SIZE,
)

# Injection pattern detection
_PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(?:all\s+)?(?:previous\s+)?(?:instruction|command|prompt)s?",
    r"disregard\s+(?:all\s+)?(?:instruction|command)s?",
    r"system\s*[:\-]?\s*you\s+(?:are|must|should)",
    r"new\s+system\s+(?:instruction|prompt|command)",
    r"system\s+override",
    r"you\s+(?:are|must)\s+(?:now\s+)?(?:an?\s+)?(?:attacker|hacker|developer|system)",
    r"forget\s+(?:your\s+)?(?:role|instruction|training)",
    r"<\s*/?\s*(?:system|user|assistant|instruction)",
    r"\[\s*(?:system|instruction)\s*\]",
    r"\{\s*(?:system|instruction)\s*\}",
    r"<\?xml[^>]*>",
    r"<!doctype[^>]*>",
    r"act\s+(?:as|like)\s+(?:if\s+)?you(?:'re|r\s+not)",
    r"pretend\s+(?:to\s+be|you\s+are)",
    r"simulate\s+(?:being|that\s+you)",
    r"repeat\s+(?:everything|all|your)\s+(?:above|instructions|prompt)",
    r"what\s+(?:are|were)\s+your\s+(?:instructions|rules|guidelines)",
    r"show\s+me\s+your\s+(?:system\s+)?prompt",
    r"print\s+your\s+(?:initial|system)\s+(?:prompt|instructions)",
    r"output\s+your\s+(?:full\s+)?(system\s+)?prompt",
    r"reveal\s+your\s+(?:hidden\s+)?instructions",
]

_ENCODED_PATTERNS = [
    r"base64\s*(?:decode|decodeURIComponent|decode)",
    r"atob\s*\(",
    r"btoa\s*\(",
    r"rot13|caesar|shift\s+\d+",
    r"hex\s*(?:decode|to\s*string)",
    r"url\s*(?:decode|unescape)",
    r"unescape\s*\(",
    r"fromCharCode",
    r"\$\{.*atob",
    r"eval\s*\(",
    r"Function\s*\(",
    r"constructor\s*\(",
]

# Compiled regexes for efficiency (compiled once at module load)
_COMPILED_INJECTION_PATTERNS = [re.compile(p, re.IGNORECASE) for p in _PROMPT_INJECTION_PATTERNS]
_COMPILED_ENCODED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in _ENCODED_PATTERNS]

# Control character removal (pre-compiled)
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_WHITESPACE_RE = re.compile(r"\n{4,}")

# Base64 detection (pre-compiled)
_BASE64_RE = re.compile(r'[A-Za-z0-9+/]{20,}={0,2}')


def _normalize_unicode(text: str) -> str:
    """Normalize unicode confusables using NFKC and confusables library."""
    if text.isascii():
        return text

    text = unicodedata.normalize('NFKC', text)
    normalized_list = confusables.normalize(text, prioritize_alpha=True)
    return normalized_list[0] if normalized_list else text


def _check_base64_injection(text: str, patterns: list) -> tuple[bool, str]:
    """Check if text contains base64-encoded injection attempts."""
    for b64_str in _BASE64_RE.findall(text):
        if len(b64_str) % 4 != 0:
            continue
        try:
            decoded = base64.b64decode(b64_str).decode('utf-8', errors='ignore')
            for pattern in patterns:
                if pattern.search(decoded):
                    return True, decoded
        except Exception:
            continue
    return False, ""


def _apply_injection_filters(text: str, patterns: list, warning_msg: str) -> tuple[str, list[str]]:
    """Apply injection patterns and return filtered text with warnings."""
    warnings: list[str] = []
    filtered = text
    for pattern in patterns:
        if pattern.search(filtered):
            warnings.append(warning_msg)
            filtered = pattern.sub("[FILTERED]", filtered)
    return filtered, warnings


def sanitize_user_content(content: str | None) -> tuple[str, list[str]]:
    """Sanitize user content and detect injection attempts.

    Returns: (sanitized_content, warnings)
    """
    if content is None:
        return "", []

    warnings: list[str] = []

    # Length check
    if len(content) > MAX_MESSAGE_LENGTH:
        content = content[:MAX_MESSAGE_LENGTH]
        warnings.append("Content truncated due to length limit")

    # Normalize unicode (single normalization for all checks)
    content = _normalize_unicode(content)

    # Check for base64-encoded injection
    is_b64_suspicious, _ = _check_base64_injection(content, _COMPILED_INJECTION_PATTERNS)
    if is_b64_suspicious:
        warnings.append("Encoded prompt injection detected (base64)")
        return "[ENCODED_INJECTION_BLOCKED]", warnings

    # Apply encoded pattern filters
    content, enc_warnings = _apply_injection_filters(
        content, _COMPILED_ENCODED_PATTERNS, "Suspicious encoding pattern detected"
    )
    warnings.extend(enc_warnings)

    # Apply injection pattern filters
    content, inj_warnings = _apply_injection_filters(
        content, _COMPILED_INJECTION_PATTERNS, "Potential prompt injection detected"
    )
    warnings.extend(inj_warnings)

    # Clean control characters (pre-compiled regex)
    content = _CONTROL_CHARS_RE.sub("", content)
    content = _WHITESPACE_RE.sub("\n\n\n", content)

    return content, warnings


async def sanitize_user_content_async(content: str | None) -> tuple[str, list[str]]:
    """Sanitize user content and detect injection attempts (async version).

    Runs the CPU-intensive sanitization in a thread pool
to avoid blocking the event loop.

    Returns: (sanitized_content, warnings)
    """
    if content is None:
        return "", []

    # Run the heavy lifting in a thread pool
    return await asyncio.to_thread(sanitize_user_content, content)


def validate_tool_arguments(
    args: dict[str, Any], tool_name: str
) -> tuple[dict[str, Any], list[str]]:
    """Validate tool arguments for injection attempts."""
    warnings: list[str] = []

    # Size check (avoid full str() conversion if possible)
    total_len = 0
    for value in args.values():
        if isinstance(value, str):
            total_len += len(value)
        else:
            total_len += len(str(value))
        if total_len > MAX_TOOL_CALL_ARGUMENTS_SIZE:
            warnings.append(f"Tool '{tool_name}' arguments too large")
            break

    # Truncate oversized string args
    if total_len > MAX_TOOL_CALL_ARGUMENTS_SIZE:
        for key, value in args.items():
            if isinstance(value, str) and len(value) > 1000:
                args[key] = value[:1000] + "..."

    # Sanitize string arguments
    for key, value in args.items():
        if isinstance(value, str):
            sanitized, arg_warnings = sanitize_user_content(value)
            args[key] = sanitized
            for w in arg_warnings:
                warnings.append(f"Arg '{key}': {w}")

    return args, warnings


def is_content_safe(content: str) -> tuple[bool, list[str]]:
    """Quick check if content is safe without sanitizing."""
    warnings: list[str] = []

    if len(content) > MAX_MESSAGE_LENGTH:
        warnings.append("Content exceeds maximum length")
        return False, warnings

    # Normalize once
    normalized = _normalize_unicode(content)

    # Check base64 injection
    is_b64_suspicious, _ = _check_base64_injection(normalized, _COMPILED_INJECTION_PATTERNS)
    if is_b64_suspicious:
        warnings.append("Encoded injection pattern detected")
        return False, warnings

    # Quick check using any() for early exit
    if any(p.search(normalized) for p in _COMPILED_ENCODED_PATTERNS):
        warnings.append("Suspicious encoding pattern detected")
        return False, warnings

    if any(p.search(normalized) for p in _COMPILED_INJECTION_PATTERNS):
        warnings.append("Potential injection pattern detected")
        return False, warnings

    if "\x00" in content:
        warnings.append("Null bytes detected")
        return False, warnings

    return True, warnings


async def is_content_safe_async(content: str) -> tuple[bool, list[str]]:
    """Quick check if content is safe without sanitizing (async version).

    Runs the CPU-intensive checks in a thread pool
to avoid blocking the event loop.
    """
    return await asyncio.to_thread(is_content_safe, content)


def sanitize_for_memory(content: str) -> str:
    """Sanitize content before storing in persistent memory (ASI06 defense)."""
    if not content:
        return ""

    sanitized, _ = sanitize_user_content(content)

    # HTML sanitization with nh3
    return nh3.clean(
        sanitized,
        tags=set(),
        attributes={},
        url_schemes=set(),
    ).strip()


async def sanitize_for_memory_async(content: str) -> str:
    """Sanitize content before storing in persistent memory (async version).

    Delegates to the synchronous `sanitize_for_memory` via `asyncio.to_thread`
    so that all sanitization logic (including .strip()) is applied consistently.
    """
    if not content:
        return ""
    return await asyncio.to_thread(sanitize_for_memory, content)


def sanitize_db_content_for_llm(
    data: dict[str, Any] | list[Any] | str | None,
    max_depth: int = 10,
    _current_depth: int = 0,
) -> Any:
    """Sanitize database content before sending to LLM.

    Recursively processes nested structures with depth limit to prevent stack overflow.

    Args:
        data: Data to sanitize
        max_depth: Maximum recursion depth (default 10)
        _current_depth: Internal recursion tracking (do not pass)
    """
    if data is None:
        return None

    if _current_depth >= max_depth:
        # Return truncated indicator instead of recursing deeper
        return "[MAX_DEPTH_REACHED]"

    if isinstance(data, str):
        return sanitize_for_memory(data)

    if isinstance(data, list):
        return [
            sanitize_db_content_for_llm(item, max_depth, _current_depth + 1)
            for item in data
        ]

    if isinstance(data, dict):
        return {
            key: sanitize_db_content_for_llm(value, max_depth, _current_depth + 1)
            for key, value in data.items()
        }

    return data
