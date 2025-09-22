"""Database models for factoids."""

import uuid

from django.db import models


class Factoid(models.Model):
    """Minimal factoid model; will be expanded in later phases."""

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    text = models.TextField()
    subject = models.CharField(max_length=255, blank=True)
    emoji = models.CharField(max_length=16, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.text[:50]


class FactoidFeedback(models.Model):
    """Optional free-form feedback associated with a factoid interaction."""

    id = models.BigAutoField(primary_key=True)
    factoid = models.ForeignKey(Factoid, related_name="feedback", on_delete=models.CASCADE)
    vote = models.CharField(max_length=8, blank=True)
    client_hash = models.CharField(max_length=128, blank=True)
    comments = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["factoid", "created_at"]),
            models.Index(fields=["client_hash"]),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Feedback for {self.factoid_id}"
