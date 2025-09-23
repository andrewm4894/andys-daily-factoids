"""Basic tests covering core models."""

from datetime import timedelta

from django.utils import timezone

from apps.core import models


def test_api_key_string_representation():
    api_key = models.APIKey(name="Primary", hashed_key="hash")
    assert str(api_key) == "Primary"


def test_client_session_expiry_detection():
    session = models.ClientSession(
        session_token="token",
        client_hash="hash",
        expires_at=timezone.now() - timedelta(minutes=1),
    )
    assert session.is_expired() is True
