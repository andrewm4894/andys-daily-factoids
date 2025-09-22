"""Analytics models for evaluation artifacts."""

from __future__ import annotations

import uuid

from django.db import models


class ArtifactSource(models.TextChoices):
    FACTOID_GENERATION = "factoid_generation", "Factoid Generation"
    CHAT_EXCHANGE = "chat_exchange", "Chat Exchange"


class EvaluationArtifact(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source_type = models.CharField(max_length=32, choices=ArtifactSource.choices)
    payload = models.JSONField()
    score = models.DecimalField(max_digits=4, decimal_places=3, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    evaluated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"Artifact {self.id}"
