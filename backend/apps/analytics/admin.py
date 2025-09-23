"""Admin registration for analytics models."""

from django.contrib import admin

from . import models


@admin.register(models.EvaluationArtifact)
class EvaluationArtifactAdmin(admin.ModelAdmin):
    list_display = ("id", "source_type", "score", "created_at", "evaluated_at")
    search_fields = ("id", "source_type")
    list_filter = ("source_type",)
    ordering = ("-created_at",)
