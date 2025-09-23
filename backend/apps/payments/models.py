"""Payments-related models."""

from __future__ import annotations

import uuid

from django.db import models


class PaymentStatus(models.TextChoices):
    CREATED = "created", "Created"
    COMPLETED = "completed", "Completed"
    EXPIRED = "expired", "Expired"
    REFUNDED = "refunded", "Refunded"


class PaymentSession(models.Model):
    """Track Stripe checkout sessions and their status."""

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    stripe_session_id = models.CharField(max_length=255, unique=True)
    status = models.CharField(
        max_length=32,
        choices=PaymentStatus.choices,
        default=PaymentStatus.CREATED,
    )
    client_hash = models.CharField(max_length=128, blank=True)
    requested_generation = models.ForeignKey(
        "factoids.GenerationRequest",
        null=True,
        blank=True,
        related_name="payment_sessions",
        on_delete=models.SET_NULL,
    )
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    currency = models.CharField(max_length=16, default="usd")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status"])]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"Stripe session {self.stripe_session_id}"
