"""REST API endpoints for Stripe payments."""

from __future__ import annotations

import hashlib
from decimal import Decimal
from typing import Any, Optional

import stripe
from django.conf import settings
from django.urls import path
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from stripe.error import StripeError

from apps.factoids import models as factoid_models
from apps.factoids import serializers as factoid_serializers
from apps.factoids.services.generator import (
    CostBudgetExceededError,
    GenerationFailedError,
    RateLimitExceededError,
    generate_factoid,
)
from apps.payments import models
from apps.payments.services import get_payment_gateway

app_name = "payments"


def _client_hash(request) -> str:
    raw = f"{request.META.get('REMOTE_ADDR', '')}:{request.META.get('HTTP_USER_AGENT', '')}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class CheckoutSessionSerializer(serializers.Serializer):
    success_url = serializers.URLField(required=False)
    cancel_url = serializers.URLField(required=False)
    source = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.JSONField(required=False)

    def validate_metadata(self, value: Any) -> dict[str, Any]:
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Metadata must be an object")
        return value


class CheckoutCompletionSerializer(serializers.Serializer):
    topic = serializers.CharField(required=False, allow_blank=True)
    model_key = serializers.CharField(required=False, allow_blank=True)


class CheckoutSessionCreateView(APIView):
    """Create a Stripe Checkout session for unlocking additional usage."""

    def post(self, request, *args, **kwargs):
        gateway = get_payment_gateway()
        if gateway is None:
            return Response(
                {"detail": "Payments are not configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        serializer = CheckoutSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        client_hash = _client_hash(request)
        success_url = serializer.validated_data.get("success_url") or getattr(
            settings, "STRIPE_SUCCESS_URL", None
        )
        cancel_url = serializer.validated_data.get("cancel_url") or getattr(
            settings, "STRIPE_CANCEL_URL", success_url
        )

        if not success_url or not cancel_url:
            return Response(
                {"detail": "Stripe checkout URLs are not configured"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        metadata = serializer.validated_data.get("metadata", {}) or {}
        metadata.setdefault("client_hash", client_hash)
        source = serializer.validated_data.get("source")
        if source:
            metadata["source"] = source

        try:
            session = gateway.create_checkout_session(
                success_url=success_url,
                cancel_url=cancel_url,
                client_reference_id=client_hash,
                metadata=metadata,
            )
        except ValueError as exc:  # configuration issues
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except StripeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        amount_cents = getattr(session, "amount_subtotal", None)
        if amount_cents is None:
            amount_cents = getattr(session, "amount_total", None)
        if amount_cents is None:
            amount_cents = gateway.default_amount_cents

        amount = (Decimal(amount_cents or 0) / Decimal("100")).quantize(Decimal("0.01"))
        currency = getattr(session, "currency", None) or gateway.currency

        models.PaymentSession.objects.create(
            stripe_session_id=session.id,
            client_hash=client_hash,
            amount=amount,
            currency=currency,
            metadata=metadata,
        )

        return Response(
            {
                "session_id": session.id,
                "checkout_url": getattr(session, "url", None),
                "publishable_key": getattr(settings, "STRIPE_PUBLISHABLE_KEY", None),
            },
            status=status.HTTP_201_CREATED,
        )


def _get_factoid_from_payment_session(
    payment_session: models.PaymentSession,
) -> Optional[factoid_models.Factoid]:
    if payment_session.requested_generation_id:
        generation = payment_session.requested_generation
        if generation is not None:
            factoid = generation.factoids.order_by("-created_at").first()
            if factoid is not None:
                return factoid

    metadata = payment_session.metadata or {}
    factoid_id = metadata.get("factoid_id")
    if factoid_id:
        try:
            return factoid_models.Factoid.objects.get(pk=factoid_id)
        except factoid_models.Factoid.DoesNotExist:  # pragma: no cover - defensive
            return None

    return None


class CheckoutSessionCompleteView(APIView):
    """Fulfill a completed checkout session by generating a paid factoid."""

    def post(self, request, session_id: str, *args, **kwargs):
        gateway = get_payment_gateway()
        if gateway is None:
            return Response(
                {"detail": "Payments are not configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            payment_session = models.PaymentSession.objects.select_related(
                "requested_generation"
            ).get(stripe_session_id=session_id)
        except models.PaymentSession.DoesNotExist:
            return Response(
                {"detail": "Checkout session not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = CheckoutCompletionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        existing_factoid = _get_factoid_from_payment_session(payment_session)
        if (
            payment_session.status == models.PaymentStatus.COMPLETED
            and existing_factoid is not None
        ):
            return Response(
                factoid_serializers.FactoidSerializer(existing_factoid).data,
                status=status.HTTP_200_OK,
            )

        try:
            remote_session = stripe.checkout.Session.retrieve(
                session_id,
                api_key=settings.STRIPE_SECRET_KEY,
            )
        except StripeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if getattr(remote_session, "payment_status", None) != "paid":
            return Response(
                {"detail": "Checkout session is not paid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        client_hash = payment_session.client_hash or getattr(
            remote_session, "client_reference_id", None
        )
        if not client_hash:
            return Response(
                {"detail": "Unable to determine client for checkout session"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        metadata = payment_session.metadata or {}
        resolved_topic = serializer.validated_data.get("topic") or metadata.get("topic") or None
        resolved_model_key = (
            serializer.validated_data.get("model_key") or metadata.get("model_key") or None
        )
        posthog_distinct_id = metadata.get("posthog_distinct_id")

        try:
            factoid = generate_factoid(
                topic=resolved_topic or "something surprising",
                model_key=resolved_model_key or None,
                temperature=None,
                client_hash=client_hash,
                profile="api_key",
                request_source=factoid_models.RequestSource.PAYMENT,
                posthog_distinct_id=posthog_distinct_id or None,
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
            return Response(
                {"detail": exc.detail},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        payment_session.status = models.PaymentStatus.COMPLETED
        if factoid.created_by_id:
            payment_session.requested_generation = factoid.created_by
        updated_metadata = dict(metadata)
        updated_metadata["factoid_id"] = str(factoid.id)
        payment_session.metadata = updated_metadata
        payment_session.save(
            update_fields=["status", "requested_generation", "metadata", "updated_at"]
        )

        return Response(
            factoid_serializers.FactoidSerializer(factoid).data,
            status=status.HTTP_201_CREATED,
        )


urlpatterns = [
    path("checkout/", CheckoutSessionCreateView.as_view(), name="checkout"),
    path(
        "checkout/<str:session_id>/fulfill/",
        CheckoutSessionCompleteView.as_view(),
        name="checkout-complete",
    ),
]
