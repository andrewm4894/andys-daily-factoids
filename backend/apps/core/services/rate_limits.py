"""Rate limiting utilities with Redis support."""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass
from typing import Optional

from django.conf import settings

logger = logging.getLogger(__name__)

try:
    import redis
except ImportError:  # pragma: no cover - optional dependency
    redis = None


@dataclass
class RateLimitConfig:
    window_seconds: int
    limit: int


class RateLimitExceeded(Exception):
    def __init__(self, retry_after: float) -> None:
        super().__init__("Rate limit exceeded")
        self.retry_after = retry_after


class BaseRateLimiter(ABC):
    @abstractmethod
    def check(self, bucket: str, config: RateLimitConfig) -> None: ...

    @abstractmethod
    def get_count(self, bucket: str) -> int: ...

    def reset(self) -> None:  # pragma: no cover - optional
        """Reset limiter state (only used in tests for in-memory implementation)."""
        # Default no-op


class InMemoryRateLimiter(BaseRateLimiter):
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

    def reset(self) -> None:  # pragma: no cover - simple helper for tests
        self._buckets.clear()


class RedisRateLimiter(BaseRateLimiter):
    """Sliding-window rate limiter backed by Redis sorted sets."""

    def __init__(self, client: "redis.Redis") -> None:
        self.client = client

    def _key(self, bucket: str, window: int) -> str:
        return f"rate:{bucket}:{window}"

    def check(self, bucket: str, config: RateLimitConfig) -> None:
        key = self._key(bucket, config.window_seconds)
        now = time.time()
        window_start = now - config.window_seconds

        try:
            with self.client.pipeline() as pipe:
                pipe.zremrangebyscore(key, 0, window_start)
                pipe.zcard(key)
                removed_count, current_count = pipe.execute()
        except Exception as exc:  # pragma: no cover - connection issues
            logger.warning("Redis rate limiter failed (%s); falling back to in-memory", exc)
            raise RateLimitExceeded(0.0) from exc

        if current_count >= config.limit:
            oldest = self.client.zrange(key, 0, 0, withscores=True)
            retry_after = 0.0
            if oldest:
                retry_after = max(oldest[0][1] + config.window_seconds - now, 0.0)
            raise RateLimitExceeded(retry_after)

        # Record current timestamp
        with self.client.pipeline() as pipe:
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, config.window_seconds)
            pipe.execute()

    def get_count(self, bucket: str) -> int:
        try:
            return int(self.client.zcard(self._key(bucket, 60)))
        except Exception:  # pragma: no cover - connection issues
            return 0


_rate_limiter_singleton: Optional[BaseRateLimiter] = None


def build_rate_limiter() -> BaseRateLimiter:
    redis_url = getattr(settings, "REDIS_URL", None)
    if redis_url and redis is not None:
        try:
            client = redis.Redis.from_url(redis_url, decode_responses=False)
            client.ping()
            logger.info("Using Redis rate limiter at %s", redis_url)
            return RedisRateLimiter(client)
        except Exception as exc:
            logger.warning("Could not initialize Redis rate limiter: %s", exc)

    logger.info("Using in-memory rate limiter")
    return InMemoryRateLimiter()


def get_rate_limiter() -> BaseRateLimiter:
    global _rate_limiter_singleton
    if _rate_limiter_singleton is None:
        _rate_limiter_singleton = build_rate_limiter()
    return _rate_limiter_singleton


__all__ = [
    "RateLimitConfig",
    "RateLimitExceeded",
    "InMemoryRateLimiter",
    "RedisRateLimiter",
    "get_rate_limiter",
]
