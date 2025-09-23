"""Minimal helpers for calling OpenRouter via LangChain."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Sequence

import httpx
from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_FACTOID_MODEL = "openai/gpt-4o-mini"


_PROMPT_TEMPLATE = ChatPromptTemplate.from_messages([("user", "{prompt}")])


@dataclass
class GenerationResult:
    """Structured factoid payload returned by OpenRouter."""

    text: str
    subject: str
    emoji: str
    raw: dict[str, Any]


def generate_factoid_completion(
    *,
    api_key: str,
    base_url: str,
    model: str,
    temperature: float | None,
    prompt: str,
    callbacks: Sequence[Any] | None = None,
) -> GenerationResult:
    """Invoke OpenRouter through LangChain and normalise the response."""

    if not api_key:
        raise ValueError("OpenRouter API key is required")

    callbacks = list(callbacks or [])

    chat_kwargs: dict[str, Any] = {
        "api_key": api_key,
        "base_url": base_url.rstrip("/"),
        "model": model,
    }
    if temperature is not None:
        chat_kwargs["temperature"] = temperature

    chat = ChatOpenAI(**chat_kwargs)
    messages = _PROMPT_TEMPLATE.format_messages(prompt=prompt)
    message = chat.invoke(messages, config={"callbacks": callbacks})
    raw = message.model_dump()
    text, subject, emoji = _extract_factoid_fields(message)
    return GenerationResult(text=text, subject=subject, emoji=emoji, raw=raw)


def fetch_openrouter_models(
    *,
    api_key: str,
    base_url: str,
    transport: httpx.BaseTransport | None = None,
) -> list[dict[str, Any]]:
    """Return the raw model payload from OpenRouter."""

    if not api_key:
        raise ValueError("OpenRouter API key is required")

    headers = {"Authorization": f"Bearer {api_key}"}
    with httpx.Client(
        base_url=base_url.rstrip("/"),
        headers=headers,
        timeout=15,
        transport=transport,
    ) as client:
        response = client.get("/models")
        response.raise_for_status()
        payload = response.json()
    data = payload.get("data", [])
    return [item for item in data if isinstance(item, dict)]


def _extract_factoid_fields(message: BaseMessage) -> tuple[str, str, str]:
    content = _normalise_content(message.content)
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        parsed = {"text": content, "subject": "", "emoji": ""}

    text = str(parsed.get("text") or content)
    subject = str(parsed.get("subject", ""))
    emoji = str(parsed.get("emoji", ""))
    return text, subject, emoji


def _normalise_content(content: Any) -> str:
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text", "")))
            elif isinstance(item, dict):
                # Fallback: stringify any dicts we do not explicitly recognise.
                parts.append(str(item))
            elif item is not None:
                parts.append(str(item))
        content = "".join(parts)

    if not isinstance(content, str):
        return str(content)

    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
    if fenced_match:
        return fenced_match.group(1).strip()

    return content.strip()


__all__ = [
    "DEFAULT_FACTOID_MODEL",
    "DEFAULT_OPENROUTER_BASE_URL",
    "GenerationResult",
    "fetch_openrouter_models",
    "generate_factoid_completion",
]
