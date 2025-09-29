"""Cost guard helpers to prevent runaway LLM spend."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import redis
from django.conf import settings


@dataclass
class CostGuardDecision:
    allowed: bool
    reason: str
    remaining_budget: float | None


class CostGuard:
    """Track spend per profile and determine if a request should be allowed."""

    def __init__(self, profile_budgets: dict[str, float]) -> None:
        self.profile_budgets = profile_budgets
        self.profile_usage: dict[str, float] = {profile: 0.0 for profile in profile_budgets}

    def _get_budget(self, profile: str) -> float | None:
        return self.profile_budgets.get(profile)

    def evaluate(self, profile: str, expected_cost: float) -> CostGuardDecision:
        budget = self._get_budget(profile)
        used = self.profile_usage.get(profile, 0.0)

        if budget is None:
            return CostGuardDecision(True, "no-budget", None)

        remaining = budget - used
        if expected_cost > remaining:
            return CostGuardDecision(False, "budget-exceeded", max(remaining, 0.0))

        return CostGuardDecision(True, "allowed", remaining - expected_cost)

    def record(self, profile: str, actual_cost: float) -> None:
        if profile not in self.profile_usage:
            self.profile_usage[profile] = 0.0
        self.profile_usage[profile] += actual_cost

    def remaining_budget(self, profile: str) -> float | None:
        budget = self._get_budget(profile)
        if budget is None:
            return None
        used = self.profile_usage.get(profile, 0.0)
        return max(budget - used, 0.0)


class RedisCostGuard(CostGuard):
    """Redis-backed cost guard that persists usage across restarts."""

    def __init__(
        self,
        profile_budgets: dict[str, float],
        redis_client: Optional[redis.Redis] = None,
        key_prefix: str = "cost_guard:",
        ttl_seconds: int = 86400,  # 24 hours default
    ) -> None:
        super().__init__(profile_budgets)
        self.redis_client = redis_client
        self.key_prefix = key_prefix
        self.ttl_seconds = ttl_seconds

        # If we have Redis, load existing usage from Redis
        if self.redis_client:
            for profile in profile_budgets:
                try:
                    usage = self.redis_client.get(f"{self.key_prefix}{profile}")
                    if usage is not None:
                        # Redis returns bytes, decode and convert to float
                        # Decode bytes to string if needed, then convert to float
                        decoded_usage = usage.decode() if isinstance(usage, bytes) else usage
                        self.profile_usage[profile] = float(decoded_usage)
                except Exception:
                    # If Redis fails, we'll fall back to in-memory
                    pass

    def evaluate(self, profile: str, expected_cost: float) -> CostGuardDecision:
        # Try to get fresh usage from Redis if available
        if self.redis_client:
            try:
                usage = self.redis_client.get(f"{self.key_prefix}{profile}")
                if usage is not None:
                    # Redis returns bytes, decode and convert to float
                    self.profile_usage[profile] = float(
                        usage.decode() if isinstance(usage, bytes) else usage
                    )
            except Exception:
                # Fall back to cached value if Redis fails
                pass

        return super().evaluate(profile, expected_cost)

    def record(self, profile: str, actual_cost: float) -> None:
        # Update in-memory first
        super().record(profile, actual_cost)

        # Persist to Redis if available
        if self.redis_client:
            try:
                key = f"{self.key_prefix}{profile}"
                # Use a pipeline to atomically increment and set TTL
                pipe = self.redis_client.pipeline()
                pipe.incrbyfloat(key, actual_cost)
                pipe.expire(key, self.ttl_seconds)
                pipe.execute()
            except Exception:
                # If Redis fails, we still have in-memory tracking
                pass

    def remaining_budget(self, profile: str) -> float | None:
        # Try to get fresh usage from Redis if available
        if self.redis_client:
            try:
                usage = self.redis_client.get(f"{self.key_prefix}{profile}")
                if usage is not None:
                    # Redis returns bytes, decode and convert to float
                    self.profile_usage[profile] = float(
                        usage.decode() if isinstance(usage, bytes) else usage
                    )
            except Exception:
                # Fall back to cached value if Redis fails
                pass

        return super().remaining_budget(profile)

    def reset_usage(self, profile: str) -> None:
        """Reset usage for a specific profile."""
        self.profile_usage[profile] = 0.0
        if self.redis_client:
            try:
                self.redis_client.delete(f"{self.key_prefix}{profile}")
            except Exception:
                pass


def get_cost_guard(profile_budgets: dict[str, float]) -> CostGuard:
    """Get a cost guard instance, using Redis if available."""
    redis_url = getattr(settings, "REDIS_URL", None)

    if redis_url:
        try:
            redis_client = redis.from_url(redis_url, decode_responses=True)
            # Test connection
            redis_client.ping()
            return RedisCostGuard(profile_budgets, redis_client)
        except Exception:
            # Fall back to in-memory if Redis is not available
            pass

    return CostGuard(profile_budgets)
