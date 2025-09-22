"""Placeholder tests for analytics services."""

from apps.analytics.services import AnalyticsEvent


def test_analytics_event_dataclass():
    event = AnalyticsEvent(name="test", properties={"key": "value"})
    assert event.properties["key"] == "value"
