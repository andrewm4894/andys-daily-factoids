"""App configuration for the core utilities."""

from django.apps import AppConfig


def _bootstrap_posthog() -> None:
    try:
        from .posthog import configure_posthog
    except ImportError:  # pragma: no cover - PostHog not installed
        return

    configure_posthog()


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"
    verbose_name = "Core"

    def ready(self) -> None:  # pragma: no cover - executed at app startup
        _bootstrap_posthog()
