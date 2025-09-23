"""PostHog configuration helpers."""

from __future__ import annotations

from threading import Lock
from typing import Optional

from django.conf import settings

try:
    from posthog import Posthog
    from posthog.exception_integrations.django import (  # type: ignore[attr-defined]
        DjangoIntegration,
        IntegrationEnablingError,
    )
except ImportError:  # pragma: no cover - safety for optional dependency
    Posthog = None  # type: ignore
    DjangoIntegration = None  # type: ignore
    IntegrationEnablingError = Exception  # type: ignore


_client: Optional[Posthog] = None
_configured = False
_lock = Lock()
_django_integration: Optional[DjangoIntegration] = None


def _build_capture_exception_fn(client: Posthog):
    def _capture(exc_info, extra_props):  # type: ignore[no-untyped-def]
        distinct_id = None
        properties = None

        if isinstance(extra_props, dict):
            distinct_id = extra_props.get("distinct_id")
            properties = {k: v for k, v in extra_props.items() if k != "distinct_id"}
            if not properties:
                properties = None

        client.capture_exception(exception=exc_info, distinct_id=distinct_id, properties=properties)

    return _capture


def configure_posthog(*, force: bool = False) -> Optional[Posthog]:
    """Initialize the shared PostHog client with error autocapture."""

    global _client, _configured, _django_integration

    if Posthog is None:
        return None

    with _lock:
        if _configured and not force:
            return _client

        api_key = getattr(settings, "POSTHOG_PROJECT_API_KEY", None)
        if not api_key:
            _client = None
            _django_integration = None
            _configured = True
            return None

        host = getattr(settings, "POSTHOG_HOST", "https://us.i.posthog.com")
        client = Posthog(
            api_key,
            host=host,
            enable_exception_autocapture=True,
        )

        if getattr(settings, "POSTHOG_DEBUG", False):
            client.debug = True

        if getattr(settings, "POSTHOG_DISABLED", False):
            client.disabled = True

        if DjangoIntegration is not None and not getattr(settings, "POSTHOG_DISABLED", False):
            try:
                _django_integration = DjangoIntegration(
                    capture_exception_fn=_build_capture_exception_fn(client)
                )
            except IntegrationEnablingError:  # pragma: no cover - safety on unsupported versions
                _django_integration = None

        _client = client
        _configured = True
        return _client


def get_posthog_client() -> Optional[Posthog]:
    """Return the shared PostHog client if configured."""

    return configure_posthog()


__all__ = [
    "configure_posthog",
    "get_posthog_client",
]
