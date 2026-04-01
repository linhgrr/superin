"""HTTP middleware for request logging and rate limiting."""

import logging
import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from core.constants import RATE_LIMIT_CHAT, RATE_LIMIT_DEFAULT, RATE_LIMIT_LOGIN

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every request with method, path, status code, and duration."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "%s %s → %d (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response


class InMemoryRateLimiter:
    """In-memory rate limiter per client ID using a sliding window.

    Usage:
        limiter = InMemoryRateLimiter(requests_per_minute=60)
        if not limiter.allow(client_id):
            raise HTTPException(429)
    """

    def __init__(self, requests_per_minute: int = 60) -> None:
        self._limit = requests_per_minute
        self._window: dict[str, list[float]] = defaultdict(list)

    def allow(self, client_id: str) -> bool:
        now = time.time()
        cutoff = now - 60
        self._window[client_id] = [t for t in self._window[client_id] if t > cutoff]
        if len(self._window[client_id]) >= self._limit:
            return False
        self._window[client_id].append(now)
        return True


# Pre-configured singleton limiters
login_limiter = InMemoryRateLimiter(requests_per_minute=RATE_LIMIT_LOGIN)
chat_limiter = InMemoryRateLimiter(requests_per_minute=RATE_LIMIT_CHAT)
global_limiter = InMemoryRateLimiter(requests_per_minute=RATE_LIMIT_DEFAULT)
