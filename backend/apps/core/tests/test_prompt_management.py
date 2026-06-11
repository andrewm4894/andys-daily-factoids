"""Tests for PostHog prompt management helpers."""

from __future__ import annotations

from types import SimpleNamespace

from apps.core import prompt_management
from apps.core.prompt_management import (
    POSTHOG_PROMPT_CACHE_TTL_SECONDS,
    POSTHOG_PROMPT_HOST,
    get_managed_prompt,
)


def teardown_function():
    prompt_management._get_prompts_client.cache_clear()


def test_get_managed_prompt_compiles_local_fallback(settings):
    settings.POSTHOG_PERSONAL_API_KEY = None
    settings.POSTHOG_PROJECT_API_KEY = "phc_test"

    prompt = get_managed_prompt(
        name="test-prompt",
        fallback="Hello {{name}} from {{place}}.",
        variables={"name": "Andy", "place": "PostHog"},
    )

    assert prompt.content == "Hello Andy from PostHog."
    assert prompt.name == "test-prompt"
    assert prompt.source == "code_fallback"
    assert prompt.trace_properties() == {
        "$ai_prompt_name": "test-prompt",
        "$ai_prompt_source": "code_fallback",
    }


def test_get_managed_prompt_uses_posthog_metadata(settings, monkeypatch):
    settings.POSTHOG_PERSONAL_API_KEY = "phx_test"
    settings.POSTHOG_PROJECT_API_KEY = "phc_test"

    class FakePrompts:
        instances = []

        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.instances.append(self)

        def get(self, name, *, with_metadata, fallback, version):
            assert name == "test-prompt"
            assert with_metadata is True
            assert fallback == "Fallback {{name}}"
            assert version == 4
            return SimpleNamespace(
                source="api",
                prompt="Hosted {{name}}",
                name=name,
                version=4,
            )

        def compile(self, prompt, variables):
            return prompt.replace("{{name}}", variables["name"])

    monkeypatch.setattr(prompt_management, "Prompts", FakePrompts)
    prompt_management._get_prompts_client.cache_clear()

    prompt = get_managed_prompt(
        name="test-prompt",
        version=4,
        fallback="Fallback {{name}}",
        variables={"name": "Andy"},
    )

    assert prompt.content == "Hosted Andy"
    assert prompt.name == "test-prompt"
    assert prompt.source == "api"
    assert prompt.version == 4
    assert prompt.trace_properties() == {
        "$ai_prompt_name": "test-prompt",
        "$ai_prompt_source": "api",
        "$ai_prompt_version": 4,
    }
    assert FakePrompts.instances[0].kwargs["host"] == POSTHOG_PROMPT_HOST
    assert (
        FakePrompts.instances[0].kwargs["default_cache_ttl_seconds"]
        == POSTHOG_PROMPT_CACHE_TTL_SECONDS
    )
