"""Simplified factoid generation service using LangChain + PostHog callbacks."""

from __future__ import annotations

import random
from typing import Any, Optional

from django.conf import settings
from django.utils import timezone
from posthog import Posthog
from posthog.ai.langchain import CallbackHandler

from apps.core.posthog import get_posthog_client
from apps.core.services import CostGuard, RateLimitConfig, RateLimitExceeded, get_rate_limiter
from apps.factoids import models
from apps.factoids.prompts import build_factoid_generation_prompt
from apps.factoids.services.openrouter import (
    DEFAULT_FACTOID_MODEL,
    GenerationResult,
    fetch_openrouter_models,
    generate_factoid_completion,
    model_supports_tools,
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


def generate_factoid(
    *,
    topic: str,
    model_key: Optional[str],
    temperature: Optional[float],
    client_hash: str,
    profile: str = "anonymous",
    request_source: models.RequestSource = models.RequestSource.MANUAL,
    cost_guard: Optional[CostGuard] = None,
    posthog_distinct_id: Optional[str] = None,
    posthog_properties: Optional[dict[str, Any]] = None,
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

    resolved_model = _resolve_model_key(
        model_key,
        api_key=api_key,
        base_url=settings.OPENROUTER_BASE_URL,
    )

    generation_request = models.GenerationRequest.objects.create(
        client_hash=client_hash,
        request_source=request_source,
        model_key=resolved_model,
        parameters={"temperature": temperature},
        status=models.RequestStatus.RUNNING,
        started_at=timezone.now(),
    )

    recent_factoids = list(
        models.Factoid.objects.order_by("-created_at")[: settings.FACTOID_GENERATION_EXAMPLES_COUNT]
    )
    supports_tools = model_supports_tools(
        resolved_model,
        api_key=api_key,
        base_url=settings.OPENROUTER_BASE_URL,
    )

    prompt = build_factoid_generation_prompt(
        topic=topic if topic else None,
        recent_factoids=recent_factoids,
        num_examples=settings.FACTOID_GENERATION_EXAMPLES_COUNT,
        use_factoid_tool=supports_tools,
    )

    posthog_client = get_posthog_client()
    extra_properties: dict[str, Any] | None = None
    if isinstance(posthog_properties, dict):
        extra_properties = {k: v for k, v in posthog_properties.items()}

    callbacks = _build_callbacks(
        posthog_client,
        distinct_id=posthog_distinct_id or client_hash,
        trace_id=str(generation_request.id),
        topic=topic,
        profile=profile,
        request_source=request_source,
        extra_properties=extra_properties,
    )

    try:
        result = generate_factoid_completion(
            api_key=api_key,
            base_url=settings.OPENROUTER_BASE_URL,
            model=resolved_model,
            temperature=temperature,
            prompt=prompt,
            callbacks=callbacks,
            supports_tools=supports_tools,
        )
    except Exception as exc:  # pragma: no cover - external API failure
        generation_request.status = models.RequestStatus.FAILED
        generation_request.error_message = str(exc)
        generation_request.completed_at = timezone.now()
        generation_request.save(update_fields=["status", "error_message", "completed_at"])
        if posthog_client:
            error_properties = {
                "topic": topic,
                "profile": profile,
                "request_source": str(request_source),
                "generation_request_id": str(generation_request.id),
            }
            if extra_properties:
                error_properties.update(extra_properties)
            posthog_client.capture_exception(
                exc,
                distinct_id=posthog_distinct_id or client_hash,
                properties=error_properties,
            )
        raise GenerationFailedError("Failed to generate factoid") from exc

    factoid = _persist_factoid(result, resolved_model, generation_request)

    generation_request.status = models.RequestStatus.SUCCEEDED
    generation_request.completed_at = timezone.now()
    generation_request.actual_cost_usd = 0.1
    generation_request.save(update_fields=["status", "completed_at", "actual_cost_usd"])

    guard.record(profile, 0.1)
    return factoid


def _build_callbacks(
    posthog_client: Posthog | None,
    *,
    distinct_id: str,
    trace_id: str,
    topic: str,
    profile: str,
    request_source: models.RequestSource,
    extra_properties: Optional[dict[str, Any]] = None,
) -> list[CallbackHandler]:
    if not posthog_client:
        return []

    properties = {
        "topic": topic,
        "profile": profile,
        "request_source": str(request_source),
        "generation_request_id": trace_id,
    }
    if extra_properties:
        properties.update(extra_properties)

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


def _resolve_model_key(
    preferred_model: Optional[str],
    *,
    api_key: str,
    base_url: str,
) -> str:
    if preferred_model:
        return preferred_model

    random_model = _random_openrouter_model(api_key=api_key, base_url=base_url)
    if random_model:
        return random_model

    return DEFAULT_FACTOID_MODEL


def _random_openrouter_model(*, api_key: str, base_url: str) -> Optional[str]:
    try:
        models_payload = fetch_openrouter_models(api_key=api_key, base_url=base_url)
    except Exception:  # pragma: no cover - network/introspection failure
        return None

    candidates = [
        item.get("id")
        for item in models_payload
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    ]

    if not candidates:
        return None

    return random.choice(candidates)


__all__ = [
    "generate_factoid",
    "RateLimitExceededError",
    "CostBudgetExceededError",
    "GenerationFailedError",
]
