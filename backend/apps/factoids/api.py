"""REST API endpoints for factoid functionality."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from django.conf import settings
from django.db.models import F
from django.http import StreamingHttpResponse
from django.urls import include, path
from django.views import View
from rest_framework import generics, mixins, routers, status, viewsets
from rest_framework import serializers as drf_serializers
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.services import (
    CostGuard,
    RateLimitConfig,
    RateLimitExceeded,
    get_rate_limiter,
)
from apps.factoids import models, serializers
from apps.factoids.services.generator import (
    CostBudgetExceededError,
    GenerationFailedError,
    RateLimitExceededError,
    generate_factoid,
)
from apps.factoids.services.openrouter import fetch_openrouter_models

app_name = "factoids"

# Rate limiter (Redis when available, fallback to in-memory).
_rate_limiter = get_rate_limiter()
_cost_guard = CostGuard({"anonymous": 1.0, "api_key": 5.0})


class FactoidPagination(PageNumberPagination):
    page_size = 20
    max_page_size = 50


class FactoidViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = models.Factoid.objects.order_by("-created_at")
    serializer_class = serializers.FactoidSerializer
    pagination_class = FactoidPagination

    @action(detail=False, methods=["get"], url_path="random")
    def random(self, request):
        try:
            limit = int(request.query_params.get("limit", 50))
        except (TypeError, ValueError):
            limit = 50

        limit = max(1, min(limit, 100))
        factoids = models.Factoid.objects.order_by("?")[:limit]
        serializer = self.get_serializer(factoids, many=True)
        return Response({"results": serializer.data})


class FactoidGenerationSerializer(drf_serializers.Serializer):
    topic = drf_serializers.CharField(required=False, allow_blank=True)
    model_key = drf_serializers.CharField(required=False, allow_blank=True)
    temperature = drf_serializers.FloatField(required=False, min_value=0.0, max_value=2.0)
    posthog_distinct_id = drf_serializers.CharField(required=False, allow_blank=True)
    posthog_properties = drf_serializers.JSONField(required=False)


def _client_hash(request) -> str:
    raw = f"{request.META.get('REMOTE_ADDR', '')}:{request.META.get('HTTP_USER_AGENT', '')}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


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
        posthog_distinct_id = serializer.validated_data.get("posthog_distinct_id") or None
        posthog_properties = serializer.validated_data.get("posthog_properties") or None

        try:
            factoid = generate_factoid(
                topic=topic,
                model_key=model_key,
                temperature=temperature,
                client_hash=client_hash,
                cost_guard=_cost_guard,
                posthog_distinct_id=posthog_distinct_id,
                posthog_properties=posthog_properties,
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
    rate_limit_config = RateLimitConfig(window_seconds=60, limit=50)

    def post(self, request, pk: str) -> Response:
        serializer = FactoidVoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vote = serializer.validated_data["vote"]

        try:
            factoid = models.Factoid.objects.get(pk=pk)
        except models.Factoid.DoesNotExist:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        client_hash = _client_hash(request)
        bucket = f"factoid_vote:{client_hash}"
        try:
            _rate_limiter.check(bucket, self.rate_limit_config)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": "Vote rate limit exceeded", "retry_after": exc.retry_after},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        models.VoteAggregate.objects.create(
            factoid=factoid,
            client_hash=client_hash,
            vote_type=vote,
        )

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

        posthog_distinct_id = request.GET.get("posthog_distinct_id") or None
        raw_posthog_properties = request.GET.get("posthog_properties")
        posthog_properties = None
        if raw_posthog_properties:
            try:
                posthog_properties = json.loads(raw_posthog_properties)
            except json.JSONDecodeError:
                posthog_properties = None

        def event_stream():
            yield _sse("status", {"state": "started"})
            try:
                factoid = generate_factoid(
                    topic=topic,
                    model_key=model_key,
                    temperature=temperature,
                    client_hash=client_hash,
                    profile=profile,
                    request_source=models.RequestSource.MANUAL,
                    cost_guard=_cost_guard,
                    posthog_distinct_id=posthog_distinct_id,
                    posthog_properties=posthog_properties,
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

        try:
            models_payload = fetch_openrouter_models(
                api_key=api_key,
                base_url=settings.OPENROUTER_BASE_URL,
            )
        except Exception as exc:  # pragma: no cover - real API failure path
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({"models": models_payload})


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
