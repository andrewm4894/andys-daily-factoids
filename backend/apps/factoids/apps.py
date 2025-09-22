"""App configuration for factoids domain."""

from django.apps import AppConfig


class FactoidsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.factoids"
    verbose_name = "Factoids"
