"""Braintrust configuration and LangChain integration for Andy's Daily Factoids."""

from __future__ import annotations

import logging
from functools import lru_cache

from django.conf import settings

logger = logging.getLogger(__name__)

try:
    from braintrust import init_logger
    from braintrust_langchain import BraintrustCallbackHandler, set_global_handler
except ImportError:  # pragma: no cover - optional dependency
    init_logger = None  # type: ignore[assignment]
    BraintrustCallbackHandler = None  # type: ignore[assignment]
    set_global_handler = None  # type: ignore[assignment]


@lru_cache()
def initialize_braintrust() -> bool:
    """Initialize Braintrust logging with the configured API key."""
    if not init_logger or not BraintrustCallbackHandler:
        logger.info(
            "Braintrust not available - install with 'pip install braintrust braintrust-langchain'"
        )
        return False

    api_key = getattr(settings, "BRAINTRUST_API_KEY", None)
    if not api_key:
        logger.info("Braintrust API key not configured")
        return False

    try:
        # Initialize Braintrust logger with the project name and API key
        init_logger(
            project="andys-daily-factoids",
            api_key=api_key,
        )

        # Create and set global handler so all LangChain calls are automatically traced
        handler = BraintrustCallbackHandler()
        set_global_handler(handler)

        logger.info("Braintrust initialized successfully with global handler")
        return True
    except Exception as exc:
        logger.warning("Failed to initialize Braintrust: %s", exc)
        return False


def get_braintrust_callback_handler() -> BraintrustCallbackHandler | None:
    """Get a Braintrust callback handler for manual attachment to specific chains."""
    if not BraintrustCallbackHandler:
        return None

    # Ensure Braintrust is initialized
    if not initialize_braintrust():
        return None

    try:
        return BraintrustCallbackHandler()
    except Exception as exc:
        logger.warning("Failed to create Braintrust callback handler: %s", exc)
        return None
