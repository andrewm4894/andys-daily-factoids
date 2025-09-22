"""Factoid generation service shared across API, CLI, and scheduled tasks."""

from __future__ import annotations

import asyncio
import random
from typing import Optional

from django.conf import settings
from django.utils import timezone

try:
    from posthog import Posthog
    POSTHOG_AVAILABLE = True
except ImportError:
    POSTHOG_AVAILABLE = False
    Posthog = None

from apps.core.services import CostGuard, RateLimitConfig, RateLimitExceeded, get_rate_limiter
from apps.factoids import models
from apps.factoids.prompts import build_factoid_generation_prompt
from apps.factoids.services.openrouter import GenerationRequestPayload, OpenRouterClient


class RateLimitExceededError(Exception):
    def __init__(self, retry_after: float) -> None:
        self.retry_after = retry_after


class CostBudgetExceededError(Exception):
    def __init__(self, remaining: Optional[float]) -> None:
        self.remaining = remaining


class GenerationFailedError(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail


def generate_factoid(
    *,
    topic: str,
    model_key: Optional[str],
    temperature: Optional[float],
    client_hash: str,
    profile: str = "anonymous",
    request_source: models.RequestSource = models.RequestSource.MANUAL,
    cost_guard: Optional[CostGuard] = None,
) -> models.Factoid:
    rate_limiter = get_rate_limiter()
    limits = settings.RATE_LIMITS.get("factoids", {}).get(profile, {})
    try:
        per_minute_limit = limits.get("per_minute", 1)
        rate_limiter.check(
            f"generate:{client_hash}",
            RateLimitConfig(window_seconds=60, limit=per_minute_limit),
        )
    except RateLimitExceeded as exc:
        raise RateLimitExceededError(exc.retry_after) from exc

    guard = cost_guard or CostGuard({"anonymous": 1.0, "api_key": 5.0})
    decision = guard.evaluate(profile, expected_cost=0.1)
    if not decision.allowed:
        raise CostBudgetExceededError(decision.remaining_budget)

    if model_key:
        resolved_model = model_key
    else:
        # Randomly select a model from OpenRouter's available models
        client = OpenRouterClient(api_key=settings.OPENROUTER_API_KEY, base_url=settings.OPENROUTER_BASE_URL)
        try:
            available_models = asyncio.run(client.list_models())
            if available_models:
                resolved_model = random.choice(available_models).id
            else:
                resolved_model = "openai/gpt-4o-mini"  # fallback
        except Exception:
            resolved_model = "openai/gpt-4o-mini"  # fallback on API error

    generation_request = models.GenerationRequest.objects.create(
        client_hash=client_hash,
        request_source=request_source,
        model_key=resolved_model,
        parameters={"temperature": temperature},
    )

    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        factoid = models.Factoid.objects.create(
            text=f"Did you know that {topic} can be fascinating even without an API key?",
            subject=topic.title()[:255],
            emoji="🤖",
            created_by=generation_request,
            generation_metadata={"model": "stub"},
        )
        generation_request.status = models.RequestStatus.SUCCEEDED
        generation_request.completed_at = timezone.now()
        generation_request.actual_cost_usd = 0
        generation_request.save(update_fields=["status", "completed_at", "actual_cost_usd"])
        return factoid

    # Get recent factoids for context
    recent_factoids = list(models.Factoid.objects.order_by('-created_at')[:10])
    
    # Build comprehensive prompt
    prompt = build_factoid_generation_prompt(
        topic=topic if topic else None,
        recent_factoids=recent_factoids,
        num_examples=5,
    )
    
    # Initialize PostHog client for LLM analytics
    posthog_client = None
    if POSTHOG_AVAILABLE:
        posthog_api_key = getattr(settings, 'POSTHOG_PROJECT_API_KEY', None)
        posthog_host = getattr(settings, 'POSTHOG_HOST', 'https://us.i.posthog.com')
        if posthog_api_key:
            posthog_client = Posthog(posthog_api_key, host=posthog_host)
    
    client = OpenRouterClient(
        api_key=api_key, 
        base_url=settings.OPENROUTER_BASE_URL,
        posthog_client=posthog_client
    )
    payload = GenerationRequestPayload(
        prompt=prompt,
        model=resolved_model,
        temperature=temperature,
    )

    try:
        result = asyncio.run(client.generate_factoid(payload))
    except Exception as exc:  # pragma: no cover - real API failure path
        generation_request.status = models.RequestStatus.FAILED
        generation_request.error_message = str(exc)
        generation_request.completed_at = timezone.now()
        generation_request.save(update_fields=["status", "error_message", "completed_at"])
        raise GenerationFailedError("Failed to generate factoid") from exc

    factoid = models.Factoid.objects.create(
        text=result.text,
        subject=result.subject[:255],
        emoji=result.emoji[:16],
        created_by=generation_request,
        generation_metadata={"model": resolved_model, "raw": result.raw},
    )
    generation_request.status = models.RequestStatus.SUCCEEDED
    generation_request.completed_at = timezone.now()
    generation_request.actual_cost_usd = 0.1
    generation_request.save(
        update_fields=[
            "status",
            "completed_at",
            "actual_cost_usd",
        ]
    )

    guard.record(profile, 0.1)
    return factoid


__all__ = [
    "generate_factoid",
    "RateLimitExceededError",
    "CostBudgetExceededError",
    "GenerationFailedError",
]
