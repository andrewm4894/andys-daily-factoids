# Andy's Daily Factoids

[![Tests](https://github.com/andrewm4894/andys-daily-factoids/workflows/Test%20Suite/badge.svg)](https://github.com/andrewm4894/andys-daily-factoids/actions/workflows/test.yml)
[![Code Quality](https://github.com/andrewm4894/andys-daily-factoids/workflows/Code%20Quality/badge.svg)](https://github.com/andrewm4894/andys-daily-factoids/actions/workflows/code-quality.yml)

Fun project to get a random factoid every day: https://andys-daily-factoids.com/

Andy’s Daily Factoids now runs as a Render-hosted stack: a Django API feeds a Next.js frontend, backed by Postgres (and optional Redis) with OpenRouter supplying the factoids. See `ARCHITECTURE.md` for a deeper dive.

## Features

- Pull fresh factoids on demand (now hourly by default).
- Vote 🤯 or 😒 and see the live tally for each factoid.
- Shuffle through the catalogue without waiting for generation.
- One-click copy + Google search for the curious.
- Generate brand new factoids via OpenRouter with optional model overrides.
- Inspect generation metadata (model, parameters, cost).
- Capture end-to-end telemetry with PostHog analytics hooks.
- Unlock additional generations through a Stripe checkout whenever you hit the free limit.

## How It Works

- **Render services**: `render.yaml` provisions three services – `factoids-backend` (Django + Gunicorn), `factoids-frontend` (Next.js), and `factoid-generator` (cron job that runs the same generation pipeline every 30 minutes).
- **Backend**: Django REST Framework exposes the API under `/api/factoids/`, persists to Postgres via `dj-database-url`, and optionally rate-limits through Redis.
- **Frontend**: Next.js 15 App Router fetches factoids server-side and streams generation status to the browser with Server-Sent Events.
- **Generation**: `apps/factoids/services/generator.py` orchestrates model selection, prompt construction, OpenRouter calls, and PostHog LangChain callbacks.
- **Observability**: PostHog captures structured generation traces; Render logs collect stdout/stderr for both web services and cron runs.
- **Automation**: The cron service (`uv run python manage.py generate_factoid ...`) ensures fresh content without manual intervention.

## Environment Variables

### Backend (Django)

| Variable | Purpose |
| --- | --- |
| `DJANGO_SETTINGS_MODULE` | Settings module (`factoids_project.settings.production` in Render) |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated host list for Django |
| `DJANGO_SECRET_KEY` | Secret key for cryptographic signing |
| `DATABASE_URL` | Postgres connection string |
| `OPENROUTER_API_KEY` | Required for factoid generation |
| `OPENROUTER_BASE_URL` | Optional override for the OpenRouter endpoint |
| `POSTHOG_PROJECT_API_KEY` | Enables generation tracing via PostHog |
| `POSTHOG_HOST` | Optional PostHog host override |
| `REDIS_URL` | Optional Redis endpoint for distributed rate limiting |
| `DJANGO_CORS_ALLOWED_ORIGINS` | Origin allowlist for the frontend |
| `STRIPE_SECRET_KEY` | Server-side Stripe API key used to create checkout sessions |
| `STRIPE_PUBLISHABLE_KEY` | Optional publishable key returned to the browser when redirecting via Stripe.js |
| `STRIPE_PRICE_ID` | Optional Stripe Price identifier (defaults to `price_1SAYzlDuK9b9aydCEXpAkQpt`) |
| `STRIPE_CHECKOUT_AMOUNT_CENTS` | Fallback amount (in cents) when a price ID is not supplied |
| `STRIPE_CHECKOUT_CURRENCY` | Currency for fallback checkout sessions (defaults to `usd`) |
| `STRIPE_CHECKOUT_PRODUCT_NAME` | Display name for fallback checkout line items |
| `STRIPE_SUCCESS_URL` | Default success redirect for Stripe checkout (include `{CHECKOUT_SESSION_ID}` placeholder) |
| `STRIPE_CANCEL_URL` | Default cancel redirect for Stripe checkout |

### Frontend (Next.js)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_FACTOIDS_API_BASE` | Base URL for the Django API (defaults to local dev URL) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog browser key for client analytics |
| `NEXT_PUBLIC_POSTHOG_HOST` | Optional PostHog host override |
| `NEXT_TELEMETRY_DISABLED` | Disable Next.js telemetry (set to `1` in Render) |
| `NEXT_PUBLIC_PAYMENTS_API_BASE` | Override for the payments API base URL (defaults to Django dev URL) |

Copy `backend/.env.example` for backend secrets and create `frontend/.env.local` (or export env vars) for the frontend. Render manages production secrets via the dashboard as defined in `render.yaml`.

## Local Development

Prerequisites: Node.js 20+, `uv` (for Python dependency management), and Postgres/Redis if you want to mirror production locally.

```bash
# Install dependencies (includes pre-commit hooks)
make install

# Apply database migrations (SQLite by default locally)
make migrate-backend

# Run the Django dev server
make local-backend

# In another shell, run the Next.js dev server
make local-frontend

# Or run both together (alias: `make local`)
make run
```

The frontend points at `http://localhost:8000/api/factoids` by default. Adjust `NEXT_PUBLIC_FACTOIDS_API_BASE` if you proxy or tunnel the API.

## Code Quality & Pre-commit Hooks

This project uses pre-commit hooks to ensure code quality and consistency across both backend and frontend:

### Backend (Python)
- **Ruff**: Linting (E, F, I rules) and code formatting
- **MyPy**: Type checking with Django stubs
- **General hooks**: Trailing whitespace, end-of-file, YAML/JSON validation

### Frontend (TypeScript/JavaScript)
- **ESLint**: Linting with Next.js configuration
- **Prettier**: Code formatting for consistent style
- **General hooks**: File validation and formatting

### Usage

```bash
# Install pre-commit hooks (done automatically with `make install`)
make precommit-install

# Run all pre-commit hooks on all files
make precommit
# or
make precommit-run

# Update pre-commit hooks to latest versions
make precommit-update

# Manual linting (runs the same tools as pre-commit)
make lint              # Both backend and frontend
make lint-backend      # Backend only (Ruff + MyPy)
make lint-frontend     # Frontend only (ESLint)

# Frontend formatting
cd frontend && npm run format        # Format with Prettier
cd frontend && npm run format:check  # Check formatting
cd frontend && npm run lint:fix      # Fix ESLint issues
```

Pre-commit hooks run automatically on every commit. If a hook fails, the commit is blocked until issues are resolved.

## Testing

```bash
make test-backend      # Django unit tests via pytest
make test-frontend     # Currently runs ESLint for the Next.js app
make test-integration  # Calls the deployed rate limit endpoint (configure env first)
make test-rate-limit   # Legacy scripts for manual rate limit checks
```

See `tests/README.md` for expectations and environment setup.

## PostHog LLM Analytics

The generation service (`apps/factoids/services/generator.py`) integrates PostHog’s LangChain callbacks. To enable analytics:

1. Create a PostHog project and grab the API key (e.g., `phc_...`).
2. Set `POSTHOG_PROJECT_API_KEY` (and optionally `POSTHOG_HOST`) in Render and your local `.env`.
3. Ensure the frontend has `NEXT_PUBLIC_POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_HOST` set so client events (pageviews, button toggles) pair with backend traces.

Once configured, every generation emits `$ai_generation` events with topic, profile, request source, and timing metadata. Failures raise `$exception` events for easier debugging.

## Deployment

- Render handles CI/CD using `render.yaml`. Pushes to `main` trigger new builds for the backend and frontend services.
- Gunicorn serves the Django app with WhiteNoise providing static asset hosting.
- The cron service shares the same codebase and settings module, ensuring consistent behaviour between on-demand and scheduled generation.

---

Need a deeper mental model? Head over to `ARCHITECTURE.md` for diagrams, component breakdowns, and operational guidance.
