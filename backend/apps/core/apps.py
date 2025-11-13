"""App configuration for the core utilities."""

import logging

from django.apps import AppConfig

logger = logging.getLogger(__name__)


def _bootstrap_posthog() -> None:
    logger.debug("Starting PostHog bootstrap")
    try:
        from .posthog import configure_posthog
    except ImportError:  # pragma: no cover - PostHog not installed
        logger.debug("PostHog not installed, skipping")
        return

    configure_posthog()
    logger.debug("PostHog bootstrap complete")


def _bootstrap_braintrust() -> None:
    logger.debug("Starting Braintrust bootstrap")
    try:
        from .braintrust import initialize_braintrust
    except ImportError:  # pragma: no cover - Braintrust not installed
        logger.debug("Braintrust not installed, skipping")
        return

    initialize_braintrust()
    logger.debug("Braintrust bootstrap complete")


def _bootstrap_langsmith() -> None:
    logger.debug("Starting LangSmith bootstrap")
    try:
        from .langsmith import initialize_langsmith
    except ImportError:  # pragma: no cover - LangSmith not installed
        logger.debug("LangSmith not installed, skipping")
        return

    initialize_langsmith()
    logger.debug("LangSmith bootstrap complete")


def _bootstrap_datadog() -> None:
    logger.debug("Starting Datadog bootstrap")
    try:
        from .datadog import initialize_datadog
    except ImportError:  # pragma: no cover - Datadog not installed
        logger.debug("Datadog not installed, skipping")
        return

    initialize_datadog()
    logger.debug("Datadog bootstrap complete")


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"
    verbose_name = "Core"

    def ready(self) -> None:  # pragma: no cover - executed at app startup
        logger.info("CoreConfig.ready() starting")
        _bootstrap_posthog()
        logger.info("PostHog initialization complete")
        _bootstrap_braintrust()
        logger.info("Braintrust initialization complete")
        _bootstrap_langsmith()
        logger.info("LangSmith initialization complete")
        _bootstrap_datadog()
        logger.info("Datadog initialization complete")
        logger.info("CoreConfig.ready() complete")
