"""Utility helpers for API key generation and verification."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass

from django.conf import settings

DEFAULT_API_KEY_LENGTH = 40
DEFAULT_API_KEY_PREFIX = "adf"


@dataclass
class GeneratedAPIKey:
    """Contains the plain and hashed representations of a newly created key."""

    plain_key: str
    hashed_key: str


def _get_secret_salt() -> str:
    secret = getattr(settings, "SECRET_KEY", "")
    if not secret:
        secret = "fallback-secret"
    return secret


def generate_api_key(
    prefix: str = DEFAULT_API_KEY_PREFIX,
    length: int = DEFAULT_API_KEY_LENGTH,
) -> GeneratedAPIKey:
    """Generate a new API key and return both the raw value and hashed representation."""

    random_part = secrets.token_urlsafe(length)
    plain_key = f"{prefix}_{random_part}"
    hashed_key = hash_api_key(plain_key)
    return GeneratedAPIKey(plain_key=plain_key, hashed_key=hashed_key)


def hash_api_key(raw_key: str) -> str:
    """Hash an API key using HMAC-SHA256 tied to the Django secret key."""

    secret_salt = _get_secret_salt().encode("utf-8")
    digest = hmac.new(secret_salt, raw_key.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest


def verify_api_key(raw_key: str, hashed_key: str) -> bool:
    """Validate a raw API key against its stored hash."""

    candidate_hash = hash_api_key(raw_key)
    return hmac.compare_digest(candidate_hash, hashed_key)
