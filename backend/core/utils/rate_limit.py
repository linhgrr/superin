"""In-memory tiered rate limiter for application endpoints."""

import time
from collections import defaultdict, deque
from typing import NamedTuple

class RateLimitCounter(NamedTuple):
    count: int
    reset_time: float


class TieredRateLimiter:
    """A flexible sliding window rate limiter that tracks multiple time windows."""

    def __init__(self):
        # Format: { user_id: { window_size: deque([timestamp1, timestamp2, ...]) } }
        self.requests: dict[str, dict[int, deque[float]]] = defaultdict(lambda: defaultdict(deque))

    def _cleanup_old_requests(self, now: float, key: str, window: int):
        """Remove timestamps older than the window from the left (oldest)."""
        dq = self.requests[key][window]
        while dq and now - dq[0] >= window:
            dq.popleft()

    def check_limit(self, key: str, limits: list[tuple[int, int]]) -> tuple[bool, str]:
        """
        Check if the key has exceeded any of the given limits.
        :param limits: List of tuples (max_requests, window_size_in_seconds)
        :return: (is_allowed, error_message - None if allowed)
        """
        now = time.time()
        
        # Validate all limits before registering
        for limit, window in limits:
            self._cleanup_old_requests(now, key, window)
            if len(self.requests[key][window]) >= limit:
                if window <= 60:
                    timeframe = "minute"
                elif window <= 3600:
                    timeframe = "hour"
                else:
                    timeframe = "day"
                return False, f"You have reached your limit of {limit} requests per {timeframe}."
                
        # Register the request for all windows since it passed
        for _, window in limits:
            self.requests[key][window].append(now)
            
        return True, ""

# Global instance for chat endpoints
chat_rate_limiter = TieredRateLimiter()
