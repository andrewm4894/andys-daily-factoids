"""Simple in-memory rate limiter for local development and testing."""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass


@dataclass
class RateLimitConfig:
    window_seconds: int
    limit: int


class RateLimitExceeded(Exception):
    def __init__(self, retry_after: float) -> None:
        super().__init__("Rate limit exceeded")
        self.retry_after = retry_after


class InMemoryRateLimiter:
    """A naive in-memory rate limiter suitable for tests and local dev."""

    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = {}

    def check(self, bucket: str, config: RateLimitConfig) -> None:
        now = time.time()
        window_start = now - config.window_seconds
        entries = self._buckets.setdefault(bucket, deque())

        while entries and entries[0] < window_start:
            entries.popleft()

        if len(entries) >= config.limit:
            retry_after = max(entries[0] + config.window_seconds - now, 0.0)
            raise RateLimitExceeded(retry_after)

        entries.append(now)

    def get_count(self, bucket: str) -> int:
        entries = self._buckets.get(bucket)
        return len(entries) if entries is not None else 0
