"""Admin registrations for chat models."""

from django.contrib import admin

from . import models


@admin.register(models.ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "status",
        "model_key",
        "token_budget_remaining",
        "total_tokens_used",
        "created_at",
    )
    search_fields = ("id", "model_key", "client_hash")
    list_filter = ("status",)
    ordering = ("-created_at",)
    raw_id_fields = ("api_key",)


@admin.register(models.ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("session", "role", "created_at")
    search_fields = ("session__id", "role")
    list_filter = ("role",)
    ordering = ("created_at",)
    raw_id_fields = ("session",)


@admin.register(models.ChatToolCall)
class ChatToolCallAdmin(admin.ModelAdmin):
    list_display = ("message", "tool_name", "created_at")
    search_fields = ("tool_name",)
    ordering = ("created_at",)
    raw_id_fields = ("message",)
