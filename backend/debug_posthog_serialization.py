#!/usr/bin/env python3
"""Debug PostHog event serialization to find why events don't reach dashboard."""

import json
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
from posthog import Posthog

print("=== PostHog Serialization Debug ===")

# Get PostHog client
api_key = getattr(settings, "POSTHOG_PROJECT_API_KEY", None)
host = getattr(settings, "POSTHOG_HOST", "https://us.i.posthog.com")

if not api_key:
    print("❌ No PostHog API key found")
    sys.exit(1)

# Create PostHog client
client = Posthog(api_key, host=host, debug=True)

# Create test event similar to what LangChain produces
from uuid import uuid4

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

# Simulate the complex event data from production logs
complex_event_data = {
    "distinct_id": "782b79a55f43f479ca7c7e33a38fb4271f4f5bd891809afc70818c86c6d60af6",
    "event": "$ai_trace",
    "properties": {
        "$ai_trace_id": "b065aeda-3f60-4b06-9435-a49f283d7259",
        "$ai_input_state": {"messages": [HumanMessage(content="is this dangerous?", id="test-id")]},
        "$ai_latency": 17.868481159210205,
        "$ai_span_name": "LangGraph",
        "$ai_span_id": uuid4(),
        "factoid_id": "c9de918c-e65e-4df3-a5a4-cda89b165562",
        "factoid_subject": "Atmospheric Physics",
        "factoid_emoji": "⚡️",
        "$ai_output_state": {
            "messages": [
                HumanMessage(content="is this dangerous?", id="test-id"),
                AIMessage(
                    content="",
                    additional_kwargs={
                        "tool_calls": [
                            {
                                "id": "test-tool",
                                "function": {"arguments": "{}", "name": "web_search"},
                                "type": "function",
                            }
                        ]
                    },
                    id="test-ai-message",
                ),
                ToolMessage(
                    content='{"results": []}',
                    name="web_search",
                    id="test-tool-message",
                    tool_call_id="test-tool",
                ),
                AIMessage(content="Test response", id="test-final-ai-message"),
            ]
        },
        "groups": {"factoid": "test-factoid"},
    },
}

print("🧪 Testing event serialization...")

# Test 1: Try to serialize the event data to JSON
try:
    json_str = json.dumps(complex_event_data, default=str)
    print("✅ Event data can be serialized to JSON")
    print(f"📊 JSON size: {len(json_str)} bytes")
except Exception as e:
    print(f"❌ JSON serialization failed: {e}")
    import traceback

    traceback.print_exc()

# Test 2: Try to capture the event
print("\n🎯 Testing PostHog capture with complex event...")
try:
    result = client.capture(**complex_event_data)
    print(f"✅ PostHog capture returned: {result}")
except Exception as e:
    print(f"❌ PostHog capture failed: {e}")
    import traceback

    traceback.print_exc()

# Test 3: Try a simpler event
print("\n🎯 Testing PostHog capture with simple event...")
simple_event_data = {
    "distinct_id": "782b79a55f43f479ca7c7e33a38fb4271f4f5bd891809afc70818c86c6d60af6",
    "event": "test_simple_event",
    "properties": {"test": "simple_value", "number": 123},
}

try:
    result = client.capture(**simple_event_data)
    print(f"✅ Simple PostHog capture returned: {result}")
except Exception as e:
    print(f"❌ Simple PostHog capture failed: {e}")
    import traceback

    traceback.print_exc()

# Test 4: Check queue status
print("\n📊 PostHog client queue status:")
try:
    queue_size = client.queue.qsize()
    print(f"Queue size: {queue_size}")
except Exception as e:
    print(f"❌ Could not get queue size: {e}")

print("\n✅ Serialization debug complete")
