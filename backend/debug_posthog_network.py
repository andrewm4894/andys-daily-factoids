#!/usr/bin/env python3
"""Debug network connectivity and PostHog consumer thread health in production."""

import os
import sys
import time
from pathlib import Path

# Add the project root to Python path
sys.path.insert(0, str(Path(__file__).parent))

# Configure Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.production")

import django

django.setup()

import requests
from django.conf import settings
from posthog import Posthog

print("=== PostHog Network & Consumer Debug ===")

# Get PostHog settings
api_key = getattr(settings, "POSTHOG_PROJECT_API_KEY", None)
host = getattr(settings, "POSTHOG_HOST", "https://us.i.posthog.com")

print(f"PostHog Host: {host}")
print(f"PostHog API Key: {'***' + api_key[-4:] if api_key else 'NOT SET'}")

# Test 1: Direct network connectivity to PostHog
print(f"\n🌐 Testing network connectivity to {host}...")
try:
    response = requests.get(f"{host}/decide", timeout=10)
    print(f"✅ Network connectivity OK (status: {response.status_code})")
except Exception as e:
    print(f"❌ Network connectivity failed: {e}")

# Test 2: PostHog client initialization
print("\n🔧 Testing PostHog client initialization...")
try:
    client = Posthog(api_key, host=host, debug=True, flush_at=1, flush_interval=1.0, timeout=10.0)
    print("✅ PostHog client initialized")
    print(f"   Client disabled: {client.disabled}")
    print(f"   Client send: {client.send}")

    # Check consumer thread - handle different PostHog versions
    if hasattr(client, "consumer"):
        print(f"   Consumer thread alive: {client.consumer.is_alive()}")
    elif hasattr(client, "_consumer"):
        print(f"   Consumer thread alive: {client._consumer.is_alive()}")
    else:
        print("   No consumer attribute found")
        print(
            f"   Client attributes: {[attr for attr in dir(client) if 'consumer' in attr.lower()]}"
        )
except Exception as e:
    print(f"❌ PostHog client initialization failed: {e}")
    sys.exit(1)

# Test 3: Send a test event and monitor
print("\n🎯 Sending test event...")
event_uuid = None
try:
    event_uuid = client.capture(
        distinct_id="debug-test-user",
        event="debug_network_test",
        properties={"test": "network_debug", "timestamp": time.time()},
    )
    print(f"✅ Event queued with UUID: {event_uuid}")
except Exception as e:
    print(f"❌ Event capture failed: {e}")

# Test 4: Monitor queue and consumer thread
print("\n📊 Monitoring PostHog internals for 10 seconds...")
for i in range(10):
    try:
        queue_size = client.queue.qsize()

        # Check consumer status
        consumer_alive = "unknown"
        if hasattr(client, "consumer"):
            consumer_alive = client.consumer.is_alive()
        elif hasattr(client, "_consumer"):
            consumer_alive = client._consumer.is_alive()

        print(f"  t+{i+1}s: Queue size: {queue_size}, Consumer alive: {consumer_alive}")

        if queue_size == 0 and i > 2:
            print("  🎉 Queue emptied - event likely sent!")
            break

    except Exception as e:
        print(f"  ❌ Error monitoring: {e}")

    time.sleep(1)

# Test 5: Force flush and check
print("\n🔄 Testing manual flush...")
try:
    client.flush()
    print("✅ Manual flush completed")
    final_queue_size = client.queue.qsize()
    print(f"   Final queue size: {final_queue_size}")
except Exception as e:
    print(f"❌ Manual flush failed: {e}")

print("\n✅ Network & consumer debug complete")
print("🔍 Check PostHog dashboard for 'debug_network_test' event")
