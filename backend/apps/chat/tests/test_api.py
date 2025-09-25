"""Tests for chat agent API endpoints."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from django.urls import reverse
from langchain_core.messages import AIMessage
from rest_framework.test import APIClient

from apps.chat import models as chat_models
from apps.core.services import RateLimitExceeded
from apps.factoids import models as factoid_models


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.mark.django_db()
def test_create_session_without_initial_message(client):
    factoid = factoid_models.Factoid.objects.create(
        text="Water is composed of hydrogen and oxygen.",
        subject="Chemistry",
        emoji="💧",
    )

    response = client.post(
        reverse("chat:session-create"),
        {"factoid_id": str(factoid.id)},
        format="json",
        HTTP_USER_AGENT="pytest",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["messages"] == []
    assert payload["session"]["factoid_id"] == str(factoid.id)
    assert chat_models.ChatSession.objects.count() == 1


def _agent_stub(**kwargs):
    history = list(kwargs.get("history", []))
    return history + [AIMessage(content="Here is more context about your factoid.")]


@pytest.mark.django_db()
def test_create_session_with_message_invokes_agent(client, settings):
    settings.OPENROUTER_API_KEY = "test-key"
    factoid = factoid_models.Factoid.objects.create(
        text="The Eiffel Tower can be 15 cm taller during hot days.",
        subject="Engineering",
        emoji="🗼",
    )

    with patch("apps.chat.api.run_factoid_agent", side_effect=_agent_stub) as agent_mock:
        response = client.post(
            reverse("chat:session-create"),
            {
                "factoid_id": str(factoid.id),
                "message": "Tell me more",
            },
            format="json",
            HTTP_USER_AGENT="pytest",
        )

    assert response.status_code == 201
    payload = response.json()
    assert len(payload["messages"]) == 2
    assert payload["messages"][0]["role"] == chat_models.ChatMessageRole.USER
    assert payload["messages"][1]["role"] == chat_models.ChatMessageRole.ASSISTANT
    agent_mock.assert_called_once()


@pytest.mark.django_db()
def test_append_message_rate_limited_returns_checkout(client, settings, monkeypatch):
    settings.OPENROUTER_API_KEY = "test-key"
    factoid = factoid_models.Factoid.objects.create(
        text="Bananas are berries, but strawberries are not.",
        subject="Botany",
        emoji="🍓",
    )

    session = chat_models.ChatSession.objects.create(
        factoid=factoid,
        client_hash="hash",
        model_key="openai/gpt-4o-mini",
        config={"posthog_distinct_id": "user", "posthog_properties": {}},
    )

    monkeypatch.setattr(
        "apps.chat.api._rate_limiter",
        MagicMock(
            **{
                "check.side_effect": RateLimitExceeded(3.0),
                "get_count.return_value": 5,
            }
        ),
    )

    with patch(
        "apps.chat.api.create_chat_checkout_session",
        return_value={"session_id": "cs_test", "checkout_url": "https://stripe"},
    ):
        response = client.post(
            reverse("chat:session-message-create", args=[session.id]),
            {"message": "Another question"},
            format="json",
        )

    assert response.status_code == 429
    payload = response.json()
    assert payload["code"] == "rate_limit"
    assert payload["checkout_session"]["session_id"] == "cs_test"


@pytest.mark.django_db()
def test_append_message_persists_assistant_reply(client, settings):
    settings.OPENROUTER_API_KEY = "test-key"
    factoid = factoid_models.Factoid.objects.create(
        text="Octopuses have three hearts.",
        subject="Biology",
        emoji="🐙",
    )

    session = chat_models.ChatSession.objects.create(
        factoid=factoid,
        client_hash="hash",
        model_key="openai/gpt-4o-mini",
        config={"posthog_distinct_id": "user", "posthog_properties": {}},
    )
    chat_models.ChatMessage.objects.create(
        session=session,
        role=chat_models.ChatMessageRole.USER,
        content={"text": "What's special about their hearts?"},
    )

    with patch("apps.chat.api.run_factoid_agent", side_effect=_agent_stub):
        response = client.post(
            reverse("chat:session-message-create", args=[session.id]),
            {"message": "Do they all beat at once?"},
            format="json",
        )

    assert response.status_code == 200
    payload = response.json()
    assistant_messages = [
        m for m in payload["messages"] if m["role"] == chat_models.ChatMessageRole.ASSISTANT
    ]
    assert assistant_messages
    session.refresh_from_db()
    assert session.messages.filter(role=chat_models.ChatMessageRole.ASSISTANT).exists()
