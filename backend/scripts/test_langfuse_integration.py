#!/usr/bin/env python3
"""Test Langfuse integration with the full factoid generation service."""

import os
import sys
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Set up Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")

import django  # noqa: E402

django.setup()

from apps.core.langfuse import get_langfuse_client, initialize_langfuse  # noqa: E402
from apps.factoids.services.generator import generate_factoid  # noqa: E402
from django.conf import settings  # noqa: E402


def main():
    """Test factoid generation with Langfuse tracing."""
    print("🧪 Testing Factoid Generation + Langfuse Integration")
    print("=" * 60)

    # Initialize Langfuse
    initialize_langfuse()
    client = get_langfuse_client()

    if not client:
        print("❌ Failed to initialize Langfuse")
        print("   Please ensure LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set")
        return False

    print("✅ Langfuse client initialized")

    # Check if we have OpenRouter API key
    api_key = getattr(settings, "OPENROUTER_API_KEY", None)
    if not api_key:
        print("❌ OPENROUTER_API_KEY not configured")
        return False

    print("✅ OpenRouter API key found")

    try:
        # Generate a factoid
        print("\n🔄 Generating factoid...")
        
        factoid = generate_factoid(
            topic="artificial intelligence",
            model_key="openai/gpt-3.5-turbo",
            temperature=0.7,
            client_hash="test-langfuse-integration",
            profile="api_key",  # Use api_key profile for higher rate limits
            posthog_distinct_id="test-langfuse",
        )

        print("✅ Factoid generated successfully!")
        print(f"   Emoji: {factoid.emoji}")
        print(f"   Subject: {factoid.subject}")
        print(f"   Text: {factoid.text[:100]}...")
        
        # Flush the Langfuse client to ensure traces are sent
        if client:
            client.flush()
            print("\n✅ Flushed Langfuse traces")

        print("\n🎉 Success! Check your Langfuse dashboard for the trace:")
        print(f"   - Visit: {settings.LANGFUSE_HOST}")
        print("   - Project: andys-daily-factoids")
        print("   - Look for the trace with generation_request_id")
        print(f"   - Generation Request ID: {factoid.created_by.id}")

        return True

    except Exception as e:
        print(f"❌ Factoid generation failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
