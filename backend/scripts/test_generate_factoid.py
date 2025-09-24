"""Manually exercise factoid generation with PostHog LLM analytics enabled."""

from __future__ import annotations

import argparse
import os
import sys
import uuid


def bootstrap_django() -> None:
    """Initialise Django using the local settings module."""

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")
    import django  # noqa: E402 - runtime import to avoid Django at module import time

    django.setup()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate a single factoid via the service layer. Useful for verifying "
            "that PostHog LLM analytics callbacks are wired correctly."
        )
    )
    parser.add_argument("--topic", default="space exploration", help="Topic prompt for the factoid")
    parser.add_argument(
        "--model", dest="model_key", default=None, help="Optional OpenRouter model key"
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=None,
        help="Optional sampling temperature to forward to the model",
    )
    parser.add_argument(
        "--profile",
        default="anonymous",
        help="Cost guard profile (defaults to anonymous)",
    )
    parser.add_argument(
        "--request-source",
        default="manual",
        choices=["manual", "scheduled", "payment", "chat_agent"],
        help="Value for GenerationRequest.request_source",
    )
    parser.add_argument(
        "--client-hash",
        default=None,
        help="Optional client hash used for rate limiting and analytics distinct_id",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    bootstrap_django()

    from apps.factoids import models  # noqa: E402 - lazily import Django models
    from apps.factoids.services.generator import (  # noqa: E402 - defer heavy import
        CostBudgetExceededError,
        GenerationFailedError,
        RateLimitExceededError,
        generate_factoid,
    )
    from django.conf import settings  # noqa: E402 - imported after Django setup

    client_hash = args.client_hash or uuid.uuid4().hex
    request_source = models.RequestSource(args.request_source)

    try:
        factoid = generate_factoid(
            topic=args.topic,
            model_key=args.model_key,
            temperature=args.temperature,
            client_hash=client_hash,
            profile=args.profile,
            request_source=request_source,
        )
    except RateLimitExceededError as exc:
        print(f"Rate limit exceeded; retry after {exc.retry_after:.1f} seconds", file=sys.stderr)
        return 1
    except CostBudgetExceededError as exc:
        remaining = "unknown" if exc.remaining is None else f"{exc.remaining:.2f}"
        print(f"Cost budget exhausted (remaining: {remaining})", file=sys.stderr)
        return 1
    except GenerationFailedError as exc:
        print(f"Generation failed: {exc.detail}", file=sys.stderr)
        return 1

    posthog_key = getattr(settings, "POSTHOG_PROJECT_API_KEY", None)
    posthog_host = getattr(settings, "POSTHOG_HOST", "https://us.i.posthog.com")

    print("--- Factoid ---")
    print(f"Subject : {factoid.subject}")
    print(f"Emoji   : {factoid.emoji}")
    print(f"Text    : {factoid.text}")
    print("----------------")
    print(f"Generation metadata stored under request ID {factoid.created_by_id}")

    if posthog_key:
        print(
            "PostHog analytics configured (events will use distinct_id="
            f"{client_hash} and host {posthog_host})."
        )
        print("Check your PostHog project for $ai_generation events for confirmation.")
    else:
        print(
            "PostHog analytics are disabled; set POSTHOG_PROJECT_API_KEY to enable instrumentation."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
