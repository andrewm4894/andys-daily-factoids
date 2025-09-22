"""Payments-related models."""

import uuid

from django.db import models


class PaymentSession(models.Model):
    """Track Stripe checkout sessions and their status."""

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    stripe_session_id = models.CharField(max_length=255, unique=True)
    status = models.CharField(max_length=32, default="created")
    client_hash = models.CharField(max_length=128, blank=True)
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    currency = models.CharField(max_length=16, default="usd")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Stripe session {self.stripe_session_id}"
