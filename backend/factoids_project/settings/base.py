"""Base Django settings for Andy's Daily Factoids."""

from __future__ import annotations

import os

import dj_database_url

from .config import BASE_DIR, get_settings

settings = get_settings()

SECRET_KEY = settings.secret_key
DEBUG = settings.debug
ALLOWED_HOSTS: list[str] = settings.allowed_hosts

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "corsheaders",
    # Project apps
    "apps.core",
    "apps.factoids",
    "apps.payments",
    "apps.analytics",
    "apps.chat",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "factoids_project.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "factoids_project.wsgi.application"
ASGI_APPLICATION = "factoids_project.asgi.application"

if settings.database_url:
    DATABASES = {
        "default": dj_database_url.parse(
            settings.database_url,
            conn_max_age=settings.db_conn_max_age,
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_L10N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
}

CORS_ALLOWED_ORIGINS: list[str] = settings.cors_allowed_origins
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-session-id",  # Custom header for chat sessions
]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{levelname}] {asctime} {name} {funcName}:{lineno} - {message}",
            "style": "{",
        },
        "simple": {
            "format": "[{levelname}] {name} - {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
        "debug_console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "loggers": {
        # Django startup debugging
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "django.utils.autoreload": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        # App-specific debugging
        "apps.core": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "apps.factoids": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "apps.chat": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}

# Debug mode logging - enabled via DJANGO_DEBUG_STARTUP env var
if os.getenv("DJANGO_DEBUG_STARTUP") == "true":
    LOGGING["handlers"]["console"]["formatter"] = "verbose"
    LOGGING["loggers"]["django"]["level"] = "DEBUG"
    LOGGING["loggers"]["django.utils.autoreload"]["level"] = "DEBUG"
    LOGGING["loggers"]["apps.core"]["level"] = "DEBUG"
    LOGGING["loggers"]["apps.factoids"]["level"] = "DEBUG"
    LOGGING["loggers"]["apps.chat"]["level"] = "DEBUG"
    LOGGING["root"]["level"] = "DEBUG"

RATE_LIMITS = {
    "factoids": {
        "anonymous": {"per_minute": 1, "per_hour": 3, "per_day": 20},
        "api_key": {"per_minute": 5, "per_hour": 50, "per_day": 200},
    }
}

OPENROUTER_API_KEY = settings.openrouter_api_key
OPENROUTER_BASE_URL = settings.openrouter_base_url

# Factoid generation settings
FACTOID_GENERATION_EXAMPLES_COUNT = settings.factoid_generation_examples_count
FACTOID_CHAT_RATE_LIMIT_PER_MINUTE = settings.factoid_chat_rate_limit_per_minute
FACTOID_AGENT_DEFAULT_MODEL = settings.factoid_agent_default_model
TAVILY_API_KEY = settings.tavily_api_key
POSTHOG_PROJECT_API_KEY = settings.posthog_project_api_key
POSTHOG_HOST = settings.posthog_host
POSTHOG_DEBUG = settings.posthog_debug
POSTHOG_DISABLED = settings.posthog_disabled

BRAINTRUST_API_KEY = settings.braintrust_api_key

# LangSmith configuration
LANGSMITH_API_KEY = settings.langsmith_api_key
LANGSMITH_PROJECT = settings.langsmith_project
LANGSMITH_TRACING = settings.langsmith_tracing

# Datadog configuration
DATADOG_API_KEY = settings.datadog_api_key
DATADOG_SITE = settings.datadog_site
DATADOG_LLMOBS_ENABLED = settings.datadog_llmobs_enabled
DATADOG_LLMOBS_ML_APP = settings.datadog_llmobs_ml_app

# Langfuse configuration
LANGFUSE_PUBLIC_KEY = settings.langfuse_public_key
LANGFUSE_SECRET_KEY = settings.langfuse_secret_key
LANGFUSE_HOST = settings.langfuse_host

STRIPE_SECRET_KEY = settings.stripe_secret_key
STRIPE_PUBLISHABLE_KEY = settings.stripe_publishable_key
STRIPE_PRICE_ID = settings.stripe_price_id
STRIPE_CHECKOUT_AMOUNT_CENTS = settings.stripe_checkout_amount_cents
STRIPE_CHECKOUT_CURRENCY = settings.stripe_checkout_currency
STRIPE_CHECKOUT_PRODUCT_NAME = settings.stripe_checkout_product_name
STRIPE_SUCCESS_URL = settings.stripe_success_url
STRIPE_CANCEL_URL = settings.stripe_cancel_url
STRIPE_FACTOID_CHAT_PRICE_ID = settings.stripe_factoid_chat_price_id
STRIPE_FACTOID_CHAT_AMOUNT_CENTS = settings.stripe_factoid_chat_amount_cents
STRIPE_FACTOID_CHAT_CURRENCY = settings.stripe_factoid_chat_currency
STRIPE_FACTOID_CHAT_PRODUCT_NAME = settings.stripe_factoid_chat_product_name
