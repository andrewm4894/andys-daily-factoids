"""Production settings."""

from __future__ import annotations

import os

from .base import *  # noqa: F401,F403
from .config import get_settings

settings = get_settings()

DEBUG = False

# Security hardening defaults; values should be overridden via environment variables.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_SECURE_HSTS_SECONDS", 3600))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"

ALLOWED_HOSTS = settings.allowed_hosts

CORS_ALLOWED_ORIGINS = settings.cors_allowed_origins
CORS_ALLOW_ALL_ORIGINS = False

if not SECRET_KEY or SECRET_KEY == "development-secret-key":
    raise RuntimeError("DJANGO_SECRET_KEY must be set in production environment")

if not ALLOWED_HOSTS:
    raise RuntimeError("DJANGO_ALLOWED_HOSTS must be configured for production")
