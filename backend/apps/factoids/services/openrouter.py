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
from pydantic import BaseModel, ValidationError

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


class FactoidPayload(BaseModel):
    text: str
    subject: str
    emoji: str


_MODEL_TOOL_SUPPORT: dict[tuple[str, str], bool] = {}


_FACTOID_TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "make_factoid",
        "description": (
            "Provide the final factoid once you are confident in it. Always include"
            " a concise text body, a short descriptive subject, and a single emoji."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "The factoid text rendered to users.",
                },
                "subject": {
                    "type": "string",
                    "description": "A short title or subject for the factoid.",
                },
                "emoji": {
                    "type": "string",
                    "description": "A single emoji that captures the factoid mood.",
                },
            },
            "required": ["text", "subject", "emoji"],
        },
    },
}

_FACTOID_TOOL_NAMES = {"make_factoid", "get_factoid"}


def generate_factoid_completion(
    *,
    api_key: str,
    base_url: str,
    model: str,
    temperature: float | None,
    prompt: str,
    callbacks: Sequence[Any] | None = None,
    supports_tools: bool | None = None,
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
    if supports_tools is None:
        supports_tools = model_supports_tools(model, api_key=api_key, base_url=base_url)
    runnable = _bind_factoid_tool(chat) if supports_tools else chat

    # Configure with callbacks and metadata for trace naming
    invoke_config = {
        "callbacks": callbacks,
        "run_name": "factoid_generation",
    }

    try:
        message = runnable.invoke(messages, config=invoke_config)
    except Exception:
        if runnable is not chat:
            message = chat.invoke(messages, config=invoke_config)
        else:
            raise
    raw = message.model_dump()
    try:
        text, subject, emoji = _extract_factoid_from_tool_call(message)
    except ValueError:
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
    _cache_model_capabilities(base_url, data)
    return [item for item in data if isinstance(item, dict)]


def _extract_factoid_fields(message: BaseMessage) -> tuple[str, str, str]:
    content = _normalise_content(message.content)
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError("Model response did not contain valid JSON") from exc

    try:
        payload = FactoidPayload.model_validate(data)
    except ValidationError as exc:
        raise ValueError("Model response is missing required factoid fields") from exc

    return payload.text.strip(), payload.subject.strip(), payload.emoji.strip()


def _extract_factoid_from_tool_call(message: BaseMessage) -> tuple[str, str, str]:
    tool_calls = getattr(message, "tool_calls", None)
    if not tool_calls:
        raise ValueError("No tool calls present in message")

    for tool_call in tool_calls:
        name = _resolve_tool_call_name(tool_call)
        if name not in _FACTOID_TOOL_NAMES:
            continue

        args = _resolve_tool_call_args(tool_call)
        try:
            payload = FactoidPayload.model_validate(args)
        except ValidationError as exc:
            raise ValueError("Tool call arguments missing required fields") from exc

        return payload.text.strip(), payload.subject.strip(), payload.emoji.strip()

    raise ValueError("No matching factoid tool call found")


def _resolve_tool_call_name(tool_call: Any) -> str | None:
    if hasattr(tool_call, "name") and isinstance(tool_call.name, str):
        return tool_call.name

    if isinstance(tool_call, dict):
        if isinstance(tool_call.get("name"), str):
            return tool_call["name"]
        function = tool_call.get("function")
        if isinstance(function, dict) and isinstance(function.get("name"), str):
            return function["name"]

    function = getattr(tool_call, "function", None)
    if function is not None and isinstance(getattr(function, "name", None), str):
        return function.name

    return None


def _resolve_tool_call_args(tool_call: Any) -> dict[str, Any]:
    raw_args: Any = None

    if hasattr(tool_call, "args"):
        raw_args = tool_call.args

    if raw_args is None and isinstance(tool_call, dict):
        raw_args = tool_call.get("args")
        if raw_args is None:
            function = tool_call.get("function")
            if isinstance(function, dict):
                raw_args = function.get("arguments")

    if raw_args is None:
        function = getattr(tool_call, "function", None)
        if function is not None:
            raw_args = getattr(function, "arguments", None)

    if isinstance(raw_args, str):
        try:
            raw_args = json.loads(raw_args)
        except json.JSONDecodeError as exc:
            raise ValueError("Tool call arguments were not valid JSON") from exc

    if isinstance(raw_args, dict):
        return raw_args

    raise ValueError("Tool call arguments are missing or malformed")


def _cache_model_capabilities(base_url: str, models: Sequence[dict[str, Any]]) -> None:
    base = _normalise_base_url(base_url)
    for item in models:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        if not isinstance(model_id, str):
            continue
        supported = item.get("supported_parameters")
        supports_tools = _supports_tools_from_payload(supported)
        _MODEL_TOOL_SUPPORT[(base, model_id)] = supports_tools


def _supports_tools_from_payload(payload: Any) -> bool:
    if isinstance(payload, dict):
        return any(str(key) == "tools" for key in payload)
    if isinstance(payload, (list, tuple, set)):
        return any(str(item) == "tools" for item in payload)
    return False


def model_supports_tools(
    model: str,
    *,
    api_key: str,
    base_url: str,
) -> bool:
    base = _normalise_base_url(base_url)
    cache_key = (base, model)
    if cache_key in _MODEL_TOOL_SUPPORT:
        return _MODEL_TOOL_SUPPORT[cache_key]

    try:
        fetch_openrouter_models(
            api_key=api_key,
            base_url=base_url,
        )
    except Exception:
        return False

    return _MODEL_TOOL_SUPPORT.get(cache_key, False)


def _normalise_base_url(base_url: str) -> str:
    return base_url.rstrip("/")


def _bind_factoid_tool(chat: ChatOpenAI):
    bind = getattr(chat, "bind_tools", None)
    if callable(bind):
        try:
            return bind([_FACTOID_TOOL_DEFINITION])
        except Exception:
            return chat
    return chat


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
    "model_supports_tools",
]
