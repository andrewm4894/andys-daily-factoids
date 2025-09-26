#!/usr/bin/env python
"""Daily evaluation cron job script for Render."""

import os
import sys
from pathlib import Path

# Add backend to path and load env
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(backend_dir / ".env")

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "factoids_project.settings.production")
import django  # noqa: E402

django.setup()

from evals.eval import run_evaluation  # noqa: E402


def main():
    """Run daily evaluation as a cron job."""
    try:
        print("🕒 Starting daily evaluation cron job...")
        # Call the unified eval with daily parameters
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(run_evaluation, ["--daily", "--production", "--sample-size", "20"])

        if result.exit_code == 0:
            print("✅ Daily evaluation cron job completed successfully")
            return 0
        else:
            print(f"❌ Daily evaluation cron job failed with exit code {result.exit_code}")
            print(result.output)
            return result.exit_code
    except Exception as e:
        print(f"❌ Daily evaluation cron job failed: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
