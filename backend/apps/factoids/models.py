"""Database models for factoids and associated workflows."""

from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class RequestSource(models.TextChoices):
    MANUAL = "manual", "Manual"
    SCHEDULED = "scheduled", "Scheduled"
    PAYMENT = "payment", "Payment"
    CHAT_AGENT = "chat_agent", "Chat Agent"


class RequestStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    RUNNING = "running", "Running"
    SUCCEEDED = "succeeded", "Succeeded"
    FAILED = "failed", "Failed"
    CANCELLED = "cancelled", "Cancelled"


class VoteType(models.TextChoices):
    UP = "up", "Up"
    DOWN = "down", "Down"


class Factoid(models.Model):
    """Persisted factoid with vote counts and generation metadata."""

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    text = models.TextField()
    subject = models.CharField(max_length=255, blank=True)
    emoji = models.CharField(max_length=16, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    votes_up = models.PositiveIntegerField(default=0)
    votes_down = models.PositiveIntegerField(default=0)
    generation_metadata = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        "factoids.GenerationRequest",
        null=True,
        blank=True,
        related_name="factoids",
        on_delete=models.SET_NULL,
    )
    cost_usd = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["subject"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.text[:50]


class GenerationRequest(models.Model):
    """Tracks incoming generation operations and their lifecycle."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_hash = models.CharField(max_length=128)
    api_key = models.ForeignKey(
        "core.APIKey",
        null=True,
        blank=True,
        related_name="generation_requests",
        on_delete=models.SET_NULL,
    )
    request_source = models.CharField(
        max_length=16,
        choices=RequestSource.choices,
        default=RequestSource.MANUAL,
    )
    model_key = models.CharField(max_length=255)
    parameters = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=16,
        choices=RequestStatus.choices,
        default=RequestStatus.PENDING,
    )
    expected_cost_usd = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    actual_cost_usd = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    token_usage_prompt = models.IntegerField(null=True, blank=True)
    token_usage_completion = models.IntegerField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    retry_of = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        related_name="retries",
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["client_hash"]),
            models.Index(fields=["status"]),
        ]

    def mark_started(self) -> None:
        self.status = RequestStatus.RUNNING
        if not self.started_at:
            self.started_at = timezone.now()

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"GenerationRequest {self.id}"


class VoteAggregate(models.Model):
    """Records individual vote events from clients for analytics and auditing."""

    factoid = models.ForeignKey(Factoid, related_name="votes", on_delete=models.CASCADE)
    client_hash = models.CharField(max_length=128)
    vote_type = models.CharField(max_length=8, choices=VoteType.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["factoid", "created_at"])]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"Vote {self.vote_type} for {self.factoid_id}"


class FactoidFeedback(models.Model):
    """Optional free-form feedback associated with a factoid interaction."""

    id = models.BigAutoField(primary_key=True)
    factoid = models.ForeignKey(Factoid, related_name="feedback", on_delete=models.CASCADE)
    generation_request = models.ForeignKey(
        GenerationRequest,
        null=True,
        blank=True,
        related_name="feedback",
        on_delete=models.SET_NULL,
    )
    vote = models.CharField(max_length=8, blank=True)
    client_hash = models.CharField(max_length=128, blank=True)
    comments = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["factoid", "created_at"]),
            models.Index(fields=["client_hash"]),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"Feedback for {self.factoid_id}"


class ModelCache(models.Model):
    """Caching layer for OpenRouter model catalogue."""

    catalog = models.JSONField(default=list, blank=True)
    fetched_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Model cache"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"Model cache as of {self.fetched_at}"
