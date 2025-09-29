#!/usr/bin/env python3
"""Test script for LangSmith integration."""

import os
import sys
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Set up Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")

import django  # noqa: E402

django.setup()

from apps.core.langsmith import (  # noqa: E402
    get_langsmith_callback_handler,
    get_langsmith_client,
    initialize_langsmith,
)
from django.conf import settings  # noqa: E402


def test_langsmith_configuration():
    """Test LangSmith configuration and availability."""
    print("=== LangSmith Integration Test ===\n")

    # Check settings
    print("1. Checking Django settings:")
    print(f"   LANGSMITH_API_KEY: {'***' if settings.LANGSMITH_API_KEY else 'NOT SET'}")
    print(f"   LANGSMITH_PROJECT: {settings.LANGSMITH_PROJECT}")
    print(f"   LANGSMITH_TRACING: {settings.LANGSMITH_TRACING}")
    print()

    # Test client creation
    print("2. Testing LangSmith client:")
    client = get_langsmith_client()
    if client:
        print("   ✓ LangSmith client created successfully")
        try:
            # Test a simple API call to verify connection
            projects = list(client.list_projects(limit=1))
            print(f"   ✓ API connection verified (found {len(projects)} project(s))")
        except Exception as e:
            print(f"   ⚠ API connection failed: {e}")
    else:
        print("   ✗ Failed to create LangSmith client")
    print()

    # Test callback handler
    print("3. Testing LangSmith callback handler:")
    callback = get_langsmith_callback_handler()
    if callback:
        print("   ✓ LangSmith callback handler created successfully")
        print(f"   Project: {callback.project_name}")
    else:
        print("   ✗ Failed to create LangSmith callback handler")
    print()

    # Test initialization
    print("4. Testing LangSmith initialization:")
    try:
        initialize_langsmith()
        print("   ✓ LangSmith initialization completed")

        # Check environment variables set by initialization
        env_vars = {
            "LANGCHAIN_TRACING_V2": os.getenv("LANGCHAIN_TRACING_V2"),
            "LANGCHAIN_API_KEY": "***" if os.getenv("LANGCHAIN_API_KEY") else None,
            "LANGCHAIN_PROJECT": os.getenv("LANGCHAIN_PROJECT"),
        }

        for var, value in env_vars.items():
            print(f"   {var}: {value or 'NOT SET'}")

    except Exception as e:
        print(f"   ✗ LangSmith initialization failed: {e}")
    print()

    # Summary
    print("=== Summary ===")
    if settings.LANGSMITH_API_KEY and settings.LANGSMITH_TRACING:
        print("✓ LangSmith is configured and should be working!")
        print(f"  Traces will appear in project: {settings.LANGSMITH_PROJECT}")
        print(
            "  Dashboard: https://smith.langchain.com/o/d409b854-2de0-472d-ae5e-1c8e33db5467/projects/p/adfd0d1b-3334-41f9-a421-b252460c30c3"
        )
    else:
        print("⚠ LangSmith is not fully configured:")
        if not settings.LANGSMITH_API_KEY:
            print("  - Set LANGSMITH_API_KEY in your environment")
        if not settings.LANGSMITH_TRACING:
            print("  - Set LANGSMITH_TRACING=True to enable tracing")


if __name__ == "__main__":
    test_langsmith_configuration()
