#!/usr/bin/env python
"""Unified factoid quality evaluation script with flexible parameters."""

import os
import sys
from datetime import datetime
from pathlib import Path

# Add backend to path and load env
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv  # noqa: E402

load_env_file = backend_dir / ".env"
if load_env_file.exists():
    load_dotenv(load_env_file)

import json  # noqa: E402
from typing import Any, Dict  # noqa: E402

import click  # noqa: E402
import django  # noqa: E402

# Global variables to hold imports after Django setup
_django_setup_complete = False
Factoid = None
Eval = None
init = None
get_traces_for_structure_eval = None
factoid_truthfulness = None
json_is_valid = None


def setup_django(production: bool = False) -> None:
    """Setup Django with appropriate settings module."""
    global \
        _django_setup_complete, \
        Factoid, \
        Eval, \
        init, \
        get_traces_for_structure_eval, \
        factoid_truthfulness, \
        json_is_valid

    if _django_setup_complete:
        return

    if production:
        os.environ["DJANGO_SETTINGS_MODULE"] = "factoids_project.settings.production"
    else:
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")

    django.setup()

    # Import Django-dependent modules after setup
    from apps.factoids.models import Factoid as _Factoid  # noqa: E402
    from braintrust import Eval as _Eval  # noqa: E402
    from braintrust import init as _init

    from evals.braintrust_traces import get_traces_for_structure_eval as _get_traces  # noqa: E402
    from evals.scorers import factoid_truthfulness as _factoid_truthfulness  # noqa: E402
    from evals.scorers import json_is_valid as _json_is_valid

    # Assign to global variables
    Factoid = _Factoid
    Eval = _Eval
    init = _init
    get_traces_for_structure_eval = _get_traces
    factoid_truthfulness = _factoid_truthfulness
    json_is_valid = _json_is_valid
    _django_setup_complete = True


class FactoidEvalTask:
    """Unified task for factoid evaluation."""

    def __call__(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Return the existing factoid data formatted for scoring."""
        factoid_data = input_data.get("factoid", {})

        # Format as JSON string (as if from LLM output)
        json_output = json.dumps(
            {
                "text": factoid_data.get("text", ""),
                "subject": factoid_data.get("subject", ""),
                "emoji": factoid_data.get("emoji", ""),
            }
        )

        return {
            "output": json_output,
            "factoid_id": input_data.get("factoid_id"),
            "created_at": input_data.get("created_at"),
            "original_votes_up": factoid_data.get("votes_up", 0),
            "original_votes_down": factoid_data.get("votes_down", 0),
            "success": True,
        }


class BraintrustTraceTask:
    """Task for evaluating raw Braintrust traces (includes parsing failures)."""

    def __call__(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Return raw LLM output from Braintrust traces for structure testing."""
        raw_output = input_data.get("raw_output", "")

        return {
            "output": raw_output,  # Raw LLM response (may not be valid JSON)
            "trace_id": input_data.get("trace_id"),
            "created_at": input_data.get("created_at"),
            "source": "braintrust_trace",
            "success": True,
        }


def structure_scorer(
    input: Dict[str, Any], output: Dict[str, Any], expected=None
) -> Dict[str, Any]:
    """Structure scorer for evaluation."""
    json_output = output.get("output", "")
    result = json_is_valid(json_output)

    metadata = result.metadata.copy()
    metadata.update(
        {
            "factoid_id": output.get("factoid_id"),
            "original_votes_up": output.get("original_votes_up", 0),
            "original_votes_down": output.get("original_votes_down", 0),
        }
    )

    return {
        "name": "structure_quality",
        "score": result.score,
        "metadata": metadata,
    }


def truthfulness_scorer(
    input: Dict[str, Any], output: Dict[str, Any], expected=None
) -> Dict[str, Any]:
    """Truthfulness scorer for evaluation."""
    json_output = output.get("output", "")
    topic = input.get("topic", "")

    context = {"input": {"topic": topic}}
    result = factoid_truthfulness(json_output, context=context)

    metadata = result.metadata.copy()
    metadata.update(
        {
            "factoid_id": output.get("factoid_id"),
            "original_votes_up": output.get("original_votes_up", 0),
            "original_votes_down": output.get("original_votes_down", 0),
        }
    )

    return {
        "name": "truthfulness_quality",
        "score": result.score,
        "metadata": metadata,
    }


def user_feedback_scorer(
    input: Dict[str, Any], output: Dict[str, Any], expected=None
) -> Dict[str, Any]:
    """User feedback scorer for evaluation."""
    votes_up = output.get("original_votes_up", 0)
    votes_down = output.get("original_votes_down", 0)
    total_votes = votes_up + votes_down

    if total_votes == 0:
        score = 0.5  # Neutral
        sentiment = "no_feedback"
    else:
        score = votes_up / total_votes
        if score >= 0.7:
            sentiment = "positive"
        elif score <= 0.3:
            sentiment = "negative"
        else:
            sentiment = "mixed"

    return {
        "name": "user_feedback",
        "score": score,
        "metadata": {
            "votes_up": votes_up,
            "votes_down": votes_down,
            "total_votes": total_votes,
            "sentiment": sentiment,
            "factoid_id": output.get("factoid_id"),
        },
    }


@click.command()
@click.option(
    "--sample-size",
    type=int,
    default=20,
    help="Number of recent factoids to evaluate",
)
@click.option(
    "--experiment-name",
    default=None,
    help="Name for the Braintrust experiment (auto-generated if not provided)",
)
@click.option(
    "--skip-truthfulness",
    is_flag=True,
    help="Skip truthfulness evaluation to avoid API calls",
)
@click.option(
    "--daily",
    is_flag=True,
    help="Run in daily mode (auto-generated experiment name with date)",
)
@click.option(
    "--production",
    is_flag=True,
    help="Use production Django settings",
)
@click.option(
    "--hybrid",
    is_flag=True,
    help="Use hybrid approach: Braintrust traces for structure, DB for user feedback",
)
def run_evaluation(sample_size, experiment_name, skip_truthfulness, daily, production, hybrid):
    """Run factoid quality evaluation with flexible parameters."""

    # Setup Django with appropriate settings
    setup_django(production=production)

    # Generate experiment name if not provided
    if not experiment_name:
        if daily:
            today = datetime.now().strftime("%Y-%m-%d")
            experiment_name = f"daily-eval-{today}"
        else:
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            experiment_name = f"manual-eval-{timestamp}"

    print("🔍 Running factoid evaluation")
    print(f"📊 Sample size: {sample_size} most recent factoids")
    print(f"🏷️  Experiment: {experiment_name}")

    if hybrid:
        print("🔄 Using hybrid approach: Braintrust traces for structure, DB for user feedback")

    # Initialize Braintrust
    init(project="andys-daily-factoids")

    if hybrid:
        # Hybrid approach: Run separate evaluations
        return run_hybrid_evaluation(sample_size, experiment_name, skip_truthfulness)
    else:
        # Original approach: Use DB data only
        return run_db_only_evaluation(sample_size, experiment_name, skip_truthfulness)


def run_db_only_evaluation(sample_size, experiment_name, skip_truthfulness):
    """Original evaluation approach using only database data."""
    # Get recent factoids
    factoids = Factoid.objects.order_by("-created_at")[:sample_size]
    print(f"✅ Found {factoids.count()} factoids")

    if factoids.count() == 0:
        print("⚠️ No factoids found to evaluate")
        return

    # Format data for evaluation
    eval_data = []
    for factoid in factoids:
        eval_data.append(
            {
                "input": {
                    "topic": factoid.subject,
                    "factoid_id": str(factoid.id),
                    "created_at": factoid.created_at.isoformat(),
                    "factoid": {
                        "text": factoid.text,
                        "subject": factoid.subject,
                        "emoji": factoid.emoji,
                        "votes_up": factoid.votes_up,
                        "votes_down": factoid.votes_down,
                    },
                }
            }
        )

    # Configure scorers
    scorers = [
        structure_scorer,
        user_feedback_scorer,
    ]

    if not skip_truthfulness:
        scorers.append(truthfulness_scorer)
        print("🧠 Including truthfulness evaluation (will make API calls to OpenRouter)")
    else:
        print("⚡ Skipping truthfulness evaluation for faster execution")

    # Create task
    task = FactoidEvalTask()

    print(f"🚀 Running evaluation with {len(scorers)} scorers...")

    # Run evaluation
    result = Eval(
        name="andys-daily-factoids",
        experiment_name=experiment_name,
        data=eval_data,
        task=task,
        scores=scorers,
        metadata={
            "eval_type": "db_only",
            "sample_size": len(eval_data),
            "include_truthfulness": not skip_truthfulness,
            "date": datetime.now().isoformat(),
            "description": f"DB-only evaluation of {len(eval_data)} recent factoids",
        },
    )

    print("✅ Evaluation completed!")
    print("📊 View results: https://www.braintrust.dev/app/andys-daily-factoids")
    return result


def run_hybrid_evaluation(sample_size, experiment_name, skip_truthfulness):
    """Hybrid evaluation: Braintrust traces for structure, DB for user feedback."""

    # Get Braintrust traces for structure evaluation
    print("🔍 Fetching Braintrust traces for structure evaluation...")
    trace_data = get_traces_for_structure_eval(limit=sample_size)

    if not trace_data:
        print("⚠️ No Braintrust traces found - falling back to DB-only evaluation")
        return run_db_only_evaluation(sample_size, experiment_name, skip_truthfulness)

    print(f"✅ Found {len(trace_data)} traces for structure evaluation")

    # Get DB factoids for user feedback evaluation
    print("🔍 Fetching DB factoids for user feedback evaluation...")
    factoids = Factoid.objects.order_by("-created_at")[:sample_size]
    print(f"✅ Found {factoids.count()} factoids for user feedback evaluation")

    # Format DB data for user feedback evaluation
    db_eval_data = []
    for factoid in factoids:
        db_eval_data.append(
            {
                "input": {
                    "topic": factoid.subject,
                    "factoid_id": str(factoid.id),
                    "created_at": factoid.created_at.isoformat(),
                    "factoid": {
                        "text": factoid.text,
                        "subject": factoid.subject,
                        "emoji": factoid.emoji,
                        "votes_up": factoid.votes_up,
                        "votes_down": factoid.votes_down,
                    },
                }
            }
        )

    # Run structure evaluation on traces
    print("🏗️ Running structure evaluation on Braintrust traces...")
    structure_result = Eval(
        name="andys-daily-factoids",
        experiment_name=f"{experiment_name}-structure",
        data=trace_data,
        task=BraintrustTraceTask(),
        scores=[structure_scorer],
        metadata={
            "eval_type": "hybrid_structure",
            "sample_size": len(trace_data),
            "data_source": "braintrust_traces",
            "date": datetime.now().isoformat(),
            "description": f"Structure evaluation of {len(trace_data)} Braintrust traces",
        },
    )

    # Run user feedback (and optionally truthfulness) evaluation on DB data
    user_scorers = [user_feedback_scorer]
    if not skip_truthfulness:
        user_scorers.append(truthfulness_scorer)
        print("🧠 Including truthfulness evaluation (will make API calls to OpenRouter)")
    else:
        print("⚡ Skipping truthfulness evaluation for faster execution")

    print("👥 Running user feedback evaluation on DB factoids...")
    feedback_result = Eval(
        name="andys-daily-factoids",
        experiment_name=f"{experiment_name}-feedback",
        data=db_eval_data,
        task=FactoidEvalTask(),
        scores=user_scorers,
        metadata={
            "eval_type": "hybrid_feedback",
            "sample_size": len(db_eval_data),
            "include_truthfulness": not skip_truthfulness,
            "data_source": "database",
            "date": datetime.now().isoformat(),
            "description": f"User feedback evaluation of {len(db_eval_data)} DB factoids",
        },
    )

    print("✅ Hybrid evaluation completed!")
    print("📊 View structure results: https://www.braintrust.dev/app/andys-daily-factoids")
    print("📊 View feedback results: https://www.braintrust.dev/app/andys-daily-factoids")

    return {"structure": structure_result, "feedback": feedback_result}


if __name__ == "__main__":
    run_evaluation()
