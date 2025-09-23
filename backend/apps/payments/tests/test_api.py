"""Tests for the payments API."""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

import pytest

from apps.factoids import models as factoid_models
from apps.payments import models, services


@pytest.fixture(scope="session")
def django_db_setup():  # type: ignore[override]
    from django.conf import settings as django_settings

    django_settings.DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    }
    return None


@pytest.fixture(autouse=True)
def disable_posthog(settings):
    settings.POSTHOG_DISABLED = True
    yield


@pytest.fixture(autouse=True)
def clear_gateway_cache():
    services.get_payment_gateway.cache_clear()
    yield
    services.get_payment_gateway.cache_clear()


@pytest.mark.django_db
def test_checkout_requires_configuration(client, settings):
    settings.STRIPE_SECRET_KEY = None

    response = client.post("/api/payments/checkout/", {})

    assert response.status_code == 503
    assert response.json()["detail"] == "Payments are not configured"


@pytest.mark.django_db
def test_checkout_creates_session_and_persists_record(client, settings):
    settings.STRIPE_SECRET_KEY = "sk_test"
    settings.STRIPE_PUBLISHABLE_KEY = "pk_test"
    settings.STRIPE_CHECKOUT_AMOUNT_CENTS = 700
    settings.STRIPE_CHECKOUT_CURRENCY = "usd"

    session = SimpleNamespace(
        id="cs_test",
        url="https://checkout.stripe.com/pay/cs_test",
        amount_subtotal=700,
        currency="usd",
    )

    with mock.patch("apps.payments.services.stripe.checkout.Session.create", return_value=session):
        response = client.post(
            "/api/payments/checkout/",
            {
                "success_url": "https://example.com/success",
                "cancel_url": "https://example.com/cancel",
                "source": "rate_limit",
            },
            content_type="application/json",
            HTTP_USER_AGENT="pytest",
        )

    assert response.status_code == 201
    payload = response.json()
    assert payload["session_id"] == "cs_test"
    assert payload["checkout_url"] == session.url
    assert payload["publishable_key"] == "pk_test"

    payment_session = models.PaymentSession.objects.get(stripe_session_id="cs_test")
    assert float(payment_session.amount) == pytest.approx(7.0)
    assert payment_session.currency == "usd"
    assert payment_session.metadata["source"] == "rate_limit"
    assert payment_session.metadata["client_hash"]


@pytest.mark.django_db
def test_checkout_fulfill_generates_factoid(client, settings):
    settings.STRIPE_SECRET_KEY = "sk_test"

    payment_session = models.PaymentSession.objects.create(
        stripe_session_id="cs_paid",
        client_hash="hash123",
        amount=Decimal("7.00"),
        currency="usd",
        metadata={"topic": "space"},
    )

    generation_request = factoid_models.GenerationRequest.objects.create(
        client_hash="hash123",
        request_source=factoid_models.RequestSource.PAYMENT,
        model_key="gpt-test",
    )
    factoid = factoid_models.Factoid.objects.create(
        text="Saturn's rings are mostly water ice.",
        subject="Astronomy",
        emoji="🪐",
        created_by=generation_request,
    )

    with mock.patch(
        "apps.payments.api.stripe.checkout.Session.retrieve",
        return_value=SimpleNamespace(payment_status="paid", client_reference_id="hash123"),
    ), mock.patch("apps.payments.api.generate_factoid", return_value=factoid) as generate_mock:
        response = client.post(
            "/api/payments/checkout/cs_paid/fulfill/",
            {"topic": "space"},
            content_type="application/json",
        )

    assert response.status_code == 201
    payload = response.json()
    assert payload["id"] == str(factoid.id)
    assert payload["subject"] == "Astronomy"
    generate_args = generate_mock.call_args.kwargs
    assert generate_args["profile"] == "api_key"
    assert generate_args["request_source"] == factoid_models.RequestSource.PAYMENT

    payment_session.refresh_from_db()
    assert payment_session.status == models.PaymentStatus.COMPLETED
    assert payment_session.requested_generation_id == generation_request.id
    assert payment_session.metadata["factoid_id"] == str(factoid.id)

    # A second call should return the same factoid without invoking Stripe or generator again.
    response_repeat = client.post(
        "/api/payments/checkout/cs_paid/fulfill/",
        {},
        content_type="application/json",
    )
    assert response_repeat.status_code == 200
    assert response_repeat.json()["id"] == str(factoid.id)


@pytest.mark.django_db
def test_checkout_fulfill_requires_paid_session(client, settings):
    settings.STRIPE_SECRET_KEY = "sk_test"

    models.PaymentSession.objects.create(
        stripe_session_id="cs_unpaid",
        client_hash="hash-unpaid",
        amount=Decimal("7.00"),
        currency="usd",
        metadata={},
    )

    with mock.patch(
        "apps.payments.api.stripe.checkout.Session.retrieve",
        return_value=SimpleNamespace(payment_status="unpaid", client_reference_id="hash-unpaid"),
    ):
        response = client.post(
            "/api/payments/checkout/cs_unpaid/fulfill/",
            {},
            content_type="application/json",
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Checkout session is not paid"

    payment_session = models.PaymentSession.objects.get(stripe_session_id="cs_unpaid")
    assert payment_session.status == models.PaymentStatus.CREATED
