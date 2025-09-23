"""Analytics service helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class AnalyticsEvent:
    """Basic container for analytics events."""

    name: str
    properties: dict[str, Any]


class PosthogClient:
    """Proxy for PostHog interactions (implementation forthcoming)."""

    def capture(self, event: AnalyticsEvent) -> None:
        raise NotImplementedError
