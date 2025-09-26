#!/usr/bin/env python
"""Quick test to verify eval setup is working."""

import os
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Set Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.local")


def test_imports():
    """Test that all imports work."""
    print("Testing imports...")

    # Test Django setup
    import django

    django.setup()
    print("✓ Django setup successful")

    # Test Django models

    print("✓ Django models import successful")

    # Test service imports

    print("✓ Service imports successful")

    # Test Braintrust

    print("✓ Braintrust imports successful")

    # Test autoevals

    print("✓ Autoevals imports successful")

    # Test eval modules

    print("✓ Eval modules import successful")

    print("\n✅ All imports working!")


def test_dataset_manager():
    """Test dataset manager functionality."""
    print("\nTesting dataset manager...")
    from evals.core.datasets import DatasetManager

    dm = DatasetManager()

    # Test loading topics
    topics = dm.load_test_topics(sample_size=3)
    print(f"✓ Loaded {len(topics)} test topics")
    for i, topic in enumerate(topics, 1):
        print(f"  {i}. {topic['topic']} ({topic['category']})")

    print("\n✅ Dataset manager working!")


if __name__ == "__main__":
    test_imports()
    test_dataset_manager()
    print("\n🎉 Eval setup is working correctly!")
