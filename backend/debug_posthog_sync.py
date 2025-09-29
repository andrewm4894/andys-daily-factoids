#!/usr/bin/env python3
"""Test PostHog with synchronous mode to bypass consumer thread issues."""

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

print("=== PostHog Synchronous Mode Test ===")

# Get PostHog settings
api_key = getattr(settings, "POSTHOG_PROJECT_API_KEY", None)
host = getattr(settings, "POSTHOG_HOST", "https://us.i.posthog.com")

# Test 1: Synchronous mode (bypasses consumer thread)
print("\n🔄 Testing PostHog in synchronous mode...")
try:
    sync_client = Posthog(
        api_key,
        host=host,
        debug=True,
        sync_mode=True,  # This bypasses the consumer thread
        timeout=15.0,
    )
    print("✅ Synchronous PostHog client created")

    # Send test event synchronously
    result = sync_client.capture(
        distinct_id="sync-test-user",
        event="sync_mode_test",
        properties={"test": "synchronous_delivery", "environment": "production"},
    )
    print(f"✅ Synchronous event sent, result: {result}")

except Exception as e:
    print(f"❌ Synchronous mode failed: {e}")
    import traceback

    traceback.print_exc()

# Test 2: Async mode but with immediate flush
print("\n🔄 Testing PostHog async mode with immediate flush...")
try:
    async_client = Posthog(
        api_key,
        host=host,
        debug=True,
        sync_mode=False,
        flush_at=1,
        flush_interval=0.1,
        timeout=15.0,
    )

    print(
        f"   Consumer thread attributes: {[attr for attr in dir(async_client) if 'consumer' in attr.lower()]}"
    )

    # Send event and immediately flush
    result = async_client.capture(
        distinct_id="async-test-user",
        event="async_mode_test",
        properties={"test": "async_with_flush", "environment": "production"},
    )
    print(f"✅ Async event queued, result: {result}")

    # Force immediate flush
    async_client.flush()
    print("✅ Flush completed")

except Exception as e:
    print(f"❌ Async mode with flush failed: {e}")
    import traceback

    traceback.print_exc()

print("\n✅ Sync mode test complete")
print("🔍 Check PostHog dashboard for 'sync_mode_test' and 'async_mode_test' events")
