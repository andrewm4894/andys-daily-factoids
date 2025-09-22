"""Service layer for interacting with OpenRouter and orchestrating factoid generation."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import BaseModel, Field

DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class ModelInfo(BaseModel):
    id: str
    name: str | None = None
    pricing: dict[str, Any] | None = None
    context_length: int | None = Field(default=None, alias="context_length")


class GenerationResult(BaseModel):
    text: str
    subject: str
    emoji: str
    raw: dict[str, Any]


@dataclass
class GenerationRequestPayload:
    prompt: str
    model: str
    max_tokens: int | None = None
    temperature: float | None = None


class OpenRouterClient:
    """Thin wrapper around the OpenRouter REST API."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_OPENROUTER_BASE_URL) -> None:
        if not api_key:
            raise ValueError("OpenRouter API key is required")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    async def list_models(self, *, transport: httpx.BaseTransport | None = None) -> list[ModelInfo]:
        async with httpx.AsyncClient(
            base_url=self.base_url,
            headers=self._headers,
            transport=transport,
            timeout=15,
        ) as client:
            response = await client.get("/models")
            response.raise_for_status()
            payload = response.json()
            data = payload.get("data", [])
            return [ModelInfo.model_validate(item) for item in data]

    async def generate_factoid(
        self,
        payload: GenerationRequestPayload,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> GenerationResult:
        request_body: dict[str, Any] = {
            "model": payload.model,
            "messages": [
                {
                    "role": "user",
                    "content": payload.prompt,
                }
            ],
        }
        if payload.max_tokens is not None:
            request_body["max_tokens"] = payload.max_tokens
        if payload.temperature is not None:
            request_body["temperature"] = payload.temperature
        async with httpx.AsyncClient(
            base_url=self.base_url,
            headers=self._headers,
            transport=transport,
            timeout=60,
        ) as client:
            response = await client.post("/chat/completions", json=request_body)
            response.raise_for_status()
            raw = response.json()
            text, subject, emoji = self._extract_factoid(raw)
            return GenerationResult(text=text, subject=subject, emoji=emoji, raw=raw)

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _extract_factoid(raw_response: dict[str, Any]) -> tuple[str, str, str]:
        """Attempt to parse the model response into the expected factoid shape."""

        choices = raw_response.get("choices", [])
        if not choices:
            raise ValueError("OpenRouter response missing choices")
        message = choices[0].get("message", {})
        content = message.get("content", "")

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            parsed = {"text": content, "subject": "", "emoji": ""}

        text = parsed.get("text") or content
        subject = parsed.get("subject", "")
        emoji = parsed.get("emoji", "")
        return text, subject, emoji
