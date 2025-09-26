#!/usr/bin/env python
"""Main eval runner script for Braintrust evaluations."""

import asyncio
import sys
from pathlib import Path

# Add backend to path for imports
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Load environment variables from .env file
from dotenv import load_dotenv  # noqa: E402

load_dotenv(backend_dir / ".env")

import click  # noqa: E402
from braintrust import init, init_dataset  # noqa: E402

from evals.core.datasets import DatasetManager  # noqa: E402
from evals.eval_factoid_structure import run_structure_eval  # noqa: E402
from evals.eval_factoid_truthfulness import run_truthfulness_eval  # noqa: E402


@click.command()
@click.option(
    "--eval-type",
    type=click.Choice(["structure", "truthfulness", "all"]),
    default="all",
    help="Type of evaluation to run",
)
@click.option(
    "--sample-size",
    type=int,
    default=5,
    help="Number of test cases to run",
)
@click.option(
    "--model",
    default="openai/gpt-4o-mini",
    help="Model to use for factoid generation",
)
@click.option(
    "--daily",
    is_flag=True,
    help="Run daily eval on random sample",
)
@click.option(
    "--verbose",
    is_flag=True,
    help="Show detailed output",
)
@click.option(
    "--use-production-data",
    is_flag=True,
    help="Use production factoids dataset instead of test topics",
)
@click.option(
    "--dataset-name",
    default="production-factoids",
    help="Name of Braintrust dataset to use",
)
def run_evals(eval_type, sample_size, model, daily, verbose, use_production_data, dataset_name):
    """Run Braintrust evaluations for factoid generation."""
    # Initialize Braintrust
    init(project="andys-daily-factoids")

    # Load test data
    if use_production_data:
        print(f"Loading production dataset: {dataset_name}")
        try:
            dataset = init_dataset(project="andys-daily-factoids", name=dataset_name)
            # Load data from Braintrust dataset
            data_items = list(dataset)
            if sample_size:
                data_items = data_items[:sample_size]
            test_topics = data_items
            print(f"Loaded {len(test_topics)} items from production dataset")
        except Exception as e:
            print(f"❌ Failed to load production dataset: {e}")
            print("Falling back to test topics...")
            dataset_manager = DatasetManager()
            test_topics = dataset_manager.load_test_topics(sample_size=sample_size)
    else:
        dataset_manager = DatasetManager()
        if daily:
            print(f"Running daily eval with {sample_size} random samples...")
            test_topics = dataset_manager.create_daily_sample(size=sample_size)
        else:
            test_topics = dataset_manager.load_test_topics(sample_size=sample_size)

    print(f"Using {len(test_topics)} test cases")

    # Track results
    results = []
    success = True

    # Run structure eval
    if eval_type in ["structure", "all"]:
        print("\n🔍 Running structure validation eval...")
        try:
            result = asyncio.run(
                run_structure_eval(
                    test_topics=test_topics,
                    model=model,
                    experiment_name="factoid-structure" + ("-daily" if daily else ""),
                )
            )
            results.append(("Structure Validation", result))
            print("✅ Structure eval completed")
            if verbose and result:
                print(f"   Score: {result.summary.score if hasattr(result, 'summary') else 'N/A'}")
        except Exception as e:
            print(f"❌ Structure eval failed: {e}")
            success = False

    # Run truthfulness eval
    if eval_type in ["truthfulness", "all"]:
        print("\n🔍 Running truthfulness eval...")
        try:
            result = asyncio.run(
                run_truthfulness_eval(
                    test_topics=test_topics,
                    model=model,
                    experiment_name="factoid-truthfulness" + ("-daily" if daily else ""),
                )
            )
            results.append(("Truthfulness", result))
            print("✅ Truthfulness eval completed")
            if verbose and result:
                print(f"   Score: {result.summary.score if hasattr(result, 'summary') else 'N/A'}")
        except Exception as e:
            print(f"❌ Truthfulness eval failed: {e}")
            success = False

    # Summary
    print("\n" + "=" * 50)
    print("EVALUATION SUMMARY")
    print("=" * 50)

    if results:
        for name, result in results:
            if result:
                print(f"\n{name}:")
                if hasattr(result, "summary"):
                    summary = result.summary
                    if hasattr(summary, "score"):
                        print(f"  Overall Score: {summary.score:.2%}")
                    if hasattr(summary, "metrics"):
                        for metric, value in summary.metrics.items():
                            print(f"  {metric}: {value}")
                else:
                    print(f"  Result: {result}")

        print("\n📊 View detailed results in Braintrust dashboard:")
        print("   https://www.braintrust.dev/app/andys-daily-factoids")
    else:
        print("No results to display")

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(run_evals())
