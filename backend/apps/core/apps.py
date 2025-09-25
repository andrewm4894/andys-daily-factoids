"""App configuration for the core utilities."""

from django.apps import AppConfig


def _bootstrap_posthog() -> None:
    try:
        from .posthog import configure_posthog
    except ImportError:  # pragma: no cover - PostHog not installed
        return

    configure_posthog()


def _bootstrap_braintrust() -> None:
    try:
        from .braintrust import initialize_braintrust
    except ImportError:  # pragma: no cover - Braintrust not installed
        return

    initialize_braintrust()


def _bootstrap_langsmith() -> None:
    try:
        from .langsmith import initialize_langsmith
    except ImportError:  # pragma: no cover - LangSmith not installed
        return

    initialize_langsmith()


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"
    verbose_name = "Core"

    def ready(self) -> None:  # pragma: no cover - executed at app startup
        _bootstrap_posthog()
        _bootstrap_braintrust()
        _bootstrap_langsmith()
