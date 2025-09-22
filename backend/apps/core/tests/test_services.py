"""Tests for core service helpers."""

from apps.core.services import (
    CostGuard,
    CostGuardDecision,
    InMemoryRateLimiter,
    RateLimitConfig,
    RateLimitExceeded,
    generate_api_key,
    verify_api_key,
)


def test_generate_api_key_round_trip(settings):
    settings.SECRET_KEY = "secret"
    generated = generate_api_key(prefix="test", length=16)

    assert generated.plain_key.startswith("test_")
    assert verify_api_key(generated.plain_key, generated.hashed_key)


def test_cost_guard_budget_enforcement():
    guard = CostGuard({"default": 1.0})
    decision = guard.evaluate("default", expected_cost=0.6)
    assert isinstance(decision, CostGuardDecision)
    assert decision.allowed is True
    guard.record("default", actual_cost=0.6)

    blocked = guard.evaluate("default", expected_cost=0.5)
    assert blocked.allowed is False


def test_in_memory_rate_limiter_allows_within_limit():
    limiter = InMemoryRateLimiter()
    config = RateLimitConfig(window_seconds=60, limit=2)

    limiter.check("bucket", config)
    limiter.check("bucket", config)

    try:
        limiter.check("bucket", config)
    except RateLimitExceeded as exc:
        assert exc.retry_after >= 0.0
    else:
        raise AssertionError("Expected rate limit to be exceeded")
