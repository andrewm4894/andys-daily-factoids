"""API tests for factoid endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.factoids import models
from apps.factoids.api import _cost_guard, _rate_limiter
from apps.factoids.services import GenerationResult


@pytest.fixture(autouse=True)
def reset_rate_limiter_and_cost_guard():
    _rate_limiter._buckets.clear()  # type: ignore[attr-defined]
    _cost_guard.profile_usage = {profile: 0.0 for profile in _cost_guard.profile_budgets}
    yield
    _rate_limiter._buckets.clear()  # type: ignore[attr-defined]
    _cost_guard.profile_usage = {profile: 0.0 for profile in _cost_guard.profile_budgets}


@pytest.mark.django_db()
def test_factoid_list_returns_existing_factoid():
    models.Factoid.objects.create(text="Example", subject="Science", emoji="🧠")
    client = APIClient()
    response = client.get(reverse("factoids:factoid-list"))
    assert response.status_code == 200
    data = response.json()
    assert data["results"][0]["text"] == "Example"


@pytest.mark.django_db()
def test_factoid_generation_stub_without_api_key(settings):
    settings.OPENROUTER_API_KEY = None
    client = APIClient()
    response = client.post(reverse("factoids:generate"), {"topic": "gravity"}, format="json")
    assert response.status_code == 201
    assert "gravity" in response.json()["text"].lower()


@pytest.mark.django_db()
def test_factoid_generation_invokes_openrouter(settings):
    settings.OPENROUTER_API_KEY = "test-key"
    client = APIClient()

    mock_result = GenerationResult(text="Fact", subject="Science", emoji="🧠", raw={})

    with patch(
        "apps.factoids.api.OpenRouterClient.generate_factoid",
        new=AsyncMock(return_value=mock_result),
    ):
        response = client.post(reverse("factoids:generate"), {"topic": "science"}, format="json")
        assert response.status_code == 201
        assert response.json()["text"] == "Fact"


@pytest.mark.django_db()
def test_vote_endpoint_blocks_duplicate_votes():
    factoid = models.Factoid.objects.create(text="Example", subject="Science", emoji="🧠")
    client = APIClient()
    url = reverse("factoids:vote", args=[factoid.id])
    assert client.post(url, {"vote": models.VoteType.UP}, format="json").status_code == 200
    assert client.post(url, {"vote": models.VoteType.UP}, format="json").status_code == 400


@pytest.mark.django_db()
def test_models_endpoint_uses_openrouter(settings):
    settings.OPENROUTER_API_KEY = "key"
    client = APIClient()

    with patch("apps.factoids.api.OpenRouterClient.list_models", new=AsyncMock(return_value=[])):
        response = client.get(reverse("factoids:models"))
        assert response.status_code == 200
        assert response.json() == {"models": []}


@pytest.mark.django_db()
def test_feedback_endpoint_accepts_submission():
    factoid = models.Factoid.objects.create(text="Example", subject="Science", emoji="🧠")
    client = APIClient()
    payload = {
        "factoid": str(factoid.id),
        "vote": models.VoteType.UP,
        "comments": "Great factoid!",
    }
    response = client.post(reverse("factoids:feedback"), payload, format="json")
    assert response.status_code == 201
    assert models.FactoidFeedback.objects.count() == 1


@pytest.mark.django_db()
def test_limits_endpoint_returns_status():
    client = APIClient()
    response = client.get(reverse("factoids:limits"))
    data = response.json()
    assert response.status_code == 200
    assert "rate_limit" in data
    assert "cost_budget_remaining" in data


@pytest.mark.django_db()
@pytest.mark.parametrize("topic", ["sse-test"])
def test_generate_stream_returns_events(settings, topic):
    settings.OPENROUTER_API_KEY = None
    client = APIClient()
    url = reverse("factoids:generate-stream") + f"?topic={topic}"
    response = client.get(url)
    assert response.status_code == 200
    assert response["Content-Type"] == "text/event-stream"
    payload = b"".join(response.streaming_content)
    assert b"event: factoid" in payload
