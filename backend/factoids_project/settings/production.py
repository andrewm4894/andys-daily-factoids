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

# Enable wildcard subdomains for Render preview environments
# Django supports patterns like '.example.com' to match all subdomains
ALLOWED_HOSTS = [
    host if not host.startswith('.') else host
    for host in ALLOWED_HOSTS
]

# Parse CORS origins
cors_env = os.getenv("DJANGO_CORS_ALLOWED_ORIGINS", "")
if cors_env:
    cors_origins_list = [origin.strip() for origin in cors_env.split(",") if origin.strip()]
else:
    cors_origins_list = []

# Handle wildcard patterns for CORS (for preview environments)
# Convert '.onrender.com' to a regex pattern
CORS_ALLOWED_ORIGIN_REGEXES = []
CORS_ALLOWED_ORIGINS = []

for origin in cors_origins_list:
    if origin.startswith('.'):
        # Convert .onrender.com to regex that matches any subdomain
        domain = origin[1:]  # Remove leading dot
        # Match https://anything.domain or https://anything-else.domain
        escaped_domain = domain.replace('.', r'\.')
        pattern = rf"https://[a-zA-Z0-9\-]+\.{escaped_domain}"
        CORS_ALLOWED_ORIGIN_REGEXES.append(pattern)
    else:
        CORS_ALLOWED_ORIGINS.append(origin)

CORS_ALLOW_ALL_ORIGINS = False

if not SECRET_KEY or SECRET_KEY == "development-secret-key":  # noqa: F405
    raise RuntimeError("DJANGO_SECRET_KEY must be set in production environment")

if not ALLOWED_HOSTS:
    raise RuntimeError("DJANGO_ALLOWED_HOSTS must be configured for production")
