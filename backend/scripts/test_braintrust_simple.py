#!/usr/bin/env python3
"""Simple test to verify Braintrust is capturing LangChain calls."""

import os
import sys
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Set up Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")

import django

django.setup()

from apps.core.braintrust import get_braintrust_callback_handler, initialize_braintrust
from django.conf import settings
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI


async def main():
    """Test simple LangChain call with Braintrust."""
    print("🧪 Testing Simple LangChain + Braintrust Integration")
    print("=" * 55)

    # Initialize Braintrust
    success = initialize_braintrust()
    if not success:
        print("❌ Failed to initialize Braintrust")
        return False

    print("✅ Braintrust initialized successfully")

    # Check if we have OpenRouter API key
    api_key = getattr(settings, "OPENROUTER_API_KEY", None)
    if not api_key:
        print("❌ OPENROUTER_API_KEY not configured")
        return False

    print("✅ OpenRouter API key found")

    # Create a simple ChatOpenAI model (without tools)
    model = ChatOpenAI(
        api_key=api_key,
        base_url=settings.OPENROUTER_BASE_URL.rstrip("/"),
        model="openai/gpt-3.5-turbo",  # Use a simple model without tool support
        temperature=0.7,
    )

    print("✅ ChatOpenAI model created")

    # Get Braintrust callback handler
    braintrust_handler = get_braintrust_callback_handler()
    callbacks = [braintrust_handler] if braintrust_handler else []

    print(f"✅ Callbacks prepared: {len(callbacks)} handlers")

    try:
        # Make a simple LLM call
        print("\n🔄 Making LLM call...")

        message = HumanMessage(content="What is 2 + 2? Answer in one sentence.")
        response = model.invoke([message], config={"callbacks": callbacks})

        print(f"✅ LLM Response: {response.content}")
        print("\n🎉 Success! Check your Braintrust dashboard for the trace:")
        print("   - Visit: https://www.braintrust.dev/")
        print("   - Project: andys-daily-factoids")
        print("   - Look for recent traces")

        return True

    except Exception as e:
        print(f"❌ LLM call failed: {e}")
        return False


if __name__ == "__main__":
    import asyncio

    success = asyncio.run(main())
    sys.exit(0 if success else 1)
