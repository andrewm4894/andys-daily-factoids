#!/usr/bin/env python3
"""Test script to verify Braintrust integration is working."""

import os
import sys
from pathlib import Path

# Add the backend directory to Python path so we can import Django modules
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Set up Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")

import django

django.setup()

from apps.core.braintrust import get_braintrust_callback_handler, initialize_braintrust
from django.conf import settings


def main():
    """Test Braintrust integration."""
    print("🧠 Testing Braintrust Integration for Andy's Daily Factoids")
    print("=" * 60)

    # Check if API key is configured
    api_key = getattr(settings, "BRAINTRUST_API_KEY", None)
    if not api_key:
        print("❌ BRAINTRUST_API_KEY not found in settings")
        print("   Make sure you've added BRAINTRUST_API_KEY to your .env file")
        return False

    print(f"✓ BRAINTRUST_API_KEY configured: {api_key[:10]}...")

    # Test initialization
    print("\n🔧 Testing Braintrust initialization...")
    success = initialize_braintrust()
    if success:
        print("✓ Braintrust initialized successfully")
    else:
        print("❌ Failed to initialize Braintrust")
        return False

    # Test callback handler creation
    print("\n🔧 Testing callback handler creation...")
    handler = get_braintrust_callback_handler()
    if handler:
        print(f"✓ Braintrust callback handler created: {type(handler).__name__}")
    else:
        print("❌ Failed to create Braintrust callback handler")
        return False

    print("\n🎉 Braintrust integration test completed successfully!")
    print("\nNext steps:")
    print("1. Run 'make run' to start the development server")
    print("2. Trigger factoid generation or chat agent in the UI")
    print("3. Check your Braintrust dashboard for traces: https://www.braintrust.dev/")
    print("4. Look for the 'andys-daily-factoids' project")

    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
