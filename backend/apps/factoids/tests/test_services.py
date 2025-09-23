"""Tests for the simplified OpenRouter helpers."""

from __future__ import annotations

from collections import namedtuple
from unittest.mock import patch

import httpx
import pytest

from apps.factoids.services.openrouter import (
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


def test_fetch_openrouter_models_uses_transport():
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"data": [{"id": "model-1"}]})
    )

    models = fetch_openrouter_models(
        api_key="key",
        base_url="https://example.com",
        transport=transport,
    )

    assert models == [{"id": "model-1"}]
