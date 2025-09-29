#!/usr/bin/env python3
"""Test PostHog with instrumentation to see what methods are called."""

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

print("=== PostHog Instrumentation Test ===")

# Get PostHog client
api_key = getattr(settings, "POSTHOG_PROJECT_API_KEY", None)
host = getattr(settings, "POSTHOG_HOST", "https://us.i.posthog.com")

if not api_key:
    print("❌ No PostHog API key found")
    sys.exit(1)

# Create PostHog client
client = Posthog(
    api_key,
    host=host,
    debug=True,
    flush_at=1,
    flush_interval=1.0,
)

# Instrument the client to see what gets called
original_capture = client.capture
original_identify = client.identify
original_alias = client.alias

call_log = []


def instrumented_capture(*args, **kwargs):
    print("🎯 PostHog.capture called!")
    print(f"   args: {args}")
    print(f"   kwargs: {kwargs}")
    call_log.append(("capture", args, kwargs))
    return original_capture(*args, **kwargs)


def instrumented_identify(*args, **kwargs):
    print("🎯 PostHog.identify called!")
    print(f"   args: {args}")
    print(f"   kwargs: {kwargs}")
    call_log.append(("identify", args, kwargs))
    return original_identify(*args, **kwargs)


def instrumented_alias(*args, **kwargs):
    print("🎯 PostHog.alias called!")
    print(f"   args: {args}")
    print(f"   kwargs: {kwargs}")
    call_log.append(("alias", args, kwargs))
    return original_alias(*args, **kwargs)


client.capture = instrumented_capture
client.identify = instrumented_identify
client.alias = instrumented_alias

print("✅ PostHog client instrumented")

# Test manual capture first
print("\n=== Manual Capture Test ===")
client.capture(
    distinct_id="test-user",
    event="manual_test_event",
    properties={"source": "instrumentation_test"},
)
print("✅ Manual capture called")

# Test with LangChain callback
print("\n=== LangChain Callback Test ===")

callback = CallbackHandler(
    client=client,
    distinct_id="test-user-langchain",
    trace_id="test-trace-instrumented",
    properties={"test": "instrumented_langchain_test"},
)

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

    print("🔄 Making LLM call with instrumented PostHog callback...")

    response = llm.invoke(
        [HumanMessage(content="Say hello in one word")], config={"callbacks": [callback]}
    )

    print(f"✅ LLM response: {response.content}")

except Exception as e:
    print(f"❌ Error during LLM call: {e}")
    import traceback

    traceback.print_exc()

# Flush and summary
print("\n=== Flushing and Summary ===")
client.flush()

print("\n📊 PostHog Method Calls Summary:")
print(f"Total calls: {len(call_log)}")
for i, (method, args, kwargs) in enumerate(call_log, 1):
    print(f"{i}. {method}() - distinct_id: {args[0] if args else 'none'}")

if not call_log:
    print("❌ NO PostHog methods were called!")
else:
    print("✅ PostHog methods were called - check logs above for details")
