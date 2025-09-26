"""Truthfulness eval for factoid generation using custom scorers."""

import asyncio
from typing import Any, Dict, List

from braintrust import Eval, init

from evals.core.base import FactoidEvalTask
from evals.scorers import factoid_truthfulness


async def truthfulness_scorer(
    input: Dict[str, Any], output: Dict[str, Any], expected=None
) -> Dict[str, Any]:
    """Evaluate factoid truthfulness using autoevals Factuality scorer."""
    if not output.get("success", False):
        return {
            "name": "truthfulness",
            "score": 0.0,
            "metadata": {
                "reason": "Generation failed",
                "error": output.get("error"),
            },
        }

    factoid_text = output.get("factoid_text", "")
    topic = input.get("topic", "")

    if not factoid_text:
        return {
            "name": "truthfulness",
            "score": 0.0,
            "metadata": {"reason": "No factoid text to evaluate"},
        }

    try:
        # Use autoevals Factuality scorer
        # Use custom truthfulness scorer
        result = factoid_truthfulness(factoid_text, context={"input": {"topic": topic}})

        return {
            "name": "truthfulness",
            "score": result.score,
            "metadata": {
                "reasoning": result.metadata.get("reasoning", ""),
                "verdict": result.metadata.get("verdict", ""),
                "topic": topic,
                "factoid_length": len(factoid_text),
            },
        }
    except Exception as e:
        return {
            "name": "truthfulness",
            "score": 0.0,
            "metadata": {
                "error": str(e),
                "topic": topic,
            },
        }


async def relevance_scorer(
    input: Dict[str, Any], output: Dict[str, Any], expected=None
) -> Dict[str, Any]:
    """Score how relevant the factoid is to the requested topic."""
    if not output.get("success", False):
        return {
            "name": "relevance",
            "score": 0.0,
            "metadata": {"reason": "Generation failed"},
        }

    factoid_text = output.get("factoid_text", "")
    subject = output.get("subject", "")
    topic = input.get("topic", "")

    if not factoid_text:
        return {
            "name": "relevance",
            "score": 0.0,
            "metadata": {"reason": "No factoid text"},
        }

    # Simple heuristic: check if topic keywords appear in factoid or subject
    topic_words = set(topic.lower().split())
    factoid_words = set(factoid_text.lower().split())
    subject_words = set(subject.lower().split())

    # Calculate overlap
    factoid_overlap = len(topic_words & factoid_words)
    subject_overlap = len(topic_words & subject_words)

    # Score based on keyword presence
    if factoid_overlap > 0 or subject_overlap > 0:
        score = min(1.0, (factoid_overlap + subject_overlap * 2) / len(topic_words))
    else:
        score = 0.3  # Might still be relevant even without exact keyword match

    return {
        "name": "relevance",
        "score": score,
        "metadata": {
            "topic": topic,
            "topic_words": list(topic_words),
            "factoid_overlap": factoid_overlap,
            "subject_overlap": subject_overlap,
        },
    }


async def run_truthfulness_eval(
    test_topics: List[Dict[str, Any]] = None,
    model: str = "openai/gpt-4o-mini",
    experiment_name: str = "factoid-truthfulness",
) -> Any:
    """Run the truthfulness evaluation."""
    # Initialize Braintrust with project
    init(project="andys-daily-factoids")

    # Default test topics if none provided
    if test_topics is None:
        test_topics = [
            {"input": {"topic": "The Great Wall of China", "category": "history"}},
            {"input": {"topic": "Black Holes", "category": "science"}},
            {"input": {"topic": "Amazon Rainforest", "category": "nature"}},
            {"input": {"topic": "Bitcoin", "category": "technology"}},
            {"input": {"topic": "Shakespeare", "category": "literature"}},
        ]

    # Create the eval task
    task = FactoidEvalTask(model=model)

    # Run the evaluation with custom scorer
    result = await Eval(
        name=experiment_name,
        data=test_topics,
        task=task,
        scores=[factoid_truthfulness, relevance_scorer],
        metadata={
            "model": model,
            "eval_type": "truthfulness",
            "num_topics": len(test_topics),
            "judge_model": "openai/gpt-4-turbo-preview",
        },
    )

    return result


if __name__ == "__main__":
    # Run a quick test
    result = asyncio.run(run_truthfulness_eval())
    print(f"Eval completed: {result}")
