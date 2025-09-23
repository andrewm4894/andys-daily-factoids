"""Production settings."""

from __future__ import annotations

import os

from .base import *  # noqa: F401,F403

# Bypass Pydantic settings for production to avoid parsing issues

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

# Direct environment variable parsing for production
hosts_env = os.getenv("DJANGO_ALLOWED_HOSTS", "")
ALLOWED_HOSTS = [host.strip() for host in hosts_env.split(",") if host.strip()] if hosts_env else []

cors_env = os.getenv("DJANGO_CORS_ALLOWED_ORIGINS", "")
CORS_ALLOWED_ORIGINS = []
if cors_env:
    CORS_ALLOWED_ORIGINS = [origin.strip() for origin in cors_env.split(",") if origin.strip()]
CORS_ALLOW_ALL_ORIGINS = False

if not SECRET_KEY or SECRET_KEY == "development-secret-key":  # noqa: F405
    raise RuntimeError("DJANGO_SECRET_KEY must be set in production environment")

if not ALLOWED_HOSTS:
    raise RuntimeError("DJANGO_ALLOWED_HOSTS must be configured for production")
