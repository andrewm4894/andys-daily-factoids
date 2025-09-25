"""LangSmith integration for observability and tracing."""

from __future__ import annotations

import logging
import os
from typing import Any

from django.conf import settings

try:
    from langsmith import Client, wrappers
    from langsmith.callbacks import LangChainTracer
except ImportError:  # pragma: no cover
    Client = None  # type: ignore[assignment]
    wrappers = None  # type: ignore[assignment]
    LangChainTracer = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


def get_langsmith_client() -> Client | None:
    """Get a configured LangSmith client if available."""
    if Client is None:
        logger.debug("LangSmith not available (not installed)")
        return None

    api_key = getattr(settings, "LANGSMITH_API_KEY", None)
    if not api_key:
        logger.debug("LangSmith API key not configured")
        return None

    try:
        return Client(api_key=api_key)
    except Exception as e:
        logger.warning("Failed to initialize LangSmith client: %s", e)
        return None


def get_langsmith_callback_handler() -> LangChainTracer | None:
    """Get a LangSmith callback handler if LangSmith is configured."""
    if LangChainTracer is None:
        return None

    api_key = getattr(settings, "LANGSMITH_API_KEY", None)
    project_name = getattr(settings, "LANGSMITH_PROJECT", "andys-daily-factoids")

    if not api_key:
        return None

    try:
        return LangChainTracer(project_name=project_name)
    except Exception as e:
        logger.warning("Failed to initialize LangSmith callback handler: %s", e)
        return None


def initialize_langsmith() -> None:
    """Initialize LangSmith tracing with global environment variables."""
    api_key = getattr(settings, "LANGSMITH_API_KEY", None)
    project_name = getattr(settings, "LANGSMITH_PROJECT", "andys-daily-factoids")
    tracing_enabled = getattr(settings, "LANGSMITH_TRACING", False)

    if not api_key:
        logger.debug("LangSmith API key not configured, skipping initialization")
        return

    if not tracing_enabled:
        logger.debug("LangSmith tracing disabled via settings")
        return

    # Set environment variables for automatic LangSmith tracing
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = api_key
    os.environ["LANGCHAIN_PROJECT"] = project_name

    logger.info("LangSmith tracing initialized for project: %s", project_name)


def wrap_openai_client(client: Any) -> Any:
    """Wrap an OpenAI client with LangSmith tracing if available."""
    if wrappers is None:
        logger.debug("LangSmith wrappers not available")
        return client

    api_key = getattr(settings, "LANGSMITH_API_KEY", None)
    tracing_enabled = getattr(settings, "LANGSMITH_TRACING", False)

    if not api_key or not tracing_enabled:
        return client

    try:
        return wrappers.wrap_openai(client)
    except Exception as e:
        logger.warning("Failed to wrap OpenAI client with LangSmith: %s", e)
        return client


__all__ = [
    "get_langsmith_client",
    "get_langsmith_callback_handler",
    "initialize_langsmith",
    "wrap_openai_client",
]
