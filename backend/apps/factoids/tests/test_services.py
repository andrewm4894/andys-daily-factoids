"""Tests for the simplified OpenRouter helpers."""

from __future__ import annotations

from collections import namedtuple
from unittest.mock import MagicMock, patch

import httpx
import pytest

from apps.factoids import models
from apps.factoids.services.generator import _build_callbacks, _resolve_model_key
from apps.factoids.services.openrouter import (
    DEFAULT_FACTOID_MODEL,
    GenerationResult,
    fetch_openrouter_models,
    generate_factoid_completion,
)

FakeMessage = namedtuple("FakeMessage", ["content", "model_dump"])


def _fake_message(content):
    return FakeMessage(content=content, model_dump=lambda: {"content": content})


FENCED_JSON_CONTENT = """```json
{
  "text": "Fact",
  "subject": "Science",
  "emoji": "🧠"
}
```"""


@pytest.mark.parametrize(
    "content",
    [
        '{"text": "Fact", "subject": "Science", "emoji": "🧠"}',
        FENCED_JSON_CONTENT,
    ],
)
def test_generate_factoid_completion_parses_content(content):
    with patch("apps.factoids.services.openrouter.ChatOpenAI") as mock_chat_cls:
        mock_chat = mock_chat_cls.return_value
        mock_chat.invoke.return_value = _fake_message(content)

        result = generate_factoid_completion(
            api_key="key",
            base_url="https://example.com",
            model="model",
            temperature=None,
            prompt="Tell me",
        )

    assert isinstance(result, GenerationResult)
    assert result.text == "Fact"
    assert result.subject == "Science"
    assert result.emoji == "🧠"


def test_generate_factoid_completion_requires_valid_json():
    with patch("apps.factoids.services.openrouter.ChatOpenAI") as mock_chat_cls:
        mock_chat = mock_chat_cls.return_value
        mock_chat.invoke.return_value = _fake_message("not json")

        with pytest.raises(ValueError):
            generate_factoid_completion(
                api_key="key",
                base_url="https://example.com",
                model="model",
                temperature=None,
                prompt="Tell me",
            )


def test_fetch_openrouter_models_uses_transport():
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"data": [{"id": "model-1"}]})
    )

    model_list = fetch_openrouter_models(
        api_key="key",
        base_url="https://example.com",
        transport=transport,
    )

    assert model_list == [{"id": "model-1"}]


@pytest.mark.django_db()
@patch("apps.factoids.services.generator.CallbackHandler")
def test_build_callbacks_uses_distinct_id_and_properties(mock_handler):
    posthog_client = MagicMock()
    mock_handler.return_value = MagicMock()

    callbacks = _build_callbacks(
        posthog_client,
        distinct_id="ph-user",
        trace_id="trace",
        topic="space",
        profile="anonymous",
        request_source=models.RequestSource.MANUAL,
        extra_properties={"foo": "bar"},
    )

    mock_handler.assert_called_once()
    assert callbacks == [mock_handler.return_value]
    _, kwargs = mock_handler.call_args
    assert kwargs["distinct_id"] == "ph-user"
    assert kwargs["properties"]["foo"] == "bar"


@patch("apps.factoids.services.generator.fetch_openrouter_models")
@patch("apps.factoids.services.generator.random.choice")
def test_resolve_model_key_returns_random_choice(mock_choice, mock_fetch):
    mock_fetch.return_value = [{"id": "model-a"}, {"id": "model-b"}]
    mock_choice.return_value = "model-b"

    result = _resolve_model_key(None, api_key="key", base_url="https://example.com")

    assert result == "model-b"
    mock_choice.assert_called_once_with(["model-a", "model-b"])


@patch("apps.factoids.services.generator.fetch_openrouter_models", side_effect=Exception("boom"))
@patch("apps.factoids.services.generator.random.choice")
def test_resolve_model_key_falls_back_to_default(mock_choice, mock_fetch):
    result = _resolve_model_key(None, api_key="key", base_url="https://example.com")

    assert result == DEFAULT_FACTOID_MODEL
    mock_choice.assert_not_called()


@patch("apps.factoids.services.generator.fetch_openrouter_models")
def test_resolve_model_key_returns_preferred_when_provided(mock_fetch):
    result = _resolve_model_key("user-model", api_key="key", base_url="https://example.com")

    assert result == "user-model"
    mock_fetch.assert_not_called()
