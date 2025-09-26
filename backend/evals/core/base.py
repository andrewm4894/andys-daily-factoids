"""Base utilities for Braintrust evaluations."""

import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

# Add backend directory to Python path for Django imports
backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(backend_dir))

# Load environment variables from .env file
from dotenv import load_dotenv  # noqa: E402

load_dotenv(backend_dir / ".env")

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")
import django  # noqa: E402

django.setup()

# Now we can import Django models and services
from apps.factoids.models import Factoid  # noqa: E402, F401
from apps.factoids.services.generator import generate_factoid  # noqa: E402
from apps.factoids.services.openrouter import FactoidPayload  # noqa: E402


class FactoidEvalTask:
    """Wrapper to use actual Django service in evals."""

    def __init__(self, model: str = "openai/gpt-4o-mini"):
        """Initialize the eval task with a specific model."""
        self.model = model

    async def __call__(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate factoid using actual app logic."""
        # Check if we have a pre-built prompt (from production dataset)
        if "prompt" in input_data:
            # Use the actual prompt from the dataset
            from apps.factoids.services.openrouter import generate_factoid_completion
            from django.conf import settings

            try:
                # Use the exact prompt and settings from the dataset
                prompt = input_data["prompt"]
                model = input_data.get("model", self.model)
                use_tools = input_data.get("use_factoid_tool", False)

                result = generate_factoid_completion(
                    prompt=prompt,
                    model=model,
                    api_key=settings.OPENROUTER_API_KEY,
                    base_url=settings.OPENROUTER_BASE_URL,
                    temperature=0.7,
                    use_factoid_tool=use_tools,
                )

                return {
                    "factoid_text": result.factoid.text,
                    "subject": result.factoid.subject,
                    "emoji": result.factoid.emoji,
                    "raw_response": result.raw_response,
                    "model_used": model,
                    "generation_metadata": result.factoid.generation_metadata,
                    "success": True,
                    "used_actual_prompt": True,
                }
            except Exception as e:
                return {
                    "error": str(e),
                    "factoid_text": None,
                    "subject": None,
                    "emoji": None,
                    "success": False,
                    "used_actual_prompt": True,
                }
        else:
            # Fall back to high-level generation service for test topics
            topic = input_data.get("topic", "random interesting fact")

            try:
                # Use real generation service
                result = generate_factoid(
                    topic=topic,
                    model_key=self.model,
                    temperature=0.7,
                    client_hash="eval_test_client",
                    profile="eval_test",
                )

                return {
                    "factoid_text": result.factoid.text,
                    "subject": result.factoid.subject,
                    "emoji": result.factoid.emoji,
                    "raw_response": result.raw_response,
                    "model_used": self.model,
                    "generation_metadata": result.factoid.generation_metadata,
                    "success": True,
                    "used_actual_prompt": False,
                }
            except Exception as e:
                return {
                    "error": str(e),
                    "factoid_text": None,
                    "subject": None,
                    "emoji": None,
                    "success": False,
                    "used_actual_prompt": False,
                }


def parse_factoid_with_app_logic(response: Dict[str, Any]) -> Optional[FactoidPayload]:
    """Parse a factoid response using the actual app's extraction logic."""
    try:
        # If we have the direct fields from generation, use those
        if all(k in response for k in ["factoid_text", "subject", "emoji"]):
            return FactoidPayload(
                text=response["factoid_text"],
                subject=response["subject"],
                emoji=response["emoji"],
            )

        return None
    except Exception:
        return None
