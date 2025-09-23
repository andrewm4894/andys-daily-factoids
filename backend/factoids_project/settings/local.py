"""Local development settings."""

from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS += ["127.0.0.1", "localhost"]  # noqa: F405

# Allow all origins locally for convenience; tighten in production.
CORS_ALLOW_ALL_ORIGINS = True

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Use sqlite by default for local development unless DATABASE_URL provided.
