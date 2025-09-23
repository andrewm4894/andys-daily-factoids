# Test Suite for Andy's Daily Factoids

This directory captures the legacy test harness that accompanied the initial serverless prototype. As the project migrates to Django on Render, we are gradually refreshing these scripts. Use the notes below to understand what still runs today and how to configure the integration checks against the new API.

## Layout

### Backend (`tests/backend/`)
- `simpleRateLimit.test.mjs` – Header parsing + rate-limit helper primitives (JavaScript). Still useful for quick sanity checks.
- `testFramework.mjs` – Minimal assertion helpers that mimic Jest's API.

### Frontend (`tests/frontend/`)
- `RateLimitStatus.test.js` – Component smoke test (React Testing Library). Update to the Next.js app is in progress; today it mainly lints.

### Integration (`tests/integration/`)
- `rateLimitIntegration.test.mjs` – Calls the deployed Django endpoint `/api/factoids/limits/` to verify the anonymous rate-limit status document.

## Running Tests

```bash
make test            # Run every suite we currently support
make test-backend    # JavaScript helpers + linting sanity checks
make test-frontend   # ESLint for the Next.js project
make test-integration # Hits the live Render backend (configure env first)
make test-rate-limit # Manual scripts for legacy scenarios
```

Refer to the top-level `Makefile` if you prefer running commands directly (each target prints a short description).

## Integration Configuration

The integration script expects the following environment variables (load them via `frontend/.env`, `.env.local`, or your shell):

| Variable | Description |
| --- | --- |
| `FACTOIDS_API_BASE` | Base URL for the Django API (defaults to production) |
| `FACTOIDS_API_KEY` | Optional API key if you gate the endpoint |

Example `.env.local` snippet:

```
FACTOIDS_API_BASE=https://factoids-backend.onrender.com/api/factoids
FACTOIDS_API_KEY=your-key-if-required
```

Locally, point `FACTOIDS_API_BASE` at `http://localhost:8000/api/factoids`.

## Coverage Notes

- **Backend helpers**: validate basic IP parsing and fallback hashing logic. Full Django tests now live under `backend/apps/*/tests` (run via `uv run pytest`).
- **Frontend**: minimal coverage until we expand the Next.js testing story.
- **Integration**: ensures the deployed rate-limit endpoint returns structure consistent with `FactoidRateLimitStatusView` (profile, per-minute limit, current window count, cost budget).

## Adding New Checks

- Prefer adding Django tests under `backend/apps/**/tests/` for new server-side behaviour.
- Component/page tests belong under `frontend/src/**/__tests__` or your preferred Next.js testing directory.
- Use `tests/integration/` for black-box exercises that call deployed APIs.

These legacy scripts remain for parity with the original project; feel free to retire them once the Django-native suites cover the same ground.
