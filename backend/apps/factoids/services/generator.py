"""Simplified factoid generation service using LangChain + PostHog callbacks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from django.conf import settings
from django.utils import timezone
from posthog import Posthog
from posthog.ai.langchain import CallbackHandler

from apps.core.services import CostGuard, RateLimitConfig, RateLimitExceeded, get_rate_limiter
from apps.factoids import models
from apps.factoids.prompts import build_factoid_generation_prompt
from apps.factoids.services.openrouter import (
    DEFAULT_FACTOID_MODEL,
    GenerationResult,
    generate_factoid_completion,
)


class RateLimitExceededError(Exception):
    def __init__(self, retry_after: float) -> None:
        self.retry_after = retry_after


class CostBudgetExceededError(Exception):
    def __init__(self, remaining: Optional[float]) -> None:
        self.remaining = remaining


class GenerationFailedError(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail


@dataclass
class _PosthogContext:
    client: Posthog | None

    def flush(self) -> None:
        if not self.client:
            return
        try:
            self.client.flush()
        finally:
            self.client.shutdown()


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

    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        raise GenerationFailedError("OpenRouter API key is not configured")

    resolved_model = model_key or DEFAULT_FACTOID_MODEL

    generation_request = models.GenerationRequest.objects.create(
        client_hash=client_hash,
        request_source=request_source,
        model_key=resolved_model,
        parameters={"temperature": temperature},
        status=models.RequestStatus.RUNNING,
        started_at=timezone.now(),
    )

    recent_factoids = list(models.Factoid.objects.order_by("-created_at")[:10])
    prompt = build_factoid_generation_prompt(
        topic=topic if topic else None,
        recent_factoids=recent_factoids,
        num_examples=5,
    )

    posthog_context = _build_posthog_client()
    callbacks = _build_callbacks(
        posthog_context.client,
        distinct_id=client_hash,
        trace_id=str(generation_request.id),
        topic=topic,
        profile=profile,
        request_source=request_source,
    )

    try:
        result = generate_factoid_completion(
            api_key=api_key,
            base_url=settings.OPENROUTER_BASE_URL,
            model=resolved_model,
            temperature=temperature,
            prompt=prompt,
            callbacks=callbacks,
        )
    except Exception as exc:  # pragma: no cover - external API failure
        generation_request.status = models.RequestStatus.FAILED
        generation_request.error_message = str(exc)
        generation_request.completed_at = timezone.now()
        generation_request.save(update_fields=["status", "error_message", "completed_at"])
        if posthog_context.client:
            posthog_context.client.capture_exception(
                exc,
                distinct_id=client_hash,
                properties={
                    "topic": topic,
                    "profile": profile,
                    "request_source": request_source,
                    "generation_request_id": str(generation_request.id),
                },
            )
        posthog_context.flush()
        raise GenerationFailedError("Failed to generate factoid") from exc

    factoid = _persist_factoid(result, resolved_model, generation_request)

    generation_request.status = models.RequestStatus.SUCCEEDED
    generation_request.completed_at = timezone.now()
    generation_request.actual_cost_usd = 0.1
    generation_request.save(
        update_fields=["status", "completed_at", "actual_cost_usd"]
    )

    guard.record(profile, 0.1)
    posthog_context.flush()
    return factoid


def _build_posthog_client() -> _PosthogContext:
    api_key = getattr(settings, "POSTHOG_PROJECT_API_KEY", None)
    if not api_key:
        return _PosthogContext(client=None)
    host = getattr(settings, "POSTHOG_HOST", "https://us.i.posthog.com")
    client = Posthog(api_key, host=host)
    return _PosthogContext(client=client)


def _build_callbacks(
    posthog_client: Posthog | None,
    *,
    distinct_id: str,
    trace_id: str,
    topic: str,
    profile: str,
    request_source: models.RequestSource,
) -> list[CallbackHandler]:
    if not posthog_client:
        return []

    properties = {
        "topic": topic,
        "profile": profile,
        "request_source": str(request_source),
        "generation_request_id": trace_id,
    }

    callback = CallbackHandler(
        client=posthog_client,
        distinct_id=distinct_id,
        trace_id=trace_id,
        properties=properties,
        groups={"profile": profile} if profile else None,
    )
    return [callback]


def _persist_factoid(
    result: GenerationResult,
    model_key: str,
    generation_request: models.GenerationRequest,
) -> models.Factoid:
    factoid = models.Factoid.objects.create(
        text=result.text,
        subject=result.subject[:255],
        emoji=result.emoji[:16],
        created_by=generation_request,
        generation_metadata={"model": model_key, "raw": result.raw},
    )
    return factoid


__all__ = [
    "generate_factoid",
    "RateLimitExceededError",
    "CostBudgetExceededError",
    "GenerationFailedError",
]
