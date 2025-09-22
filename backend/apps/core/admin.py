"""Admin registrations for core models."""

from django.contrib import admin

from . import models


@admin.register(models.APIKey)
class APIKeyAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "rate_limit_profile", "created_at", "last_used_at")
    search_fields = ("name", "rate_limit_profile")
    list_filter = ("is_active", "rate_limit_profile")
    ordering = ("name",)


@admin.register(models.ClientSession)
class ClientSessionAdmin(admin.ModelAdmin):
    list_display = ("session_token", "client_hash", "issued_at", "expires_at")
    search_fields = ("session_token", "client_hash")
    list_filter = ("issued_at",)
    ordering = ("-issued_at",)


@admin.register(models.RateLimitSnapshot)
class RateLimitSnapshotAdmin(admin.ModelAdmin):
    list_display = ("bucket", "window_start", "window_end", "count", "budget_remaining")
    search_fields = ("bucket",)
    list_filter = ("bucket",)
    ordering = ("-window_start",)
