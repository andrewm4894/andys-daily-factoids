"""Tests for factoid service helpers."""

import asyncio

import httpx
import pytest

from apps.factoids.services import GenerationRequestPayload, OpenRouterClient


@pytest.mark.django_db()
def test_openrouter_list_models_parses_response(settings):
    settings.SECRET_KEY = "secret"
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={
                "data": [
                    {"id": "model-1", "name": "Model One", "pricing": {"input": 0.001}},
                ]
            },
        )
    )

    client = OpenRouterClient(api_key="test")
    models = asyncio.run(client.list_models(transport=transport))
    assert models[0].id == "model-1"


@pytest.mark.django_db()
def test_openrouter_generate_factoid_parses_json(settings):
    settings.SECRET_KEY = "secret"
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"text": "Fact", "subject": "Science", "emoji": "🧠"}',
                        }
                    }
                ]
            },
        )
    )

    client = OpenRouterClient(api_key="test")
    result = asyncio.run(
        client.generate_factoid(
            GenerationRequestPayload(prompt="Tell me", model="model-1"),
            transport=transport,
        )
    )
    assert result.text == "Fact"
    assert result.subject == "Science"
