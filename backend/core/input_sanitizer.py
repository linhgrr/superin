"""Input sanitization and validation for AI agent security.

Uses professional libraries for security-critical operations:
- nh3: HTML sanitization (Rust-based, fast and safe)
- confusables: Homoglyph/confusable character detection
- limits: Rate limiting framework

Provides defense against:
- ASI01: Agent Goal Hijacking (prompt injection)
- ASI06: Memory Poisoning via malicious content
- Unicode confusables / homoglyph attacks
"""

from __future__ import annotations

import base64
import re
import unicodedata
from typing import Any

import confusables
import nh3

# Maximum content lengths to prevent DoS
MAX_MESSAGE_LENGTH = 10000  # characters
MAX_TOOL_CALL_ARGUMENTS_SIZE = 5000  # JSON characters

# Patterns commonly used in prompt injection attacks
PROMPT_INJECTION_PATTERNS = [
    # Ignore previous instructions
    r"ignore\s+(?:all\s+)?(?:previous\s+)?(?:instruction|command|prompt)s?",
    r"disregard\s+(?:all\s+)?(?:instruction|command)s?",
    # System prompt override attempts
    r"system\s*[:\-]?\s*you\s+(?:are|must|should)",
    r"new\s+system\s+(?:instruction|prompt|command)",
    r"system\s+override",
    # Role confusion
    r"you\s+(?:are|must)\s+(?:now\s+)?(?:an?\s+)?(?:attacker|hacker|developer|system)",
    r"forget\s+(?:your\s+)?(?:role|instruction|training)",
    # Delimiter injection attempts
    r"<\s*/?\s*(?:system|user|assistant|instruction)",
    r"\[\s*(?:system|instruction)\s*\]",
    r"\{\s*(?:system|instruction)\s*\}",
    # XML tag injection
    r"<\?xml[^>]*>",
    r"<!doctype[^>]*>",
    # Suspicious patterns
    r"act\s+(?:as|like)\s+(?:if\s+)?you(?:'re|r\s+not)",
    r"pretend\s+(?:to\s+be|you\s+are)",
    r"simulate\s+(?:being|that\s+you)",
    # Prompt extraction attempts
    r"repeat\s+(?:everything|all|your)\s+(?:above|instructions|prompt)",
    r"what\s+(?:are|were)\s+your\s+(?:instructions|rules|guidelines)",
    r"show\s+me\s+your\s+(?:system\s+)?prompt",
    r"print\s+your\s+(?:initial|system)\s+(?:prompt|instructions)",
    r"output\s+your\s+(?:full\s+)?(system\s+)?prompt",
    r"reveal\s+your\s+(?:hidden\s+)?instructions",
]

# Encoded injection patterns (base64, etc.)
ENCODED_INJECTION_PATTERNS = [
    r"base64\s*(?:decode|decodeURIComponent|decode)",
    r"atob\s*\(",  # JavaScript base64 decode
    r"btoa\s*\(",  # JavaScript base64 encode (obfuscation)
    r"rot13|caesar|shift\s+\d+",
    r"hex\s*(?:decode|to\s*string)",
    r"url\s*(?:decode|unescape)",
    r"unescape\s*\(",
    r"fromCharCode",
    r"\$\{.*atob",  # Template literal with atob
    r"eval\s*\(",  # Code execution
    r"Function\s*\(",  # Function constructor
    r"constructor\s*\(",  # Accessing constructor
]

# Compiled regex patterns for efficiency
_COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in PROMPT_INJECTION_PATTERNS]
_COMPILED_ENCODED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in ENCODED_INJECTION_PATTERNS]


def _normalize_unicode(text: str) -> str:
    """Normalize unicode using NFKC form and confusables library.

    Uses confusables library for professional homoglyph detection and normalization.
    Returns the first normalized variant (prioritizing ASCII/Latin characters).
    """
    # Apply NFKC normalization first
    text = unicodedata.normalize('NFKC', text)
    # confusables.normalize returns list of normalized variants
    normalized_list = confusables.normalize(text, prioritize_alpha=True)
    # Return first result (should be ASCII-prioritized) or original if empty
    return normalized_list[0] if normalized_list else text


def _check_base64_injection(text: str) -> tuple[bool, str]:
    """Check if text contains base64-encoded injection attempts.

    Returns: (is_suspicious, decoded_text_if_suspicious)
    """
    # Look for base64-looking strings (alphanumeric + /+=, length divisible by 4)
    potential_base64 = re.findall(r'[A-Za-z0-9+/]{20,}={0,2}', text)

    for b64_str in potential_base64:
        if len(b64_str) % 4 != 0:
            continue

        try:
            decoded = base64.b64decode(b64_str).decode('utf-8', errors='ignore')
            # Check if decoded content contains injection patterns
            for pattern in _COMPILED_PATTERNS:
                if pattern.search(decoded):
                    return True, decoded
        except Exception:
            continue

    return False, ""


def sanitize_user_content(content: str | None) -> tuple[str, list[str]]:
    """Sanitize user content and detect injection attempts.

    Uses confusables library for homoglyph detection.

    Returns:
        Tuple of (sanitized_content, warnings)
    """
    if content is None:
        return "", []

    warnings: list[str] = []

    # Check length
    if len(content) > MAX_MESSAGE_LENGTH:
        content = content[:MAX_MESSAGE_LENGTH]
        warnings.append("Content truncated due to length limit")

    # Normalize unicode confusables first (defense against homoglyph attacks)
    content = _normalize_unicode(content)

    # Check for encoded injection attempts (base64, etc.)
    is_b64_suspicious, b64_decoded = _check_base64_injection(content)
    if is_b64_suspicious:
        warnings.append("Encoded prompt injection detected (base64)")
        content = "[ENCODED_INJECTION_BLOCKED]"
        return content, warnings

    # Check for explicit encoding instructions
    for pattern in _COMPILED_ENCODED_PATTERNS:
        if pattern.search(content):
            warnings.append("Suspicious encoding pattern detected")
            content = pattern.sub("[FILTERED]", content)

    # Check for injection patterns
    for pattern in _COMPILED_PATTERNS:
        if pattern.search(content):
            warnings.append("Potential prompt injection detected")
            content = pattern.sub("[FILTERED]", content)

    # Remove null bytes and control characters (except newlines)
    content = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", content)

    # Normalize excessive whitespace
    content = re.sub(r"\n{4,}", "\n\n\n", content)

    return content, warnings


def validate_tool_arguments(
    args: dict[str, Any], tool_name: str
) -> tuple[dict[str, Any], list[str]]:
    """Validate tool arguments for injection attempts.

    Returns:
        Tuple of (validated_args, warnings)
    """
    warnings: list[str] = []

    # Convert to string for size check
    args_str = str(args)
    if len(args_str) > MAX_TOOL_CALL_ARGUMENTS_SIZE:
        warnings.append(f"Tool '{tool_name}' arguments too large")
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
    """Quick check if content is safe without sanitizing.

    Returns:
        Tuple of (is_safe, warnings)
    """
    warnings: list[str] = []

    if len(content) > MAX_MESSAGE_LENGTH:
        warnings.append("Content exceeds maximum length")
        return False, warnings

    # Normalize unicode for checking
    normalized = _normalize_unicode(content)

    # Check base64 encoding
    is_b64_suspicious, _ = _check_base64_injection(normalized)
    if is_b64_suspicious:
        warnings.append("Encoded injection pattern detected")
        return False, warnings

    # Check encoded patterns
    for pattern in _COMPILED_ENCODED_PATTERNS:
        if pattern.search(normalized):
            warnings.append("Suspicious encoding pattern detected")
            return False, warnings

    # Check injection patterns
    for pattern in _COMPILED_PATTERNS:
        if pattern.search(normalized):
            warnings.append("Potential injection pattern detected")
            return False, warnings

    # Check for null bytes
    if "\x00" in content:
        warnings.append("Null bytes detected")
        return False, warnings

    return True, warnings


def sanitize_for_memory(content: str) -> str:
    """Sanitize content before storing in persistent memory.

    This provides defense against ASI06: Memory Poisoning.

    Uses nh3 library for HTML sanitization (fast, Rust-based).
    """
    if not content:
        return ""

    # Apply full sanitization
    sanitized, _ = sanitize_user_content(content)

    # HTML sanitization using nh3
    sanitized = nh3.clean(
        sanitized,
        tags=set(),  # No HTML tags allowed
        attributes={},  # No attributes
        url_schemes=set(),  # No URL schemes
    )

    return sanitized.strip()


def sanitize_db_content_for_llm(data: dict[str, Any] | list[Any] | str | None) -> Any:
    """Sanitize database content before sending to LLM.

    Prevents malicious content stored in DB (from user input) from
    affecting the LLM or causing XSS in frontend.

    Uses nh3 for HTML sanitization. Recursively processes dicts, lists, and strings.
    """
    if data is None:
        return None

    if isinstance(data, str):
        return sanitize_for_memory(data)

    if isinstance(data, list):
        return [sanitize_db_content_for_llm(item) for item in data]

    if isinstance(data, dict):
        return {key: sanitize_db_content_for_llm(value) for key, value in data.items()}

    return data
