"""Models for chat agent sessions."""

from __future__ import annotations

import uuid

from django.db import models


class ChatSessionStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"
    CANCELLED = "cancelled", "Cancelled"


class ChatMessageRole(models.TextChoices):
    USER = "user", "User"
    ASSISTANT = "assistant", "Assistant"
    TOOL = "tool", "Tool"


class ChatSession(models.Model):
    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    client_hash = models.CharField(max_length=128, blank=True)
    api_key = models.ForeignKey(
        "core.APIKey",
        null=True,
        blank=True,
        related_name="chat_sessions",
        on_delete=models.SET_NULL,
    )
    status = models.CharField(
        max_length=16,
        choices=ChatSessionStatus.choices,
        default=ChatSessionStatus.ACTIVE,
    )
    system_prompt = models.TextField(blank=True)
    config = models.JSONField(default=dict, blank=True)
    model_key = models.CharField(max_length=255)
    token_budget_remaining = models.IntegerField(default=0)
    total_tokens_used = models.IntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_activity_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "last_activity_at"])]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"ChatSession {self.id}"


class ChatMessage(models.Model):
    id = models.BigAutoField(primary_key=True)
    session = models.ForeignKey(ChatSession, related_name="messages", on_delete=models.CASCADE)
    role = models.CharField(max_length=16, choices=ChatMessageRole.choices)
    content = models.JSONField()
    metadata = models.JSONField(default=dict, blank=True)
    token_usage = models.IntegerField(null=True, blank=True)
    cost_usd = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"ChatMessage {self.id} for session {self.session_id}"


class ChatToolCall(models.Model):
    id = models.BigAutoField(primary_key=True)
    message = models.ForeignKey(ChatMessage, related_name="tool_calls", on_delete=models.CASCADE)
    tool_name = models.CharField(max_length=64)
    arguments = models.JSONField()
    result = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"Tool call {self.tool_name}"
