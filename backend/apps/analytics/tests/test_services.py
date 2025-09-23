"""Placeholder tests for analytics services."""

from apps.analytics import models
from apps.analytics.services import AnalyticsEvent


def test_analytics_event_dataclass():
    event = AnalyticsEvent(name="test", properties={"key": "value"})
    assert event.properties["key"] == "value"


def test_evaluation_artifact_string_representation():
    artifact = models.EvaluationArtifact(
        source_type=models.ArtifactSource.FACTOID_GENERATION,
        payload={},
    )
    assert "Artifact" in str(artifact)
