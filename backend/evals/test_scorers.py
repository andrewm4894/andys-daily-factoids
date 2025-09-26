#!/usr/bin/env python
"""Test custom scorers."""

import os
import sys
from pathlib import Path

# Add backend to path and load env
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(backend_dir / ".env")

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")
import django  # noqa: E402

django.setup()

from evals.scorers import factoid_truthfulness, json_is_valid  # noqa: E402


def test_json_scorer():
    """Test the JSON validation scorer."""
    print("Testing JSON validation scorer...")

    # Test valid JSON
    valid_json = '{"text": "Test factoid", "subject": "Testing", "emoji": "🧪"}'
    result = json_is_valid(valid_json)
    print(f"Valid JSON score: {result.score}")
    print(f"Metadata: {result.metadata}")

    # Test invalid JSON
    invalid_json = "This is not JSON at all"
    result = json_is_valid(invalid_json)
    print(f"Invalid JSON score: {result.score}")
    print(f"Metadata: {result.metadata}")

    # Test JSON with missing fields
    incomplete_json = '{"text": "Test factoid"}'
    result = json_is_valid(incomplete_json)
    print(f"Incomplete JSON score: {result.score}")
    print(f"Metadata: {result.metadata}")


def test_truthfulness_scorer():
    """Test the truthfulness scorer."""
    print("\nTesting truthfulness scorer...")

    # Test with a clearly true factoid
    true_factoid = (
        '{"text": "Water boils at 100 degrees Celsius at sea level", '
        '"subject": "Physics", "emoji": "💧"}'
    )
    context = {"input": {"topic": "Physics"}}
    result = factoid_truthfulness(true_factoid, context=context)
    print(f"True factoid score: {result.score}")
    print(f"Verdict: {result.metadata.get('verdict', 'N/A')}")
    print(f"Reasoning: {result.metadata.get('reasoning', 'N/A')}")

    # Test with a clearly false factoid
    false_factoid = (
        '{"text": "The Earth is flat and the center of the universe", '
        '"subject": "Astronomy", "emoji": "🌍"}'
    )
    context = {"input": {"topic": "Astronomy"}}
    result = factoid_truthfulness(false_factoid, context=context)
    print(f"False factoid score: {result.score}")
    print(f"Verdict: {result.metadata.get('verdict', 'N/A')}")
    print(f"Reasoning: {result.metadata.get('reasoning', 'N/A')}")


if __name__ == "__main__":
    test_json_scorer()
    test_truthfulness_scorer()
