#!/usr/bin/env python3
"""Inspect the PostHog CallbackHandler to understand what it's doing."""

import os
import sys
from pathlib import Path

# Add the project root to Python path
sys.path.insert(0, str(Path(__file__).parent))

# Configure Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.production")

import django

django.setup()

import inspect

from django.conf import settings
from posthog import Posthog
from posthog.ai.langchain import CallbackHandler

print("=== PostHog CallbackHandler Inspection ===")

# Get PostHog client
api_key = getattr(settings, "POSTHOG_PROJECT_API_KEY", None)
host = getattr(settings, "POSTHOG_HOST", "https://us.i.posthog.com")

if not api_key:
    print("❌ No PostHog API key found")
    sys.exit(1)

client = Posthog(api_key, host=host, debug=True)

# Create callback handler
callback = CallbackHandler(
    client=client,
    distinct_id="test-user",
    trace_id="test-trace",
    properties={"test": "inspection"},
)

print("\n=== CallbackHandler Attributes ===")
for attr in dir(callback):
    if not attr.startswith("_"):
        value = getattr(callback, attr)
        if callable(value):
            print(f"📝 Method: {attr}")
        else:
            print(f"📋 Attribute: {attr} = {value}")

print("\n=== CallbackHandler Client Reference ===")
if hasattr(callback, "client"):
    print(f"✅ callback.client exists: {callback.client}")
    print(f"   Type: {type(callback.client)}")
    print(f"   Same as our client? {callback.client is client}")
elif hasattr(callback, "_client"):
    print(f"✅ callback._client exists: {callback._client}")
    print(f"   Type: {type(callback._client)}")
    print(f"   Same as our client? {callback._client is client}")
else:
    print("❌ No client reference found in callback")

print("\n=== Method Signatures ===")
for method_name in ["on_llm_start", "on_llm_end", "on_chain_start", "on_chain_end"]:
    if hasattr(callback, method_name):
        method = getattr(callback, method_name)
        sig = inspect.signature(method)
        print(f"📝 {method_name}{sig}")

print("\n=== Source Code Inspection ===")
try:
    source = inspect.getsource(CallbackHandler)
    print("📄 CallbackHandler source code:")
    print(source[:1000] + "..." if len(source) > 1000 else source)
except Exception as e:
    print(f"❌ Could not get source code: {e}")

print("\n=== Test Callback Method Calls ===")

# Mock some basic arguments for testing
mock_serialized = {"name": "test"}
mock_run_id = "test-run-123"
mock_tags = ["test"]

try:
    print("🔄 Testing on_llm_start...")
    callback.on_llm_start(mock_serialized, ["test prompt"], run_id=mock_run_id, tags=mock_tags)
    print("✅ on_llm_start completed")
except Exception as e:
    print(f"❌ on_llm_start failed: {e}")

try:
    print("🔄 Testing on_llm_end...")
    from langchain_core.outputs import Generation, LLMResult

    mock_result = LLMResult(generations=[[Generation(text="test response")]])
    callback.on_llm_end(mock_result, run_id=mock_run_id, tags=mock_tags)
    print("✅ on_llm_end completed")
except Exception as e:
    print(f"❌ on_llm_end failed: {e}")

print("\n=== Client Queue Status ===")
if hasattr(client, "queue"):
    try:
        queue_size = client.queue.qsize()
        print(f"📊 PostHog client queue size: {queue_size}")
    except Exception as e:
        print(f"❌ Could not get queue size: {e}")

print("\n✅ Inspection complete")
