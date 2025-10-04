# Andy's Daily Factoids

[![Tests](https://github.com/andrewm4894/andys-daily-factoids/workflows/Test%20Suite/badge.svg)](https://github.com/andrewm4894/andys-daily-factoids/actions/workflows/test.yml)
[![Code Quality](https://github.com/andrewm4894/andys-daily-factoids/workflows/Code%20Quality/badge.svg)](https://github.com/andrewm4894/andys-daily-factoids/actions/workflows/code-quality.yml)

AI-powered factoid generator with interactive voting: https://andys-daily-factoids.com/

A Django REST API + Next.js frontend stack on Render, using OpenRouter for generation and PostHog for analytics. See `ARCHITECTURE.md` for detailed design.

## Features

- **Fresh factoids**: Generated every 30 minutes via cron or on-demand
- **Interactive voting**: 🤯 or 😒 with live tallies
- **Browse & shuffle**: Explore the catalogue without waiting
- **Model flexibility**: Override generation parameters and model selection
- **Metadata inspection**: View model, parameters, and cost per factoid
- **Analytics**: End-to-end telemetry via PostHog LangChain callbacks
- **Payments**: Unlock additional generations via Stripe checkout

## Architecture

- **Backend**: Django 5 + DRF API at `/api/factoids/`, Postgres storage, optional Redis rate limiting
- **Frontend**: Next.js 15 App Router with SSR and Server-Sent Events streaming
- **Generation**: `apps/factoids/services/generator.py` orchestrates OpenRouter calls with PostHog tracing
- **Deployment**: `render.yaml` provisions backend, frontend, and cron services
- **Automation**: Scheduled generation via `factoid-generator` cron job

## Configuration

### Backend (Django)
Copy `backend/.env.example` to `backend/.env` and configure:
- `OPENROUTER_API_KEY` - **Required** for generation
- `DATABASE_URL` - Postgres connection (SQLite by default locally)
- `DJANGO_SECRET_KEY` - Cryptographic signing key
- `REDIS_URL` - Optional for distributed rate limiting
- `POSTHOG_PROJECT_API_KEY` / `POSTHOG_HOST` - Optional analytics
- `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` - Optional payments

### Frontend (Next.js)
Create `frontend/.env.local` if needed:
- `NEXT_PUBLIC_FACTOIDS_API_BASE` - Backend API URL (defaults to `http://localhost:8000/api/factoids`)
- `NEXT_PUBLIC_POSTHOG_KEY` - Optional client analytics

Render manages production secrets via the dashboard and `render.yaml`.

## Quick Start

**Prerequisites**: Node.js 20+, `uv` (Python dependency manager)

```bash
make install           # Install dependencies + pre-commit hooks
make migrate-backend   # Setup database (SQLite locally)
make run               # Start both backend (:8000) and frontend (:3000)
```

Common commands:
```bash
make test              # Run all tests
make lint              # Lint backend + frontend
make factoid           # Generate a factoid via CLI
make precommit         # Run pre-commit hooks manually
```

See the Makefile or `CLAUDE.md` for the full command reference.

## Testing & Quality

Pre-commit hooks run automatically (Ruff, MyPy, ESLint, Prettier). Install with `make precommit-install` or `make install`.

```bash
make test              # All tests
make test-backend      # Django unit tests (pytest)
make test-integration  # Integration tests against deployed endpoints
make lint              # Lint backend + frontend
```

See `tests/README.md` for details.

## Deployment

Render auto-deploys from `main` via `render.yaml`:
- **Backend**: Gunicorn + WhiteNoise for static assets
- **Frontend**: Next.js production build
- **Cron**: Shared codebase ensures consistent generation behavior

### Preview Environments

Every pull request to `main` automatically gets its own isolated preview deployment:
- **Automatic deployment** of both backend and frontend
- **Unique URLs** like `factoids-backend-pr-{number}.onrender.com`
- **Isolated databases** for safe testing
- **Automatic service linking** between frontend and backend
- **2-day expiration** after PR closure

See `PREVIEW_ENVIRONMENTS.md` for detailed documentation on using preview environments for testing and review.

---

For architecture details, deployment workflows, and operational guidance, see `ARCHITECTURE.md`.
