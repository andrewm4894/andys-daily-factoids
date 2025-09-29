#!/usr/bin/env python3
"""Minimal test of PostHog LangChain integration outside Django context."""

import os
import sys
from pathlib import Path

# Add the project root to Python path
sys.path.insert(0, str(Path(__file__).parent))

# Configure Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.production")

import django

django.setup()

from django.conf import settings
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from posthog import Posthog
from posthog.ai.langchain import CallbackHandler

print("=== Minimal PostHog LangChain Test ===")

# Get PostHog client
api_key = getattr(settings, "POSTHOG_PROJECT_API_KEY", None)
host = getattr(settings, "POSTHOG_HOST", "https://us.i.posthog.com")

if not api_key:
    print("❌ No PostHog API key found")
    sys.exit(1)

print("✅ PostHog API key found")

# Create PostHog client with debug
client = Posthog(
    api_key,
    host=host,
    debug=True,  # Enable debug logging
    flush_at=1,
    flush_interval=1.0,
)

print("✅ PostHog client created")

# Create callback handler
callback = CallbackHandler(
    client=client,
    distinct_id="test-user",
    trace_id="test-trace-123",
    properties={"test": "minimal_langchain_test"},
)

print("✅ PostHog callback handler created")

# Test with a simple LLM call
try:
    openrouter_key = getattr(settings, "OPENROUTER_API_KEY", None)
    if not openrouter_key:
        print("❌ No OpenRouter API key found")
        sys.exit(1)

    llm = ChatOpenAI(
        openai_api_key=openrouter_key,
        openai_api_base="https://openrouter.ai/api/v1",
        model="openai/gpt-3.5-turbo",
        temperature=0.0,
    )

    print("✅ LLM client created")

    # Make LLM call with PostHog callback
    print("🔄 Making LLM call with PostHog callback...")

    response = llm.invoke(
        [HumanMessage(content="Say hello in one word")], config={"callbacks": [callback]}
    )

    print(f"✅ LLM response: {response.content}")

    # Try manual flush
    print("🔄 Manually flushing PostHog...")
    client.flush()
    print("✅ Flush completed")

    print("\n=== Test Summary ===")
    print("✅ PostHog client works")
    print("✅ LangChain callback executes")
    print("✅ Manual flush succeeds")
    print("📊 Check PostHog dashboard for events with trace_id: test-trace-123")

except Exception as e:
    print(f"❌ Error during LLM call: {e}")
    import traceback

    traceback.print_exc()
