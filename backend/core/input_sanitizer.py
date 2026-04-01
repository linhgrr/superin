"""Input sanitization and validation for AI agent security.

Provides defense against:
- ASI01: Agent Goal Hijacking (prompt injection)
- ASI06: Memory Poisoning via malicious content
"""

from __future__ import annotations

import re
from typing import Any

# Patterns commonly used in prompt injection attacks
PROMPT_INJECTION_PATTERNS = [
    # Ignore previous instructions
    r"ignore\s+(?:all\s+|previous\s+)?(?:instruction|command|prompt)s?",
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
]

# Compiled regex patterns for efficiency
_COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in PROMPT_INJECTION_PATTERNS]

# Maximum content lengths to prevent DoS
MAX_MESSAGE_LENGTH = 10000  # characters
MAX_TOOL_CALL_ARGUMENTS_SIZE = 5000  # JSON characters


def sanitize_user_content(content: str | None) -> tuple[str, list[str]]:
    """Sanitize user content and detect injection attempts.

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

    # Check for injection patterns
    for pattern in _COMPILED_PATTERNS:
        if pattern.search(content):
            warnings.append("Potential prompt injection detected")
            # Replace the matched content with placeholder
            content = pattern.sub("[FILTERED]", content)

    # Remove null bytes and control characters (except newlines)
    content = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", content)

    # Normalize excessive whitespace
    content = re.sub(r"\n{4,}", "\n\n\n", content)

    return content, warnings


def validate_tool_arguments(args: dict[str, Any], tool_name: str) -> tuple[dict[str, Any], list[str]]:
    """Validate tool arguments for injection attempts.

    Returns:
        Tuple of (validated_args, warnings)
    """
    warnings: list[str] = []

    # Convert to string for size check
    args_str = str(args)
    if len(args_str) > MAX_TOOL_CALL_ARGUMENTS_SIZE:
        warnings.append(f"Tool '{tool_name}' arguments too large")
        # Truncate string arguments
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

    for pattern in _COMPILED_PATTERNS:
        if pattern.search(content):
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
    """
    if not content:
        return ""

    # Apply full sanitization
    sanitized, _ = sanitize_user_content(content)

    # Additional memory-specific protections:
    # Remove potential markdown/HTML that could be rendered maliciously
    # but preserve the content meaning

    # Remove script tags and similar dangerous content
    sanitized = re.sub(r"<script[^>]*>.*?</script>", "", sanitized, flags=re.IGNORECASE | re.DOTALL)
    sanitized = re.sub(r"javascript:", "", sanitized, flags=re.IGNORECASE)

    return sanitized.strip()
