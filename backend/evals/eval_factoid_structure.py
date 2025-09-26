"""Structure validation eval for factoid generation."""

import asyncio
from typing import Any, Dict, List

from braintrust import Eval, init

from evals.core.base import FactoidEvalTask, parse_factoid_with_app_logic


def structure_scorer(
    input: Dict[str, Any], output: Dict[str, Any], expected=None
) -> Dict[str, Any]:
    """Score based on successful parsing into FactoidPayload."""
    # Check if generation was successful
    if not output.get("success", False):
        return {
            "name": "structure",
            "score": 0.0,
            "metadata": {
                "parsed": False,
                "error": output.get("error", "Generation failed"),
                "has_text": False,
                "has_subject": False,
                "has_emoji": False,
            },
        }

    try:
        # Use actual app logic to parse
        payload = parse_factoid_with_app_logic(output)

        if payload:
            # Validate all required fields are present and non-empty
            has_text = bool(payload.text and payload.text.strip())
            has_subject = bool(payload.subject and payload.subject.strip())
            has_emoji = bool(payload.emoji and payload.emoji.strip())
            all_fields_valid = has_text and has_subject and has_emoji

            # Check field constraints
            subject_valid_length = len(payload.subject) <= 255
            emoji_valid_length = len(payload.emoji) <= 16

            score = (
                1.0 if (all_fields_valid and subject_valid_length and emoji_valid_length) else 0.5
            )

            return {
                "name": "structure",
                "score": score,
                "metadata": {
                    "parsed": True,
                    "has_text": has_text,
                    "has_subject": has_subject,
                    "has_emoji": has_emoji,
                    "subject_length": len(payload.subject),
                    "emoji_length": len(payload.emoji),
                    "text_length": len(payload.text),
                    "subject_valid_length": subject_valid_length,
                    "emoji_valid_length": emoji_valid_length,
                },
            }
        else:
            return {
                "name": "structure",
                "score": 0.0,
                "metadata": {
                    "parsed": False,
                    "error": "Could not parse factoid from response",
                    "has_text": False,
                    "has_subject": False,
                    "has_emoji": False,
                },
            }
    except Exception as e:
        return {
            "name": "structure",
            "score": 0.0,
            "metadata": {
                "parsed": False,
                "error": str(e),
                "has_text": False,
                "has_subject": False,
                "has_emoji": False,
            },
        }


def field_completeness_scorer(
    input: Dict[str, Any], output: Dict[str, Any], expected=None
) -> Dict[str, Any]:
    """Score the completeness and quality of individual fields."""
    if not output.get("success", False):
        return {
            "name": "field_completeness",
            "score": 0.0,
            "metadata": {"reason": "Generation failed"},
        }

    scores = []
    metadata = {}

    # Score text field
    text = output.get("factoid_text", "")
    if text:
        text_score = min(1.0, len(text) / 100)  # Prefer longer, more detailed factoids
        scores.append(text_score)
        metadata["text_score"] = text_score
        metadata["text_length"] = len(text)

    # Score subject field
    subject = output.get("subject", "")
    if subject:
        # Subject should be descriptive but concise
        subject_score = 1.0 if 5 <= len(subject) <= 100 else 0.5
        scores.append(subject_score)
        metadata["subject_score"] = subject_score
        metadata["subject_length"] = len(subject)

    # Score emoji field
    emoji = output.get("emoji", "")
    if emoji:
        # Should be a single emoji (1-2 characters typically)
        emoji_score = 1.0 if 1 <= len(emoji) <= 4 else 0.0
        scores.append(emoji_score)
        metadata["emoji_score"] = emoji_score
        metadata["emoji_length"] = len(emoji)

    final_score = sum(scores) / len(scores) if scores else 0.0

    return {
        "name": "field_completeness",
        "score": final_score,
        "metadata": metadata,
    }


async def run_structure_eval(
    test_topics: List[Dict[str, Any]] = None,
    model: str = "openai/gpt-4o-mini",
    experiment_name: str = "factoid-structure-validation",
) -> Any:
    """Run the structure validation eval."""
    # Initialize Braintrust with project
    init(project="andys-daily-factoids")

    # Default test topics if none provided
    if test_topics is None:
        test_topics = [
            {"topic": "Ancient Rome", "category": "history"},
            {"topic": "Quantum Computing", "category": "technology"},
            {"topic": "Deep Sea Creatures", "category": "nature"},
            {"topic": "The Moon", "category": "space"},
            {"topic": "Coffee", "category": "food"},
        ]

    # Create the eval task
    task = FactoidEvalTask(model=model)

    # Run the evaluation
    result = await Eval(
        name=experiment_name,
        project="andys-daily-factoids",
        data=test_topics,
        task=task,
        scores=[structure_scorer, field_completeness_scorer],
        metadata={
            "model": model,
            "eval_type": "structure",
            "num_topics": len(test_topics),
        },
    )

    return result


if __name__ == "__main__":
    # Run a quick test
    result = asyncio.run(run_structure_eval())
    print(f"Eval completed: {result}")
