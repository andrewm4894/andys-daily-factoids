#!/usr/bin/env python3
"""Simple test of LangSmith tracing with a basic LLM call."""

import os
import sys
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Set up Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")

# Enable LangSmith tracing for this test
os.environ["LANGSMITH_TRACING"] = "True"

import django

django.setup()

from apps.core.langsmith import get_langsmith_callback_handler, initialize_langsmith
from django.conf import settings
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI


def test_langsmith_tracing():
    """Test LangSmith tracing with a simple LLM call."""
    print("=== LangSmith Tracing Test ===\n")

    # Initialize LangSmith
    initialize_langsmith()

    # Check if API key is available
    api_key = getattr(settings, "OPENROUTER_API_KEY", None)
    if not api_key:
        print("⚠ OPENROUTER_API_KEY not set, skipping LLM call test")
        return

    print("1. Creating ChatOpenAI client...")

    # Create a ChatOpenAI client
    chat = ChatOpenAI(
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        model="openai/gpt-4o-mini",
        temperature=0.7,
    )

    print("2. Getting LangSmith callback handler...")
    callback = get_langsmith_callback_handler()

    print("3. Making a test LLM call...")

    # Make a simple test call
    try:
        messages = [HumanMessage(content="Say 'Hello from LangSmith!' in a creative way.")]

        config = {}
        if callback:
            config["callbacks"] = [callback]
            print("   ✓ Using LangSmith callback handler")

        response = chat.invoke(messages, config=config)
        print(f"   ✓ LLM Response: {response.content}")

        print("\n4. Checking environment variables:")
        env_vars = {
            "LANGCHAIN_TRACING_V2": os.getenv("LANGCHAIN_TRACING_V2"),
            "LANGCHAIN_API_KEY": "***" if os.getenv("LANGCHAIN_API_KEY") else "NOT SET",
            "LANGCHAIN_PROJECT": os.getenv("LANGCHAIN_PROJECT"),
        }

        for var, value in env_vars.items():
            print(f"   {var}: {value}")

        print("\n=== Summary ===")
        if os.getenv("LANGCHAIN_TRACING_V2") == "true":
            print("✓ LangSmith tracing is enabled!")
            print(f"  Project: {os.getenv('LANGCHAIN_PROJECT', 'default')}")
            print("  Check your LangSmith dashboard for the trace:")
            print(
                "  https://smith.langchain.com/o/d409b854-2de0-472d-ae5e-1c8e33db5467/projects/p/adfd0d1b-3334-41f9-a421-b252460c30c3"
            )
        else:
            print("⚠ LangSmith tracing environment variables not set correctly")

    except Exception as e:
        print(f"   ✗ Error making LLM call: {e}")


if __name__ == "__main__":
    test_langsmith_tracing()
