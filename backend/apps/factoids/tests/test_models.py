"""Basic tests for factoids models."""

from apps.factoids import models


def test_factoid_string_representation():
    factoid = models.Factoid(text="Example factoid", subject="Science", emoji="🧠")
    assert "Example" in str(factoid)
