"""Admin registrations for factoid models."""

from django.contrib import admin

from . import models


@admin.register(models.Factoid)
class FactoidAdmin(admin.ModelAdmin):
    list_display = ("id", "text", "subject", "created_at")
    search_fields = ("text", "subject")
    ordering = ("-created_at",)


@admin.register(models.FactoidFeedback)
class FactoidFeedbackAdmin(admin.ModelAdmin):
    list_display = ("factoid", "vote", "created_at")
    search_fields = ("comments",)
    ordering = ("-created_at",)
    raw_id_fields = ("factoid",)
