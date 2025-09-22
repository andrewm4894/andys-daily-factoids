"""Admin registrations for factoid models."""

from django.contrib import admin

from . import models


@admin.register(models.Factoid)
class FactoidAdmin(admin.ModelAdmin):
    list_display = ("id", "text", "subject", "votes_up", "votes_down", "created_at")
    search_fields = ("text", "subject")
    list_filter = ("subject",)
    ordering = ("-created_at",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(models.GenerationRequest)
class GenerationRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "client_hash", "request_source", "status", "created_at")
    search_fields = ("client_hash", "model_key")
    list_filter = ("request_source", "status")
    ordering = ("-created_at",)
    raw_id_fields = ("api_key", "retry_of")


@admin.register(models.VoteAggregate)
class VoteAggregateAdmin(admin.ModelAdmin):
    list_display = ("factoid", "client_hash", "vote_type", "created_at")
    search_fields = ("client_hash",)
    list_filter = ("vote_type",)
    ordering = ("-created_at",)
    raw_id_fields = ("factoid",)


@admin.register(models.FactoidFeedback)
class FactoidFeedbackAdmin(admin.ModelAdmin):
    list_display = ("factoid", "vote", "created_at")
    search_fields = ("comments", "client_hash")
    ordering = ("-created_at",)
    raw_id_fields = ("factoid", "generation_request")


@admin.register(models.ModelCache)
class ModelCacheAdmin(admin.ModelAdmin):
    list_display = ("id", "fetched_at", "expires_at")
