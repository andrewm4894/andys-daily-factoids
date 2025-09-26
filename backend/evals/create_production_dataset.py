#!/usr/bin/env python
"""Create a Braintrust dataset from production factoids."""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Load environment variables from .env file
from dotenv import load_dotenv  # noqa: E402

load_dotenv(backend_dir / ".env")

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")
import django  # noqa: E402

django.setup()

import click  # noqa: E402
from apps.factoids.models import Factoid  # noqa: E402
from apps.factoids.prompts import build_factoid_generation_prompt  # noqa: E402
from apps.factoids.services.openrouter import model_supports_tools  # noqa: E402
from braintrust import init_dataset  # noqa: E402
from django.conf import settings  # noqa: E402


@click.command()
@click.option(
    "--sample-size",
    type=int,
    default=50,
    help="Number of factoids to include in dataset",
)
@click.option(
    "--dataset-name",
    default="production-factoids",
    help="Name of the dataset in Braintrust",
)
@click.option(
    "--save-local",
    is_flag=True,
    help="Also save dataset to local JSON file",
)
def create_dataset(sample_size, dataset_name, save_local):
    """Create a Braintrust dataset from production factoids."""
    print(f"Loading {sample_size} most recent factoids from database...")

    # Get recent factoids
    factoids = Factoid.objects.order_by("-created_at")[:sample_size]
    print(f"Found {factoids.count()} factoids")

    # For each factoid, build the actual prompt that would have been used
    dataset_items = []
    for i, factoid in enumerate(factoids):
        # Get the factoids that existed before this one for context
        # (simulate what recent_factoids would have been at generation time)
        context_factoids = list(
            Factoid.objects.filter(created_at__lt=factoid.created_at).order_by("-created_at")[
                : settings.FACTOID_GENERATION_EXAMPLES_COUNT
            ]
        )

        # Determine if the model used tools (based on generation metadata)
        model_name = (
            factoid.generation_metadata.get("model", "openai/gpt-4o-mini")
            if factoid.generation_metadata
            else "openai/gpt-4o-mini"
        )

        # Check if model supports tools
        try:
            supports_tools = model_supports_tools(
                model_name,
                api_key=settings.OPENROUTER_API_KEY,
                base_url=settings.OPENROUTER_BASE_URL,
            )
        except Exception:
            supports_tools = False

        # Build the actual prompt using the app's logic
        actual_prompt = build_factoid_generation_prompt(
            topic=factoid.subject,
            recent_factoids=context_factoids,
            num_examples=settings.FACTOID_GENERATION_EXAMPLES_COUNT,
            use_factoid_tool=supports_tools,
        )

        item = {
            "input": {
                "prompt": actual_prompt,
                "topic": factoid.subject,
                "model": model_name,
                "use_factoid_tool": supports_tools,
                "context_factoids_count": len(context_factoids),
            },
            "expected": {
                "text": factoid.text,
                "subject": factoid.subject,
                "emoji": factoid.emoji,
            },
            "metadata": {
                "factoid_id": str(factoid.id),
                "created_at": factoid.created_at.isoformat(),
                "votes_up": factoid.votes_up,
                "votes_down": factoid.votes_down,
                "original_model": model_name,
                "dataset_index": i,
            },
        }
        dataset_items.append(item)

        if i % 10 == 0:
            print(f"Processed {i + 1}/{len(factoids)} factoids...")

    print(f"Prepared {len(dataset_items)} items for dataset")

    # Initialize Braintrust dataset
    print(f"Creating Braintrust dataset: {dataset_name}")
    dataset = init_dataset(
        project="andys-daily-factoids",
        name=dataset_name,
        description=f"Production factoids sampled on {datetime.now().isoformat()}",
    )

    # Insert data
    for item in dataset_items:
        dataset.insert(**item)

    print(f"✅ Dataset created successfully with {len(dataset_items)} items")
    print("   View at: https://www.braintrust.dev/app/andys-daily-factoids/datasets")

    # Optionally save locally
    if save_local:
        local_file = Path("evals/data/production_factoids.json")
        local_file.parent.mkdir(parents=True, exist_ok=True)

        with open(local_file, "w") as f:
            json.dump(
                {
                    "dataset_name": dataset_name,
                    "created_at": datetime.now().isoformat(),
                    "sample_size": sample_size,
                    "items": dataset_items,
                },
                f,
                indent=2,
            )
        print(f"💾 Also saved to: {local_file}")

    return dataset_items


if __name__ == "__main__":
    create_dataset()
