"""Models for chat agent sessions."""

import uuid

from django.db import models


class ChatSession(models.Model):
    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    client_hash = models.CharField(max_length=128, blank=True)
    status = models.CharField(max_length=32, default="active")
    system_prompt = models.TextField(blank=True)
    config = models.JSONField(default=dict, blank=True)
    token_budget_remaining = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    last_activity_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"ChatSession {self.id}"


class ChatMessage(models.Model):
    id = models.BigAutoField(primary_key=True)
    session = models.ForeignKey(ChatSession, related_name="messages", on_delete=models.CASCADE)
    role = models.CharField(max_length=16)
    content = models.JSONField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"ChatMessage {self.id} for session {self.session_id}"
