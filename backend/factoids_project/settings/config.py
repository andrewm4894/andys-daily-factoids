"""Pydantic-backed configuration for Django settings."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import AliasChoices, Field, field_validator
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
    posthog_project_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("POSTHOG_PROJECT_API_KEY", "DJANGO_POSTHOG_PROJECT_API_KEY"),
    )
    posthog_host: str | None = Field(
        default="https://us.i.posthog.com",
        validation_alias=AliasChoices("POSTHOG_HOST", "DJANGO_POSTHOG_HOST"),
    )

    model_config = SettingsConfigDict(
        env_prefix="DJANGO_",
        case_sensitive=False,
        extra="allow",
    )

    @field_validator("allowed_hosts", "cors_allowed_origins", mode="before")
    @classmethod
    def _split_csv(cls, value: Any) -> list[str]:
        if value is None or value == "":
            return []
        if isinstance(value, str):
            try:
                return [item.strip() for item in value.split(",") if item.strip()]
            except Exception:
                return [value.strip()] if value.strip() else []
        if isinstance(value, list):
            return value
        # Fallback: convert to string and try again
        try:
            return [str(value).strip()] if str(value).strip() else []
        except Exception:
            return []


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

    try:
        return AppSettings(**kwargs)
    except Exception as e:
        # Fallback for production deployment with problematic env vars
        if "allowed_hosts" in str(e).lower():
            # Create a minimal settings object with direct env parsing
            class FallbackSettings:
                def __init__(self):
                    self.debug = os.getenv("DJANGO_DEBUG", "False").lower() == "true"
                    self.secret_key = os.getenv("DJANGO_SECRET_KEY", "development-secret-key")
                    
                    # Parse allowed hosts manually
                    hosts_env = os.getenv("DJANGO_ALLOWED_HOSTS", "")
                    if hosts_env:
                        self.allowed_hosts = [h.strip() for h in hosts_env.split(",") if h.strip()]
                    else:
                        self.allowed_hosts = []
                    
                    # Parse CORS origins manually
                    cors_env = os.getenv("DJANGO_CORS_ALLOWED_ORIGINS", "")
                    if cors_env:
                        self.cors_allowed_origins = [
                            origin.strip() for origin in cors_env.split(",") if origin.strip()
                        ]
                    else:
                        self.cors_allowed_origins = []

                    self.database_url = os.getenv("DJANGO_DATABASE_URL") or os.getenv(
                        "DATABASE_URL"
                    )
                    self.db_conn_max_age = int(os.getenv("DJANGO_DB_CONN_MAX_AGE", "60"))
                    self.openrouter_api_key = os.getenv("DJANGO_OPENROUTER_API_KEY") or os.getenv(
                        "OPENROUTER_API_KEY"
                    )
                    self.openrouter_base_url = os.getenv(
                        "DJANGO_OPENROUTER_BASE_URL",
                        "https://openrouter.ai/api/v1",
                    )

                    self.posthog_project_api_key = os.getenv(
                        "DJANGO_POSTHOG_PROJECT_API_KEY"
                    ) or os.getenv("POSTHOG_PROJECT_API_KEY")
                    self.posthog_host = (
                        os.getenv("DJANGO_POSTHOG_HOST")
                        or os.getenv("POSTHOG_HOST")
                        or "https://us.i.posthog.com"
                    )
                    
            return FallbackSettings()  # type: ignore
        else:
            raise


__all__ = [
    "AppSettings",
    "BASE_DIR",
    "DEFAULT_ENV_FILE",
    "get_settings",
]
