"""Simple smoke test for the factoid generation API."""

from __future__ import annotations

import json
import os
import sys

import httpx

API_BASE = os.getenv("FACTOIDS_API_BASE", "http://127.0.0.1:8000/api/factoids")
PAYLOAD = {"topic": os.getenv("FACTOID_TOPIC", "space exploration")}


def main() -> int:
    url = f"{API_BASE.rstrip('/')}/generate/"
    try:
        response = httpx.post(url, json=PAYLOAD, timeout=30)
    except httpx.HTTPError as exc:  # pragma: no cover - CLI convenience
        print(f"Request failed: {exc}", file=sys.stderr)
        return 1

    print(f"Status: {response.status_code}")
    try:
        data = response.json()
    except json.JSONDecodeError:
        print(response.text)
        return 0 if response.status_code < 400 else 1

    print(json.dumps(data, indent=2))
    return 0 if response.status_code < 400 else 1


if __name__ == "__main__":
    raise SystemExit(main())
