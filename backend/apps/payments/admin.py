"""Admin registrations for payments models."""

from django.contrib import admin

from . import models


@admin.register(models.PaymentSession)
class PaymentSessionAdmin(admin.ModelAdmin):
    list_display = (
        "stripe_session_id",
        "status",
        "amount",
        "currency",
        "requested_generation",
        "created_at",
    )
    search_fields = ("stripe_session_id", "client_hash")
    list_filter = ("status", "currency")
    ordering = ("-created_at",)
    raw_id_fields = ("requested_generation",)
