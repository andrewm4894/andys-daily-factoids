"""Payment orchestration services (Stripe integration)."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import stripe
from django.conf import settings


class PaymentGateway:
    """Abstract payment gateway interface."""

    def create_checkout_session(
        self,
        *,
        success_url: str,
        cancel_url: str,
        client_reference_id: str | None,
        metadata: dict[str, Any],
    ) -> stripe.checkout.Session:
        raise NotImplementedError


class StripePaymentGateway(PaymentGateway):
    """Stripe-backed implementation of the payment gateway."""

    def __init__(
        self,
        *,
        secret_key: str,
        price_id: str | None,
        default_amount_cents: int,
        currency: str,
        product_name: str,
    ) -> None:
        self._secret_key = secret_key
        self._price_id = price_id
        self._default_amount_cents = default_amount_cents
        self._currency = currency
        self._product_name = product_name

    @staticmethod
    def _stringify_metadata(metadata: dict[str, Any]) -> dict[str, str]:
        prepared: dict[str, str] = {}
        for key, value in metadata.items():
            if value is None:
                continue
            prepared[str(key)] = str(value)
        return prepared

    @property
    def default_amount_cents(self) -> int:
        return self._default_amount_cents

    @property
    def currency(self) -> str:
        return self._currency

    def create_checkout_session(
        self,
        *,
        success_url: str,
        cancel_url: str,
        client_reference_id: str | None,
        metadata: dict[str, Any],
    ) -> stripe.checkout.Session:
        if not success_url or not cancel_url:
            raise ValueError("success_url and cancel_url are required")

        line_item: dict[str, Any]
        if self._price_id:
            line_item = {"price": self._price_id, "quantity": 1}
        else:
            line_item = {
                "price_data": {
                    "currency": self._currency,
                    "product_data": {"name": self._product_name},
                    "unit_amount": self._default_amount_cents,
                },
                "quantity": 1,
            }

        session = stripe.checkout.Session.create(
            api_key=self._secret_key,
            mode="payment",
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=client_reference_id,
            metadata=self._stringify_metadata(metadata),
            line_items=[line_item],
            allow_promotion_codes=True,
        )

        return session


@lru_cache()
def get_payment_gateway() -> StripePaymentGateway | None:
    """Lazily build the configured payment gateway, if Stripe is enabled."""

    secret_key = getattr(settings, "STRIPE_SECRET_KEY", None)
    if not secret_key:
        return None

    price_id = getattr(settings, "STRIPE_PRICE_ID", None)
    amount_cents = int(getattr(settings, "STRIPE_CHECKOUT_AMOUNT_CENTS", 500))
    currency = getattr(settings, "STRIPE_CHECKOUT_CURRENCY", "usd")
    product_name = getattr(
        settings,
        "STRIPE_CHECKOUT_PRODUCT_NAME",
        "Factoid Booster Pack",
    )

    return StripePaymentGateway(
        secret_key=secret_key,
        price_id=price_id,
        default_amount_cents=amount_cents,
        currency=currency,
        product_name=product_name,
    )


@lru_cache()
def get_chat_payment_gateway() -> StripePaymentGateway | None:
    """Payment gateway configured for factoid chat unlocks."""

    secret_key = getattr(settings, "STRIPE_SECRET_KEY", None)
    price_id = getattr(settings, "STRIPE_FACTOID_CHAT_PRICE_ID", None)
    if not secret_key or not price_id:
        return None

    amount_cents = int(
        getattr(
            settings,
            "STRIPE_FACTOID_CHAT_AMOUNT_CENTS",
            getattr(settings, "STRIPE_CHECKOUT_AMOUNT_CENTS", 500),
        )
    )
    currency = getattr(
        settings,
        "STRIPE_FACTOID_CHAT_CURRENCY",
        getattr(settings, "STRIPE_CHECKOUT_CURRENCY", "usd"),
    )
    product_name = getattr(settings, "STRIPE_FACTOID_CHAT_PRODUCT_NAME", "Factoid Chat")

    return StripePaymentGateway(
        secret_key=secret_key,
        price_id=price_id,
        default_amount_cents=amount_cents,
        currency=currency,
        product_name=product_name,
    )


__all__ = [
    "PaymentGateway",
    "StripePaymentGateway",
    "get_payment_gateway",
    "get_chat_payment_gateway",
]
