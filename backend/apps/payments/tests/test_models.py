"""Basic tests for payments models."""

from apps.payments import models


def test_payment_session_str():
    session = models.PaymentSession(
        stripe_session_id="sess_test",
        status=models.PaymentStatus.CREATED,
        amount=10,
        currency="usd",
    )
    assert "sess_test" in str(session)
