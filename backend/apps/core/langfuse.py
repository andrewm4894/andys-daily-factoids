"""Langfuse integration for observability and tracing."""

from __future__ import annotations

import logging
from functools import lru_cache

from django.conf import settings

try:
    from langfuse import Langfuse
    from langfuse.langchain import CallbackHandler
except ImportError:  # pragma: no cover - optional dependency
    Langfuse = None  # type: ignore[assignment]
    CallbackHandler = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


_client: Langfuse | None = None


@lru_cache()
def get_langfuse_client() -> Langfuse | None:
    """Get a configured Langfuse client if available."""
    global _client

    if _client is not None:
        return _client

    if Langfuse is None:
        logger.debug("Langfuse not available - install with 'pip install langfuse'")
        return None

    public_key = getattr(settings, "LANGFUSE_PUBLIC_KEY", None)
    secret_key = getattr(settings, "LANGFUSE_SECRET_KEY", None)
    host = getattr(settings, "LANGFUSE_HOST", "https://cloud.langfuse.com")

    if not public_key or not secret_key:
        logger.debug("Langfuse API keys not configured")
        return None

    try:
        _client = Langfuse(
            public_key=public_key,
            secret_key=secret_key,
            host=host,
        )
        logger.info("Langfuse client initialized successfully")
        return _client
    except Exception as e:
        logger.warning("Failed to initialize Langfuse client: %s", e)
        return None


def get_langfuse_callback_handler() -> CallbackHandler | None:
    """Get a Langfuse callback handler if Langfuse is configured."""
    if CallbackHandler is None:
        return None

    # Ensure client is initialized
    client = get_langfuse_client()
    if not client:
        return None

    try:
        return CallbackHandler()
    except Exception as e:
        logger.warning("Failed to initialize Langfuse callback handler: %s", e)
        return None


def initialize_langfuse() -> None:
    """Initialize Langfuse tracing."""
    client = get_langfuse_client()
    if client:
        logger.info("Langfuse tracing initialized")
    else:
        logger.debug("Langfuse tracing not initialized (not configured)")


__all__ = [
    "get_langfuse_client",
    "get_langfuse_callback_handler",
    "initialize_langfuse",
]
