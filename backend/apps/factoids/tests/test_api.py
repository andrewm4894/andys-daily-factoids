"""API tests for factoid endpoints."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch
from urllib.parse import quote

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.services import InMemoryRateLimiter, RateLimitConfig
from apps.core.services import rate_limits as rate_limit_module
from apps.factoids import api as factoids_api
from apps.factoids import models
from apps.factoids.services import GenerationResult


@pytest.fixture(autouse=True)
def reset_rate_limiter_and_cost_guard():
    limiter = InMemoryRateLimiter()
    factoids_api._rate_limiter = limiter
    rate_limit_module._rate_limiter_singleton = limiter  # type: ignore[attr-defined]
    factoids_api._cost_guard.profile_usage = {
        profile: 0.0 for profile in factoids_api._cost_guard.profile_budgets
    }
    yield
    limiter = InMemoryRateLimiter()
    factoids_api._rate_limiter = limiter
    rate_limit_module._rate_limiter_singleton = limiter  # type: ignore[attr-defined]
    factoids_api._cost_guard.profile_usage = {
        profile: 0.0 for profile in factoids_api._cost_guard.profile_budgets
    }


@pytest.mark.django_db()
def test_factoid_list_returns_existing_factoid():
    models.Factoid.objects.create(text="Example", subject="Science", emoji="🧠")
    client = APIClient()
    response = client.get(reverse("factoids:factoid-list"))
    assert response.status_code == 200
    data = response.json()
    assert data["results"][0]["text"] == "Example"


@pytest.mark.django_db()
def test_top_endpoint_orders_by_net_score():
    low = models.Factoid.objects.create(text="Low", votes_up=1, votes_down=0)
    high = models.Factoid.objects.create(text="High", votes_up=10, votes_down=1)
    negative = models.Factoid.objects.create(text="Negative", votes_up=0, votes_down=5)

    client = APIClient()
    response = client.get(reverse("factoids:factoid-top"))

    assert response.status_code == 200
    results = response.json()["results"]
    order = [item["id"] for item in results]
    assert order == [str(high.id), str(low.id), str(negative.id)]


@pytest.mark.django_db()
def test_top_endpoint_excludes_factoids_outside_window():
    recent = models.Factoid.objects.create(text="Recent", votes_up=1)
    old = models.Factoid.objects.create(text="Old", votes_up=100)
    stale = timezone.now() - timedelta(days=40)
    models.Factoid.objects.filter(pk=old.pk).update(created_at=stale)

    client = APIClient()
    response = client.get(reverse("factoids:factoid-top"), {"days": 30})

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["results"]]
    assert ids == [str(recent.id)]


@pytest.mark.django_db()
def test_factoid_generation_without_api_key_returns_error(settings):
    settings.OPENROUTER_API_KEY = None
    client = APIClient()
    response = client.post(reverse("factoids:generate"), {"topic": "gravity"}, format="json")
    assert response.status_code == 502
    assert response.json()["detail"] == "OpenRouter API key is not configured"


@pytest.mark.django_db()
def test_factoid_generation_invokes_openrouter(settings):
    settings.OPENROUTER_API_KEY = "test-key"
    settings.POSTHOG_PROJECT_API_KEY = "phc_test"
    client = APIClient()

    mock_result = GenerationResult(text="Fact", subject="Science", emoji="🧠", raw={})

    with (
        patch(
            "apps.factoids.services.generator.generate_factoid_completion",
            return_value=mock_result,
        ) as mock_generate,
        patch(
            "apps.factoids.services.generator._build_callbacks",
            return_value=[],
        ) as mock_callbacks,
    ):
        response = client.post(
            reverse("factoids:generate"),
            {
                "topic": "science",
                "posthog_distinct_id": "ph-user",
                "posthog_properties": {"foo": "bar"},
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["text"] == "Fact"
        mock_generate.assert_called_once()
        mock_callbacks.assert_called_once()
        _, callback_kwargs = mock_callbacks.call_args
        assert callback_kwargs["distinct_id"] == "ph-user"
        assert callback_kwargs["extra_properties"] == {
            "$ai_prompt_name": "factoid-generation",
            "$ai_prompt_source": "code_fallback",
            "foo": "bar",
        }


@pytest.mark.django_db()
def test_vote_endpoint_allows_multiple_votes():
    factoid = models.Factoid.objects.create(text="Example", subject="Science", emoji="🧠")
    client = APIClient()
    url = reverse("factoids:vote", args=[factoid.id])

    first_response = client.post(url, {"vote": models.VoteType.UP}, format="json")
    assert first_response.status_code == 200
    assert first_response.json()["votes_up"] == 1

    second_response = client.post(url, {"vote": models.VoteType.UP}, format="json")
    assert second_response.status_code == 200
    assert second_response.json()["votes_up"] == 2


@pytest.mark.django_db()
def test_vote_endpoint_enforces_rate_limit(monkeypatch):
    factoid = models.Factoid.objects.create(text="Example", subject="Science", emoji="🧠")
    client = APIClient()
    url = reverse("factoids:vote", args=[factoid.id])

    original_config = factoids_api.FactoidVoteView.rate_limit_config
    factoids_api.FactoidVoteView.rate_limit_config = RateLimitConfig(window_seconds=60, limit=1)
    try:
        assert client.post(url, {"vote": models.VoteType.UP}, format="json").status_code == 200
        response = client.post(url, {"vote": models.VoteType.UP}, format="json")
        assert response.status_code == 429
        data = response.json()
        assert data["detail"] == "Vote rate limit exceeded"
        assert "retry_after" in data
    finally:
        factoids_api.FactoidVoteView.rate_limit_config = original_config


@pytest.mark.django_db()
def test_models_endpoint_uses_openrouter(settings):
    settings.OPENROUTER_API_KEY = "key"
    client = APIClient()

    with patch("apps.factoids.api.fetch_openrouter_models", return_value=[]):
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
def test_generate_stream_emits_factoid_event(settings, topic):
    settings.OPENROUTER_API_KEY = "key"
    settings.POSTHOG_PROJECT_API_KEY = "phc_test"
    client = APIClient()
    encoded_props = quote('{"foo": "bar"}')
    url = (
        reverse("factoids:generate-stream")
        + f"?topic={topic}&posthog_distinct_id=ph-user&posthog_properties={encoded_props}"
    )
    mock_result = GenerationResult(text="Fact", subject="Science", emoji="🧠", raw={})

    with (
        patch(
            "apps.factoids.services.generator.generate_factoid_completion",
            return_value=mock_result,
        ),
        patch(
            "apps.factoids.services.generator._build_callbacks",
            return_value=[],
        ) as mock_callbacks,
    ):
        response = client.get(url)
        assert response.status_code == 200
        assert response["Content-Type"] == "text/event-stream"
        payload = b"".join(response.streaming_content)
        assert b"event: factoid" in payload
        assert b"Fact" in payload
        mock_callbacks.assert_called_once()
