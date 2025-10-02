"""Datadog configuration and LLM observability integration for Andy's Daily Factoids."""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)

try:
    from ddtrace import tracer
    from ddtrace.llmobs import LLMObs
except ImportError:  # pragma: no cover - optional dependency
    tracer = None  # type: ignore[assignment]
    LLMObs = None  # type: ignore[assignment]


@lru_cache()
def initialize_datadog() -> bool:
    """Initialize Datadog LLM observability with the configured API key."""
    if not tracer or not LLMObs:
        logger.info("Datadog not available - install with 'pip install ddtrace'")
        return False

    api_key = getattr(settings, "DATADOG_API_KEY", None)
    if not api_key:
        logger.info("Datadog API key not configured")
        return False

    llmobs_enabled = getattr(settings, "DATADOG_LLMOBS_ENABLED", False)
    if not llmobs_enabled:
        logger.info("Datadog LLM observability disabled")
        return False

    try:
        # Set required environment variables for ddtrace
        os.environ["DD_API_KEY"] = api_key
        os.environ["DD_SITE"] = getattr(settings, "DATADOG_SITE", "datadoghq.com")
        os.environ["DD_LLMOBS_ENABLED"] = "true"
        os.environ["DD_LLMOBS_ML_APP"] = getattr(
            settings, "DATADOG_LLMOBS_ML_APP", "andys-daily-factoids"
        )
        os.environ["DD_LLMOBS_AGENTLESS_ENABLED"] = "true"

        # Enable LLM observability with agentless mode
        LLMObs.enable(
            ml_app=getattr(settings, "DATADOG_LLMOBS_ML_APP", "andys-daily-factoids"),
            api_key=api_key,
            site=getattr(settings, "DATADOG_SITE", "datadoghq.com"),
            agentless_enabled=True,
        )

        logger.info(
            "Datadog LLM observability initialized successfully for app: %s",
            getattr(settings, "DATADOG_LLMOBS_ML_APP", "andys-daily-factoids"),
        )
        return True
    except Exception as exc:
        logger.warning("Failed to initialize Datadog LLM observability: %s", exc)
        return False


def get_datadog_callback_handler() -> Any | None:
    """Return None - Datadog uses auto-instrumentation instead of callback handlers."""
    # Datadog ddtrace auto-instruments LangChain calls automatically
    # when LLMObs is enabled, so no explicit callback handler is needed
    return None


__all__ = [
    "initialize_datadog",
    "get_datadog_callback_handler",
]
