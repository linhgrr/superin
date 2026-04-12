"""Deprecated: Migrate to core.utils.limiter instead.

This module is kept for backwards compatibility during the transition to the
Redis-backed TieredRateLimiter in core.utils.limiter.

All in-memory rate limiting has been replaced with core.utils.limiter.tiered_limiter.
"""

# Re-export from new module so any stale imports don't break immediately
from core.utils.limiter import TieredRateLimiter  # noqa: F401
from core.utils.limiter import tiered_limiter as chat_rate_limiter

__all__ = ["TieredRateLimiter", "chat_rate_limiter"]
