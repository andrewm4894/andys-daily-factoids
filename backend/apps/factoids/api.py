"""REST API endpoints for factoid functionality."""

from __future__ import annotations

import asyncio
import hashlib
import json
from typing import Any, Optional

from django.conf import settings
from django.db import IntegrityError
from django.db.models import F
from django.http import StreamingHttpResponse
from django.urls import include, path
from django.utils import timezone
from django.views import View
from rest_framework import generics, mixins, routers, status, viewsets
from rest_framework import serializers as drf_serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.services import CostGuard, InMemoryRateLimiter, RateLimitConfig, RateLimitExceeded
from apps.factoids import models, serializers
from apps.factoids.services import GenerationRequestPayload, OpenRouterClient

app_name = "factoids"

# Naive in-memory rate limiter for local development.
_rate_limiter = InMemoryRateLimiter()
_cost_guard = CostGuard({"anonymous": 1.0, "api_key": 5.0})


class RateLimitExceededError(Exception):
    def __init__(self, retry_after: float) -> None:
        self.retry_after = retry_after


class CostBudgetExceededError(Exception):
    def __init__(self, remaining: Optional[float]) -> None:
        self.remaining = remaining


class GenerationFailedError(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail


class FactoidPagination(PageNumberPagination):
    page_size = 20
    max_page_size = 50


class FactoidViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = models.Factoid.objects.order_by("-created_at")
    serializer_class = serializers.FactoidSerializer
    pagination_class = FactoidPagination


class FactoidGenerationSerializer(drf_serializers.Serializer):
    topic = drf_serializers.CharField(required=False, allow_blank=True)
    model_key = drf_serializers.CharField(required=False, allow_blank=True)
    temperature = drf_serializers.FloatField(required=False, min_value=0.0, max_value=2.0)


def _client_hash(request) -> str:
    raw = f"{request.META.get('REMOTE_ADDR', '')}:{request.META.get('HTTP_USER_AGENT', '')}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _apply_rate_limit(bucket: str, limit_conf: dict[str, Any]) -> None:
    per_minute = limit_conf.get("per_minute", 1)
    config = RateLimitConfig(window_seconds=60, limit=per_minute)
    _rate_limiter.check(bucket, config)


def _record_cost(profile: str, cost: float) -> None:
    if cost:
        _cost_guard.record(profile, cost)


def _perform_generation(
    *,
    topic: str,
    model_key: Optional[str],
    temperature: Optional[float],
    client_hash: str,
    profile: str = "anonymous",
) -> models.Factoid:
    limits = settings.RATE_LIMITS.get("factoids", {}).get(profile, {})
    try:
        _apply_rate_limit(f"generate:{client_hash}", limits)
    except RateLimitExceeded as exc:
        raise RateLimitExceededError(exc.retry_after) from exc

    decision = _cost_guard.evaluate(profile, expected_cost=0.1)
    if not decision.allowed:
        raise CostBudgetExceededError(decision.remaining_budget)

    resolved_model = model_key or "openai/gpt-4o-mini"

    generation_request = models.GenerationRequest.objects.create(
        client_hash=client_hash,
        request_source=models.RequestSource.MANUAL,
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

    client = OpenRouterClient(api_key=api_key, base_url=settings.OPENROUTER_BASE_URL)
    payload = GenerationRequestPayload(
        prompt=(
            "You are Andy's Daily Factoid generator. Provide a concise, mind-blowing fact about "
            f"{topic}. Respond as JSON with keys text, subject, emoji."
        ),
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

    _record_cost(profile, 0.1)
    return factoid


def _sse(event: str, data: dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode("utf-8")


class FactoidGenerationView(APIView):
    """Generate a new factoid using OpenRouter or fallback content."""

    def post(self, request, *args, **kwargs):
        serializer = FactoidGenerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client_hash = _client_hash(request)
        topic = serializer.validated_data.get("topic") or "something surprising"
        model_key = serializer.validated_data.get("model_key")
        temperature = serializer.validated_data.get("temperature")

        try:
            factoid = _perform_generation(
                topic=topic,
                model_key=model_key,
                temperature=temperature,
                client_hash=client_hash,
            )
        except RateLimitExceededError as exc:
            return Response(
                {"detail": "Rate limit exceeded", "retry_after": exc.retry_after},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except CostBudgetExceededError as exc:
            return Response(
                {"detail": "Cost budget exceeded", "remaining": exc.remaining},
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )
        except GenerationFailedError as exc:
            return Response({"detail": exc.detail}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(serializers.FactoidSerializer(factoid).data, status=status.HTTP_201_CREATED)


class FactoidVoteSerializer(drf_serializers.Serializer):
    vote = drf_serializers.ChoiceField(choices=models.VoteType.choices)


class FactoidVoteView(APIView):
    def post(self, request, pk: str) -> Response:
        serializer = FactoidVoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vote = serializer.validated_data["vote"]

        try:
            factoid = models.Factoid.objects.get(pk=pk)
        except models.Factoid.DoesNotExist:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        client_hash = _client_hash(request)
        try:
            models.VoteAggregate.objects.create(
                factoid=factoid,
                client_hash=client_hash,
                vote_type=vote,
            )
        except IntegrityError:
            return Response({"detail": "Already voted"}, status=status.HTTP_400_BAD_REQUEST)

        if vote == models.VoteType.UP:
            models.Factoid.objects.filter(pk=factoid.pk).update(votes_up=F("votes_up") + 1)
        else:
            models.Factoid.objects.filter(pk=factoid.pk).update(votes_down=F("votes_down") + 1)

        factoid.refresh_from_db()
        return Response(serializers.FactoidSerializer(factoid).data)


class FactoidFeedbackCreateView(generics.CreateAPIView):
    serializer_class = serializers.FactoidFeedbackSerializer
    queryset = models.FactoidFeedback.objects.all()


class FactoidGenerationStreamView(View):
    """Server-sent events stream for generation status."""

    def get(self, request, *args, **kwargs):
        topic = request.GET.get("topic") or "something surprising"
        model_key = request.GET.get("model_key") or None
        try:
            temperature = float(request.GET.get("temperature", ""))
        except ValueError:
            temperature = None

        client_hash = _client_hash(request)
        profile = "anonymous"

        def event_stream():
            yield _sse("status", {"state": "started"})
            try:
                factoid = _perform_generation(
                    topic=topic,
                    model_key=model_key,
                    temperature=temperature,
                    client_hash=client_hash,
                    profile=profile,
                )
            except RateLimitExceededError as exc:
                yield _sse(
                    "error",
                    {
                        "code": "rate_limit",
                        "retry_after": exc.retry_after,
                        "detail": "Rate limit exceeded",
                    },
                )
                return
            except CostBudgetExceededError as exc:
                yield _sse(
                    "error",
                    {
                        "code": "budget_exceeded",
                        "remaining": exc.remaining,
                        "detail": "Cost budget exceeded",
                    },
                )
                return
            except GenerationFailedError as exc:
                yield _sse("error", {"code": "generation_failed", "detail": exc.detail})
                return

            yield _sse("factoid", serializers.FactoidSerializer(factoid).data)

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class FactoidRateLimitStatusView(APIView):
    """Expose current rate limit and cost guard information."""

    def get(self, request, *args, **kwargs):
        profile = "anonymous"
        limits = settings.RATE_LIMITS.get("factoids", {}).get(profile, {})
        bucket_key = f"generate:{_client_hash(request)}"
        per_minute = limits.get("per_minute", 1)
        count = _rate_limiter.get_count(bucket_key)
        remaining_cost = _cost_guard.remaining_budget(profile)

        return Response(
            {
                "profile": profile,
                "rate_limit": {
                    "per_minute": per_minute,
                    "per_hour": limits.get("per_hour"),
                    "per_day": limits.get("per_day"),
                    "current_window_requests": count,
                },
                "cost_budget_remaining": remaining_cost,
            }
        )


class ModelListView(APIView):
    def get(self, request, *args, **kwargs):
        api_key = settings.OPENROUTER_API_KEY
        if not api_key:
            return Response({"models": []})

        client = OpenRouterClient(api_key=api_key, base_url=settings.OPENROUTER_BASE_URL)
        try:
            models_payload = asyncio.run(client.list_models())
        except Exception as exc:  # pragma: no cover - real API failure path
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({"models": [item.model_dump() for item in models_payload]})


router = routers.DefaultRouter()
router.register("", FactoidViewSet, basename="factoid")

urlpatterns = [
    path("generate/", FactoidGenerationView.as_view(), name="generate"),
    path("generate/stream/", FactoidGenerationStreamView.as_view(), name="generate-stream"),
    path("models/", ModelListView.as_view(), name="models"),
    path("feedback/", FactoidFeedbackCreateView.as_view(), name="feedback"),
    path("limits/", FactoidRateLimitStatusView.as_view(), name="limits"),
    path("<uuid:pk>/vote/", FactoidVoteView.as_view(), name="vote"),
    path("", include(router.urls)),
]
