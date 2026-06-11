"""Helpers for PostHog Prompt Management."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Mapping

from django.conf import settings

try:
    from posthog.ai.prompts import Prompts
except ImportError:  # pragma: no cover - depends on installed PostHog SDK version
    Prompts = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

POSTHOG_PROMPT_HOST = "https://us.posthog.com"
POSTHOG_PROMPT_CACHE_TTL_SECONDS = 300


@dataclass(frozen=True)
class ManagedPrompt:
    """A compiled prompt plus PostHog metadata for trace correlation."""

    content: str
    name: str
    source: str = "code_fallback"
    version: int | None = None

    def trace_properties(self) -> dict[str, object]:
        properties: dict[str, object] = {
            "$ai_prompt_name": self.name,
            "$ai_prompt_source": self.source,
        }
        if self.version is not None:
            properties["$ai_prompt_version"] = self.version
        return properties


def get_managed_prompt(
    *,
    name: str,
    fallback: str,
    variables: Mapping[str, object],
    version: int | None = None,
) -> ManagedPrompt:
    """Fetch and compile a PostHog-managed prompt, falling back to local content."""

    client = _get_prompts_client()
    if client is None:
        return ManagedPrompt(
            content=_compile_template(fallback, variables),
            name=name,
        )

    try:
        result = client.get(
            name,
            with_metadata=True,
            fallback=fallback,
            version=version,
        )
        content = client.compile(result.prompt, dict(variables))
        return ManagedPrompt(
            content=content,
            name=result.name or name,
            source=result.source,
            version=result.version,
        )
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning("Failed to load managed prompt %s: %s", name, exc)
        return ManagedPrompt(
            content=_compile_template(fallback, variables),
            name=name,
        )


@lru_cache(maxsize=1)
def _get_prompts_client():
    personal_api_key = getattr(settings, "POSTHOG_PERSONAL_API_KEY", None)
    project_api_key = getattr(settings, "POSTHOG_PROJECT_API_KEY", None)
    if not personal_api_key or not project_api_key or Prompts is None:
        return None

    return Prompts(
        personal_api_key=personal_api_key,
        project_api_key=project_api_key,
        host=POSTHOG_PROMPT_HOST,
        default_cache_ttl_seconds=POSTHOG_PROMPT_CACHE_TTL_SECONDS,
        capture_errors=False,
    )


def _compile_template(template: str, variables: Mapping[str, object]) -> str:
    def replace_variable(match: re.Match[str]) -> str:
        variable_name = match.group(1)
        if variable_name in variables:
            return str(variables[variable_name])
        return match.group(0)

    return re.sub(r"\{\{([\w.-]+)\}\}", replace_variable, template)


__all__ = [
    "ManagedPrompt",
    "POSTHOG_PROMPT_CACHE_TTL_SECONDS",
    "POSTHOG_PROMPT_HOST",
    "get_managed_prompt",
]
