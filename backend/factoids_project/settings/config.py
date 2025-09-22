"""Pydantic-backed configuration for Django settings."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _safe_json_loads(value: str) -> Any:
    if value in (None, ""):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_ENV_FILE = BASE_DIR / ".env"


class AppSettings(BaseSettings):
    """Environment-driven configuration for the Django project."""

    debug: bool = False
    secret_key: str = "development-secret-key"
    allowed_hosts: list[str] = Field(default_factory=list)
    cors_allowed_origins: list[str] = Field(default_factory=list)
    database_url: str | None = None
    db_conn_max_age: int = 60
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    model_config = SettingsConfigDict(
        env_prefix="DJANGO_",
        case_sensitive=False,
        extra="allow",
    )

    @field_validator("allowed_hosts", "cors_allowed_origins", mode="before")
    @classmethod
    def _split_csv(cls, value: Any) -> list[str] | Any:
        if value in (None, ""):
            return []
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache()
def get_settings(env_file: str | os.PathLike[str] | None = None) -> AppSettings:
    """Load settings from environment and optional .env file with caching."""

    kwargs: dict[str, Any] = {}
    env_file_path: Path | None = None

    if env_file:
        env_file_path = Path(env_file)
    elif os.getenv("DJANGO_ENV_FILE"):
        env_file_path = Path(os.environ["DJANGO_ENV_FILE"])
    elif DEFAULT_ENV_FILE.exists():
        env_file_path = DEFAULT_ENV_FILE

    if env_file_path is not None:
        kwargs["_env_file"] = env_file_path
        kwargs["_env_file_encoding"] = "utf-8"

    return AppSettings(**kwargs)


__all__ = [
    "AppSettings",
    "BASE_DIR",
    "DEFAULT_ENV_FILE",
    "get_settings",
]
