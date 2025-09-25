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
    factoid_agent_default_model: str = Field(
        default="openai/gpt-5-mini",
        validation_alias=AliasChoices(
            "FACTOID_AGENT_DEFAULT_MODEL",
            "DJANGO_FACTOID_AGENT_DEFAULT_MODEL",
        ),
    )
    factoid_chat_rate_limit_per_minute: int = Field(
        default=10,
        validation_alias=AliasChoices(
            "FACTOID_CHAT_RATE_LIMIT_PER_MINUTE",
            "DJANGO_FACTOID_CHAT_RATE_LIMIT_PER_MINUTE",
        ),
    )
    factoid_agent_default_model: str = Field(
        default="openai/gpt-5-mini",
        validation_alias=AliasChoices(
            "FACTOID_AGENT_DEFAULT_MODEL",
            "DJANGO_FACTOID_AGENT_DEFAULT_MODEL",
        ),
    )
    tavily_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TAVILY_API_KEY", "DJANGO_TAVILY_API_KEY"),
    )
    posthog_project_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("POSTHOG_PROJECT_API_KEY", "DJANGO_POSTHOG_PROJECT_API_KEY"),
    )
    posthog_host: str | None = Field(
        default="https://us.i.posthog.com",
        validation_alias=AliasChoices("POSTHOG_HOST", "DJANGO_POSTHOG_HOST"),
    )
    posthog_debug: bool = Field(
        default=False,
        validation_alias=AliasChoices("POSTHOG_DEBUG", "DJANGO_POSTHOG_DEBUG"),
    )
    posthog_disabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("POSTHOG_DISABLED", "DJANGO_POSTHOG_DISABLED"),
    )
    stripe_secret_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("STRIPE_SECRET_KEY", "DJANGO_STRIPE_SECRET_KEY"),
    )
    stripe_publishable_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("STRIPE_PUBLISHABLE_KEY", "DJANGO_STRIPE_PUBLISHABLE_KEY"),
    )
    stripe_price_id: str | None = Field(
        default="price_1SAYzlDuK9b9aydCEXpAkQpt",
        validation_alias=AliasChoices("STRIPE_PRICE_ID", "DJANGO_STRIPE_PRICE_ID"),
    )
    stripe_checkout_amount_cents: int = Field(
        default=500,
        validation_alias=AliasChoices(
            "STRIPE_CHECKOUT_AMOUNT_CENTS",
            "DJANGO_STRIPE_CHECKOUT_AMOUNT_CENTS",
        ),
    )
    stripe_checkout_currency: str = Field(
        default="usd",
        validation_alias=AliasChoices(
            "STRIPE_CHECKOUT_CURRENCY",
            "DJANGO_STRIPE_CHECKOUT_CURRENCY",
        ),
    )
    stripe_checkout_product_name: str = Field(
        default="Factoid Booster Pack",
        validation_alias=AliasChoices(
            "STRIPE_CHECKOUT_PRODUCT_NAME",
            "DJANGO_STRIPE_CHECKOUT_PRODUCT_NAME",
        ),
    )
    stripe_factoid_chat_price_id: str | None = Field(
        default="price_1SAv3RDuK9b9aydCBjVtNIPx",
        validation_alias=AliasChoices(
            "STRIPE_FACTOID_CHAT_PRICE_ID",
            "DJANGO_STRIPE_FACTOID_CHAT_PRICE_ID",
        ),
    )
    stripe_factoid_chat_amount_cents: int = Field(
        default=900,
        validation_alias=AliasChoices(
            "STRIPE_FACTOID_CHAT_AMOUNT_CENTS",
            "DJANGO_STRIPE_FACTOID_CHAT_AMOUNT_CENTS",
        ),
    )
    stripe_factoid_chat_currency: str = Field(
        default="usd",
        validation_alias=AliasChoices(
            "STRIPE_FACTOID_CHAT_CURRENCY",
            "DJANGO_STRIPE_FACTOID_CHAT_CURRENCY",
        ),
    )
    stripe_factoid_chat_product_name: str = Field(
        default="Factoid Chat",  # Provided product name
        validation_alias=AliasChoices(
            "STRIPE_FACTOID_CHAT_PRODUCT_NAME",
            "DJANGO_STRIPE_FACTOID_CHAT_PRODUCT_NAME",
        ),
    )
    factoid_generation_examples_count: int = Field(
        default=100,
        validation_alias=AliasChoices(
            "FACTOID_GENERATION_EXAMPLES_COUNT",
            "DJANGO_FACTOID_GENERATION_EXAMPLES_COUNT",
        ),
    )
    stripe_success_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "STRIPE_SUCCESS_URL",
            "STRIPE_CHECKOUT_SUCCESS_URL",
            "DJANGO_STRIPE_SUCCESS_URL",
            "DJANGO_STRIPE_CHECKOUT_SUCCESS_URL",
        ),
    )
    stripe_cancel_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "STRIPE_CANCEL_URL",
            "STRIPE_CHECKOUT_CANCEL_URL",
            "DJANGO_STRIPE_CANCEL_URL",
            "DJANGO_STRIPE_CHECKOUT_CANCEL_URL",
        ),
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
                    self.factoid_agent_default_model = (
                        os.getenv("DJANGO_FACTOID_AGENT_DEFAULT_MODEL")
                        or os.getenv("FACTOID_AGENT_DEFAULT_MODEL")
                        or "openai/gpt-5-mini"
                    )
                    self.factoid_chat_rate_limit_per_minute = int(
                        os.getenv("DJANGO_FACTOID_CHAT_RATE_LIMIT_PER_MINUTE")
                        or os.getenv("FACTOID_CHAT_RATE_LIMIT_PER_MINUTE")
                        or "10"
                    )
                    self.factoid_agent_default_model = (
                        os.getenv("DJANGO_FACTOID_AGENT_DEFAULT_MODEL")
                        or os.getenv("FACTOID_AGENT_DEFAULT_MODEL")
                        or "openai/gpt-5-mini"
                    )
                    self.tavily_api_key = os.getenv("DJANGO_TAVILY_API_KEY") or os.getenv(
                        "TAVILY_API_KEY"
                    )

                    self.posthog_project_api_key = os.getenv(
                        "DJANGO_POSTHOG_PROJECT_API_KEY"
                    ) or os.getenv("POSTHOG_PROJECT_API_KEY")
                    self.posthog_host = (
                        os.getenv("DJANGO_POSTHOG_HOST")
                        or os.getenv("POSTHOG_HOST")
                        or "https://us.i.posthog.com"
                    )
                    self.posthog_debug = (
                        os.getenv("DJANGO_POSTHOG_DEBUG") or os.getenv("POSTHOG_DEBUG") or "false"
                    ).lower() == "true"
                    self.posthog_disabled = (
                        os.getenv("DJANGO_POSTHOG_DISABLED")
                        or os.getenv("POSTHOG_DISABLED")
                        or "false"
                    ).lower() == "true"

                    self.stripe_secret_key = os.getenv("DJANGO_STRIPE_SECRET_KEY") or os.getenv(
                        "STRIPE_SECRET_KEY"
                    )
                    self.stripe_publishable_key = os.getenv(
                        "DJANGO_STRIPE_PUBLISHABLE_KEY"
                    ) or os.getenv("STRIPE_PUBLISHABLE_KEY")
                    self.stripe_price_id = os.getenv("DJANGO_STRIPE_PRICE_ID") or os.getenv(
                        "STRIPE_PRICE_ID"
                    )
                    self.stripe_checkout_amount_cents = int(
                        os.getenv("DJANGO_STRIPE_CHECKOUT_AMOUNT_CENTS")
                        or os.getenv("STRIPE_CHECKOUT_AMOUNT_CENTS")
                        or "500"
                    )
                    self.stripe_checkout_currency = (
                        os.getenv("DJANGO_STRIPE_CHECKOUT_CURRENCY")
                        or os.getenv("STRIPE_CHECKOUT_CURRENCY")
                        or "usd"
                    )
                    self.stripe_checkout_product_name = (
                        os.getenv("DJANGO_STRIPE_CHECKOUT_PRODUCT_NAME")
                        or os.getenv("STRIPE_CHECKOUT_PRODUCT_NAME")
                        or "Factoid Booster Pack"
                    )
                    self.stripe_factoid_chat_price_id = (
                        os.getenv("DJANGO_STRIPE_FACTOID_CHAT_PRICE_ID")
                        or os.getenv("STRIPE_FACTOID_CHAT_PRICE_ID")
                        or "price_1SAv3RDuK9b9aydCBjVtNIPx"
                    )
                    self.stripe_factoid_chat_amount_cents = int(
                        os.getenv("DJANGO_STRIPE_FACTOID_CHAT_AMOUNT_CENTS")
                        or os.getenv("STRIPE_FACTOID_CHAT_AMOUNT_CENTS")
                        or "900"
                    )
                    self.stripe_factoid_chat_currency = (
                        os.getenv("DJANGO_STRIPE_FACTOID_CHAT_CURRENCY")
                        or os.getenv("STRIPE_FACTOID_CHAT_CURRENCY")
                        or "usd"
                    )
                    self.stripe_factoid_chat_product_name = (
                        os.getenv("DJANGO_STRIPE_FACTOID_CHAT_PRODUCT_NAME")
                        or os.getenv("STRIPE_FACTOID_CHAT_PRODUCT_NAME")
                        or "Factoid Chat"
                    )
                    self.stripe_success_url = (
                        os.getenv("DJANGO_STRIPE_SUCCESS_URL")
                        or os.getenv("DJANGO_STRIPE_CHECKOUT_SUCCESS_URL")
                        or os.getenv("STRIPE_SUCCESS_URL")
                        or os.getenv("STRIPE_CHECKOUT_SUCCESS_URL")
                    )
                    self.stripe_cancel_url = (
                        os.getenv("DJANGO_STRIPE_CANCEL_URL")
                        or os.getenv("DJANGO_STRIPE_CHECKOUT_CANCEL_URL")
                        or os.getenv("STRIPE_CANCEL_URL")
                        or os.getenv("STRIPE_CHECKOUT_CANCEL_URL")
                    )
                    self.factoid_generation_examples_count = int(
                        os.getenv("DJANGO_FACTOID_GENERATION_EXAMPLES_COUNT")
                        or os.getenv("FACTOID_GENERATION_EXAMPLES_COUNT")
                        or "100"
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
