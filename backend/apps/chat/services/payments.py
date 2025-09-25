"""Helpers for triggering chat-specific payment flows."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.conf import settings

from apps.payments import models as payment_models
from apps.payments.services import get_chat_payment_gateway


def create_chat_checkout_session(
    *,
    client_hash: str,
    factoid_id: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Create a Stripe checkout session for unlocking additional chat usage."""

    gateway = get_chat_payment_gateway()
    if gateway is None:
        return None

    success_url = getattr(settings, "STRIPE_SUCCESS_URL", None)
    cancel_url = getattr(settings, "STRIPE_CANCEL_URL", success_url)
    if not success_url or not cancel_url:
        return None

    prepared_metadata = dict(metadata or {})
    prepared_metadata.setdefault("client_hash", client_hash)
    prepared_metadata.setdefault("source", "factoid_chat")
    prepared_metadata.setdefault("factoid_id", factoid_id)

    session = gateway.create_checkout_session(
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=client_hash,
        metadata=prepared_metadata,
    )

    amount_cents = getattr(session, "amount_subtotal", None)
    if amount_cents is None:
        amount_cents = getattr(session, "amount_total", None)
    if amount_cents is None:
        amount_cents = gateway.default_amount_cents

    amount = (Decimal(amount_cents or 0) / Decimal("100")).quantize(Decimal("0.01"))
    currency = getattr(session, "currency", None) or gateway.currency

    payment_models.PaymentSession.objects.create(
        stripe_session_id=session.id,
        client_hash=client_hash,
        amount=amount,
        currency=currency,
        metadata=prepared_metadata,
    )

    return {
        "session_id": session.id,
        "checkout_url": getattr(session, "url", None),
        "publishable_key": getattr(settings, "STRIPE_PUBLISHABLE_KEY", None),
    }


__all__ = ["create_chat_checkout_session"]
