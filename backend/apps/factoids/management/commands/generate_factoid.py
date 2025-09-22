"""Management command to generate a factoid via the service layer."""

from __future__ import annotations

import hashlib
from typing import Optional

from apps.factoids import models
from apps.factoids.services.generator import (
    CostBudgetExceededError,
    GenerationFailedError,
    RateLimitExceededError,
    generate_factoid,
)
from django.core.management.base import BaseCommand


def _hash_client(identifier: str) -> str:
    return hashlib.sha256(identifier.encode("utf-8")).hexdigest()


class Command(BaseCommand):
    help = "Generate a factoid using the backend services"

    def add_arguments(self, parser):  # type: ignore[override]
        parser.add_argument(
            "--topic",
            dest="topic",
            help="Topic to seed the generation",
            default=None,
        )
        parser.add_argument("--model", dest="model", help="Model key to request", default=None)
        parser.add_argument("--temperature", dest="temperature", type=float, default=None)
        parser.add_argument(
            "--profile",
            dest="profile",
            default="anonymous",
            help="Rate-limit profile to charge (defaults to anonymous)",
        )
        parser.add_argument(
            "--client",
            dest="client",
            default="scheduled-task",
            help="Client identifier used for rate limiting",
        )

    def handle(self, *args, **options):  # type: ignore[override]
        topic: Optional[str] = options["topic"] or "something surprising"
        model_key: Optional[str] = options["model"]
        temperature: Optional[float] = options["temperature"]
        profile: str = options["profile"]
        client = options["client"]
        client_hash = _hash_client(client)

        try:
            factoid = generate_factoid(
                topic=topic,
                model_key=model_key,
                temperature=temperature,
                client_hash=client_hash,
                profile=profile,
                request_source=models.RequestSource.SCHEDULED,
            )
        except RateLimitExceededError as exc:
            message = f"Rate limit exceeded. Retry after: {exc.retry_after:.2f}s"
            self.stderr.write(self.style.ERROR(message))
            return
        except CostBudgetExceededError as exc:
            remaining = "unknown" if exc.remaining is None else f"${exc.remaining:.2f}"
            message = f"Cost budget exceeded. Remaining: {remaining}"
            self.stderr.write(self.style.ERROR(message))
            return
        except GenerationFailedError as exc:
            self.stderr.write(self.style.ERROR(exc.detail))
            return

        preview = factoid.text[:80].replace("\n", " ")
        self.stdout.write(self.style.SUCCESS(f"Generated factoid {factoid.id}: {preview}"))
