"""Core models shared across the backend (API keys, sessions, rate limits)."""

from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class APIKey(models.Model):
    """Hashed API keys for elevated access and quota management."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=64, unique=True)
    hashed_key = models.CharField(max_length=128, unique=True)
    is_active = models.BooleanField(default=True)
    rate_limit_profile = models.CharField(max_length=32, default="default")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.name


class ClientSession(models.Model):
    """Signed anonymous sessions issued to browser clients."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session_token = models.CharField(max_length=64, unique=True)
    client_hash = models.CharField(max_length=128)
    issued_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [models.Index(fields=["client_hash", "expires_at"])]
        ordering = ["-issued_at"]

    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.session_token


class RateLimitSnapshot(models.Model):
    """Historical record of rate limit bucket usage for observability/auditing."""

    bucket = models.CharField(max_length=128)
    window_start = models.DateTimeField()
    window_end = models.DateTimeField()
    count = models.IntegerField()
    budget_remaining = models.IntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-window_start"]
        constraints = [
            models.UniqueConstraint(
                fields=["bucket", "window_start", "window_end"],
                name="unique_bucket_window",
            )
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.bucket} {self.window_start.isoformat()}"
