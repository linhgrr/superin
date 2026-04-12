"""Unified rate limiting for Superin.

Strategy:
- When REDIS_URL is configured: uses fastapi-limiter (Redis-backed, multi-worker safe)
- When REDIS_URL is absent: falls back to in-memory sliding window (single-worker only)

The fallback allows local development without Redis while production always uses Redis.
Warn loudly if Redis is not set in non-HF-Space deployments.

Usage (in route handler):
    from core.utils.limiter import rate_limit

    @router.post("/my-endpoint")
    async def my_handler(
        request: Request,
        _: None = Depends(rate_limit(times=5, seconds=60, key="my-endpoint")),
    ):
        ...

Or for tiered limits via TieredRateLimiter.check():
    from core.utils.limiter import tiered_limiter

    allowed, err = await tiered_limiter.check(user_id, limits)
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Any

from fastapi import Depends, HTTPException, Request, status

logger = logging.getLogger(__name__)

# ─── In-Memory Fallback ───────────────────────────────────────────────────────


class _InMemorySlidingWindow:
    """Simple sliding-window counter.

    Thread-safety: asyncio single-threaded event loop — no lock needed.
    NOT safe across multiple workers/processes.
    """

    def __init__(self) -> None:
        # {key: {window_seconds: deque[timestamp]}}
        self._store: dict[str, dict[int, deque[float]]] = defaultdict(
            lambda: defaultdict(deque)
        )

    def _cleanup(self, key: str, window: int, now: float) -> None:
        dq = self._store[key][window]
        while dq and now - dq[0] >= window:
            dq.popleft()
        # Evict key entirely if all windows empty (prevent unbounded growth)
        if all(len(d) == 0 for d in self._store[key].values()):
            self._store.pop(key, None)

    def check_and_record(
        self, key: str, limits: list[tuple[int, int]]
    ) -> tuple[bool, str]:
        """Check limits and record the request if allowed.

        Args:
            key: Unique identifier (user_id, IP, etc.)
            limits: List of (max_requests, window_seconds)

        Returns:
            (is_allowed, error_message)
        """
        now = time.time()

        # Validate all windows before recording anything
        for limit, window in limits:
            self._cleanup(key, window, now)
            if len(self._store[key][window]) >= limit:
                timeframe = "minute" if window <= 60 else ("hour" if window <= 3600 else "day")
                return False, f"Rate limit exceeded: {limit} requests per {timeframe}."

        # All passed — record for all windows
        for _, window in limits:
            self._store[key][window].append(now)

        return True, ""

    def allow(self, key: str, limit: int, window: int = 60) -> bool:
        """Convenience single-limit check (backwards-compatible with InMemoryRateLimiter)."""
        allowed, _ = self.check_and_record(key, [(limit, window)])
        return allowed


# ─── Tiered Rate Limiter ──────────────────────────────────────────────────────


class TieredRateLimiter:
    """Redis-backed tiered rate limiter with in-memory fallback.

    Instantiated once per process. Redis client is acquired lazily after
    init_redis() is called during lifespan startup.
    """

    def __init__(self) -> None:
        self._redis: Any | None = None
        self._fallback = _InMemorySlidingWindow()
        self._redis_available = False

    def set_redis(self, redis_client: Any) -> None:
        """Wire in the Redis client. Called during lifespan startup."""
        self._redis = redis_client
        self._redis_available = True

    async def check(
        self,
        key: str,
        limits: list[tuple[int, int]],
    ) -> tuple[bool, str]:
        """Check if key is within all specified rate limits.

        Args:
            key: Unique identifier (user_id, IP-email pair, etc.)
            limits: List of (max_requests, window_seconds)

        Returns:
            (is_allowed, error_message)
        """
        if self._redis_available and self._redis is not None:
            return await self._check_redis(key, limits)
        return self._fallback.check_and_record(key, limits)

    async def _check_redis(
        self,
        key: str,
        limits: list[tuple[int, int]],
    ) -> tuple[bool, str]:
        """Redis sliding window implementation using sorted sets + pipelining."""
        now_ms = int(time.time() * 1000)

        try:
            async with self._redis.pipeline(transaction=True) as pipe:
                for limit, window in limits:
                    redis_key = f"rl:{key}:{window}"
                    cutoff = now_ms - (window * 1000)
                    # Remove expired entries, count remaining, add current
                    pipe.zremrangebyscore(redis_key, 0, cutoff)
                    pipe.zcard(redis_key)
                    pipe.zadd(redis_key, {f"{now_ms}-{id(pipe)}": now_ms})
                    pipe.expire(redis_key, window + 1)

                results = await pipe.execute()

            # Parse results — every 4 commands = [zremrangebyscore, zcard, zadd, expire]
            for i, (limit, window) in enumerate(limits):
                card = results[i * 4 + 1]  # zcard result
                if card >= limit:
                    timeframe = (
                        "minute" if window <= 60 else ("hour" if window <= 3600 else "day")
                    )
                    return False, f"Rate limit exceeded: {limit} requests per {timeframe}."

            return True, ""

        except Exception:
            logger.warning(
                "Redis rate limit check failed, falling back to in-memory",
                exc_info=True,
            )
            self._redis_available = False
            return self._fallback.check_and_record(key, limits)


# ─── fastapi-limiter integration ─────────────────────────────────────────────

def rate_limit(*, times: int, seconds: int, key_prefix: str = "default") -> Any:
    """FastAPI dependency factory for rate limiting.

    Uses the global `tiered_limiter` (Redis when available, in-memory fallback).
    Key is composed of: `{key_prefix}:{client_ip}`.

    Example::

        @router.post("/login")
        async def login(
            _: None = Depends(rate_limit(times=5, seconds=60, key_prefix="login")),
            request: Request,
        ):
            ...
    """
    async def dependency(request: Request) -> None:
        client_ip = (
            request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown")
        )
        key = f"{key_prefix}:{client_ip}"
        # Delegate to tiered_limiter — uses Redis pipeline when available
        allowed, err = await tiered_limiter.check(key, [(times, seconds)])
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=err or "Too many requests. Please slow down.",
            )

    return Depends(dependency)


# ─── Redis client accessor ────────────────────────────────────────────────────

_redis_client: Any | None = None


def set_redis_client(client: Any) -> None:
    """Store the global Redis client. Called during lifespan init."""
    global _redis_client
    _redis_client = client


def get_redis_client() -> Any | None:
    """Return the global Redis client, or None if not initialized."""
    return _redis_client


def _get_redis_client() -> Any | None:
    return _redis_client


# ─── Singletons ──────────────────────────────────────────────────────────────

# Shared tiered limiter instance — used for ALL rate limiting (chat, login, webhooks)
# Redis-backed when REDIS_URL is set; in-memory fallback for local dev.
tiered_limiter = TieredRateLimiter()


async def check_login_rate(
    ip: str,
    email: str,
    limit: int,
    window_seconds: int = 60,
) -> tuple[bool, str]:
    """Check login rate limit by IP+email dual key via tiered_limiter.

    Fix2: Previously used a bare `_InMemorySlidingWindow` instance which was
    always in-memory and bypassed with N workers (N × limit attempts per window).
    Now delegates to `tiered_limiter` so Redis is used when available.
    """
    key = f"login:{ip}:{email}"
    return await tiered_limiter.check(key, [(limit, window_seconds)])


# Kept for backwards-compat with any code that still imports `login_limiter`.
# Callers should migrate to check_login_rate() which is async and Redis-aware.
login_limiter = _InMemorySlidingWindow()
