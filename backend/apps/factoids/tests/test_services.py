"""Tests for the simplified OpenRouter helpers."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from apps.factoids import models
from apps.factoids.prompts import (
    build_factoid_generation_managed_prompt,
    build_factoid_generation_prompt,
)
from apps.factoids.services.generator import _build_callbacks, _resolve_model_key
from apps.factoids.services.openrouter import (
    DEFAULT_FACTOID_MODEL,
    GenerationResult,
    fetch_openrouter_models,
    generate_factoid_completion,
    model_supports_tools,
)


class FakeMessage:
    def __init__(self, *, content: str, tool_calls: list | None = None):
        self.content = content
        self.tool_calls = tool_calls or []

    def model_dump(self):
        return {"content": self.content, "tool_calls": self.tool_calls}


def _fake_message(content, tool_calls=None):
    return FakeMessage(content=content, tool_calls=tool_calls)


FENCED_JSON_CONTENT = """```json
{
  "text": "Fact",
  "subject": "Science",
  "emoji": "🧠"
}
```"""


def test_prompt_includes_tool_instruction_when_enabled():
    prompt = build_factoid_generation_prompt(use_factoid_tool=True)

    assert "`make_factoid`" in prompt
    assert "Respond as JSON" not in prompt


def test_prompt_defaults_to_json_response():
    prompt = build_factoid_generation_prompt()

    assert "Respond as JSON" in prompt
    assert "`make_factoid`" not in prompt


def test_managed_generation_prompt_uses_code_defined_name(settings):
    settings.POSTHOG_PERSONAL_API_KEY = None

    prompt = build_factoid_generation_managed_prompt(topic="space")

    assert prompt.name == "factoid-generation"
    assert prompt.source == "code_fallback"
    assert "interesting fact about space" in prompt.content
    assert prompt.trace_properties()["$ai_prompt_name"] == "factoid-generation"


@patch("apps.factoids.services.openrouter.model_supports_tools", return_value=True)
def test_generate_factoid_completion_uses_tool_payload_when_available(mock_supports):
    with patch("apps.factoids.services.openrouter.ChatOpenAI") as mock_chat_cls:
        mock_chat = mock_chat_cls.return_value
        bound_chat = MagicMock()
        mock_chat.bind_tools.return_value = bound_chat
        bound_chat.invoke.return_value = _fake_message(
            "",
            tool_calls=[
                {
                    "name": "make_factoid",
                    "args": {
                        "text": "Fact",
                        "subject": "Science",
                        "emoji": "🧠",
                    },
                }
            ],
        )

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
    mock_supports.assert_called_once()
    mock_chat.bind_tools.assert_called_once()
    bound_chat.invoke.assert_called_once()
    mock_chat.invoke.assert_not_called()


@patch("apps.factoids.services.openrouter.model_supports_tools", return_value=False)
@pytest.mark.parametrize(
    "content",
    [
        '{"text": "Fact", "subject": "Science", "emoji": "🧠"}',
        FENCED_JSON_CONTENT,
    ],
)
def test_generate_factoid_completion_parses_content_without_tools(mock_supports, content):
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
    mock_supports.assert_called_once()
    mock_chat.invoke.assert_called_once()


@patch("apps.factoids.services.openrouter.model_supports_tools", return_value=True)
def test_generate_factoid_completion_falls_back_when_tool_payload_invalid(mock_supports):
    with patch("apps.factoids.services.openrouter.ChatOpenAI") as mock_chat_cls:
        mock_chat = mock_chat_cls.return_value
        bound_chat = MagicMock()
        mock_chat.bind_tools.return_value = bound_chat
        bound_chat.invoke.return_value = _fake_message(
            FENCED_JSON_CONTENT,
            tool_calls=[{"name": "make_factoid", "args": {"text": "Fact"}}],
        )

        result = generate_factoid_completion(
            api_key="key",
            base_url="https://example.com",
            model="model",
            temperature=None,
            prompt="Tell me",
        )

    assert result.text == "Fact"
    assert result.subject == "Science"
    assert result.emoji == "🧠"


@patch("apps.factoids.services.openrouter.model_supports_tools", return_value=False)
def test_generate_factoid_completion_falls_back_to_default_on_provider_error(mock_supports):
    from openai import BadRequestError

    bad_request = BadRequestError.__new__(BadRequestError)
    bad_request.status_code = 400

    with patch("apps.factoids.services.openrouter.ChatOpenAI") as mock_chat_cls:
        bad_chat = MagicMock()
        bad_chat.invoke.side_effect = bad_request
        good_chat = MagicMock()
        good_chat.invoke.return_value = _fake_message(
            '{"text": "Fact", "subject": "Science", "emoji": "🧠"}'
        )
        mock_chat_cls.side_effect = [bad_chat, good_chat]

        result = generate_factoid_completion(
            api_key="key",
            base_url="https://example.com",
            model="cloudflare/broken-model",
            temperature=None,
            prompt="Tell me",
        )

    assert result.text == "Fact"
    # First client built for the chosen model, second for the default fallback.
    assert mock_chat_cls.call_count == 2
    assert mock_chat_cls.call_args_list[1].kwargs["model"] == DEFAULT_FACTOID_MODEL


@patch("apps.factoids.services.openrouter.model_supports_tools", return_value=False)
def test_generate_factoid_completion_does_not_fall_back_on_non_provider_error(mock_supports):
    with patch("apps.factoids.services.openrouter.ChatOpenAI") as mock_chat_cls:
        mock_chat = mock_chat_cls.return_value
        mock_chat.invoke.side_effect = RuntimeError("boom")

        with pytest.raises(RuntimeError):
            generate_factoid_completion(
                api_key="key",
                base_url="https://example.com",
                model="cloudflare/broken-model",
                temperature=None,
                prompt="Tell me",
            )

    mock_chat_cls.assert_called_once()


@patch("apps.factoids.services.openrouter.model_supports_tools", return_value=False)
def test_generate_factoid_completion_requires_valid_json(mock_supports):
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


@patch.dict("apps.factoids.services.openrouter._MODEL_TOOL_SUPPORT", {}, clear=True)
@patch("apps.factoids.services.openrouter.fetch_openrouter_models")
def test_model_supports_tools_caches_result(mock_fetch):
    def fake_fetch(**kwargs):
        data = [{"id": "model-1", "supported_parameters": ["tools", "json_schema"]}]
        from apps.factoids.services.openrouter import _cache_model_capabilities

        _cache_model_capabilities(kwargs["base_url"], data)
        return data

    mock_fetch.side_effect = fake_fetch

    assert model_supports_tools("model-1", api_key="key", base_url="https://example.com")
    mock_fetch.assert_called_once()

    mock_fetch.reset_mock()
    assert model_supports_tools("model-1", api_key="key", base_url="https://example.com")
    mock_fetch.assert_not_called()


@patch.dict("apps.factoids.services.openrouter._MODEL_TOOL_SUPPORT", {}, clear=True)
@patch("apps.factoids.services.openrouter.fetch_openrouter_models")
def test_model_supports_tools_returns_false_when_not_supported(mock_fetch):
    def fake_fetch(**kwargs):
        data = [{"id": "model-1", "supported_parameters": ["json_schema"]}]
        from apps.factoids.services.openrouter import _cache_model_capabilities

        _cache_model_capabilities(kwargs["base_url"], data)
        return data

    mock_fetch.side_effect = fake_fetch

    assert not model_supports_tools("model-1", api_key="key", base_url="https://example.com")


@patch.dict("apps.factoids.services.openrouter._MODEL_TOOL_SUPPORT", {}, clear=True)
@patch("apps.factoids.services.openrouter.fetch_openrouter_models", side_effect=Exception("boom"))
def test_model_supports_tools_returns_false_when_fetch_fails(mock_fetch):
    assert not model_supports_tools("model-1", api_key="key", base_url="https://example.com")


@pytest.mark.django_db()
@patch("apps.factoids.services.generator.CallbackHandler")
@patch("apps.factoids.services.generator.initialize_braintrust")
@patch("apps.factoids.services.generator.initialize_langsmith")
@patch("apps.factoids.services.generator.initialize_datadog")
@patch("apps.factoids.services.generator.initialize_langfuse")
@patch("apps.factoids.services.generator.get_braintrust_callback_handler")
@patch("apps.factoids.services.generator.get_langsmith_callback_handler")
@patch("apps.factoids.services.generator.get_datadog_callback_handler")
@patch("apps.factoids.services.generator.get_langfuse_callback_handler")
def test_build_callbacks_uses_distinct_id_and_properties(
    mock_langfuse_handler,
    mock_datadog_handler,
    mock_langsmith_handler,
    mock_braintrust_handler,
    mock_init_langfuse,
    mock_init_datadog,
    mock_init_langsmith,
    mock_init_braintrust,
    mock_handler,
):
    posthog_client = MagicMock()
    mock_handler.return_value = MagicMock()
    mock_braintrust_handler.return_value = None
    mock_langsmith_handler.return_value = None
    mock_datadog_handler.return_value = None
    mock_langfuse_handler.return_value = None

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
    mock_fetch.return_value = [
        {"id": "openai/gpt-4o-mini"},
        {"id": "anthropic/claude-3-haiku"},
    ]
    mock_choice.return_value = "anthropic/claude-3-haiku"

    result = _resolve_model_key(None, api_key="key", base_url="https://example.com")

    assert result == "anthropic/claude-3-haiku"
    mock_choice.assert_called_once_with(["openai/gpt-4o-mini", "anthropic/claude-3-haiku"])


@patch("apps.factoids.services.generator.fetch_openrouter_models")
@patch("apps.factoids.services.generator.random.choice")
def test_resolve_model_key_filters_unusable_models(mock_choice, mock_fetch):
    mock_fetch.return_value = [
        {"id": "openai/gpt-4o-mini"},  # kept
        {"id": "cloudflare/some-model"},  # dropped: provider not allowlisted
        {"id": "meta-llama/llama-3-8b-instruct:free"},  # dropped: free variant
        {
            "id": "google/gemini-vision",
            "architecture": {"output_modalities": ["image"]},
        },  # dropped: no text output
        {"id": 123},  # dropped: invalid id
    ]
    mock_choice.return_value = "openai/gpt-4o-mini"

    result = _resolve_model_key(None, api_key="key", base_url="https://example.com")

    assert result == "openai/gpt-4o-mini"
    mock_choice.assert_called_once_with(["openai/gpt-4o-mini"])


@patch("apps.factoids.services.generator.fetch_openrouter_models")
@patch("apps.factoids.services.generator.random.choice")
def test_resolve_model_key_falls_back_when_no_usable_models(mock_choice, mock_fetch):
    mock_fetch.return_value = [{"id": "cloudflare/some-model"}, {"id": "model-b"}]

    result = _resolve_model_key(None, api_key="key", base_url="https://example.com")

    assert result == DEFAULT_FACTOID_MODEL
    mock_choice.assert_not_called()


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
