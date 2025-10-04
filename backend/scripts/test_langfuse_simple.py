#!/usr/bin/env python3
"""Simple test to verify Langfuse is capturing LangChain calls."""

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

from apps.core.langfuse import (  # noqa: E402
    get_langfuse_callback_handler,
    get_langfuse_client,
    initialize_langfuse,
)
from django.conf import settings  # noqa: E402
from langchain_core.messages import HumanMessage  # noqa: E402
from langchain_openai import ChatOpenAI  # noqa: E402


async def main():
    """Test simple LangChain call with Langfuse."""
    print("🧪 Testing Simple LangChain + Langfuse Integration")
    print("=" * 55)

    # Initialize Langfuse
    initialize_langfuse()
    client = get_langfuse_client()
    
    if not client:
        print("❌ Failed to initialize Langfuse")
        print("   Please ensure LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set")
        return False

    print("✅ Langfuse initialized successfully")

    # Check if we have OpenRouter API key
    api_key = getattr(settings, "OPENROUTER_API_KEY", None)
    if not api_key:
        print("❌ OPENROUTER_API_KEY not configured")
        return False

    print("✅ OpenRouter API key found")

    # Create a simple ChatOpenAI model
    model = ChatOpenAI(
        api_key=api_key,
        base_url=settings.OPENROUTER_BASE_URL.rstrip("/"),
        model="openai/gpt-3.5-turbo",
        temperature=0.7,
    )

    print("✅ ChatOpenAI model created")

    # Get Langfuse callback handler
    langfuse_handler = get_langfuse_callback_handler()
    callbacks = [langfuse_handler] if langfuse_handler else []

    print(f"✅ Callbacks prepared: {len(callbacks)} handlers")

    try:
        # Make a simple LLM call
        print("\n🔄 Making LLM call...")

        message = HumanMessage(content="What is 2 + 2? Answer in one sentence.")
        response = model.invoke([message], config={"callbacks": callbacks})

        print(f"✅ LLM Response: {response.content}")
        
        # Flush the Langfuse client to ensure traces are sent
        if client:
            client.flush()
            print("✅ Flushed Langfuse traces")
        
        print("\n🎉 Success! Check your Langfuse dashboard for the trace:")
        print(f"   - Visit: {settings.LANGFUSE_HOST}")
        print("   - Project: andys-daily-factoids")
        print("   - Look for recent traces")

        return True

    except Exception as e:
        print(f"❌ LLM call failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    import asyncio

    success = asyncio.run(main())
    sys.exit(0 if success else 1)
