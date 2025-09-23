# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Andy's Daily Factoids is a Django + Next.js application that generates and displays AI-powered factoids. The backend is a Django REST API that manages factoid generation via OpenRouter, while the frontend is a Next.js app with server-side rendering and streaming capabilities.

## Architecture

- **Backend**: Django 5 project in `backend/` using Django REST Framework
- **Frontend**: Next.js 15 app in `frontend/` with App Router and React 19
- **Database**: PostgreSQL in production, SQLite for local development
- **Cache**: Optional Redis for rate limiting
- **Deployment**: Render-hosted with separate services for backend, frontend, and cron jobs
- **AI Generation**: OpenRouter API with LangChain integration
- **Analytics**: PostHog for generation tracing and user analytics

Key Django apps:
- `apps/factoids/`: Core factoid models, API endpoints, and generation service
- `apps/core/`: Shared services like rate limiting
- `apps/payments/`, `apps/analytics/`, `apps/chat/`: Future feature stubs

## Common Development Commands

Use the Makefile for all common tasks:

```bash
# Install dependencies
make install                # Both backend and frontend
make install-backend        # Django dependencies via uv
make install-frontend       # Next.js dependencies via npm

# Run development servers
make run                    # Both backend and frontend concurrently
make local-backend          # Django dev server only
make local-frontend         # Next.js dev server only

# Database operations
make migrate-backend        # Run Django migrations
make seed-backend          # Populate with sample factoids

# Testing
make test                   # All tests (backend, frontend, integration)
make test-backend          # Django unit tests via pytest
make test-frontend         # Frontend linting (no dedicated test suite yet)
make test-integration      # Integration tests against deployed endpoints
make test-rate-limit       # Rate limit functionality tests

# Linting
make lint                   # All linting
make lint-backend          # Backend via ruff
make lint-frontend         # Frontend via ESLint

# Factoid generation
make factoid               # Generate via Node.js script
make test-generate-factoid # Generate via Django service layer
make smoke-backend-api     # Quick API sanity check
```

### Backend Commands

```bash
cd backend
uv sync --extra dev        # Install dependencies
uv run python manage.py runserver
uv run python manage.py migrate
uv run python manage.py seed_factoids
uv run pytest             # Run tests
uv run ruff check .        # Lint code
```

### Frontend Commands

```bash
cd frontend
npm install
npm run dev                # Development with Turbopack
npm run build              # Production build with Turbopack
npm run start              # Production server
npm run lint               # ESLint
```

## Key Files and Patterns

### Backend Structure
- `factoids_project/settings/`: Environment-aware Django settings (base, local, production)
- `apps/factoids/api.py`: REST endpoints including streaming generation
- `apps/factoids/services/generator.py`: Core factoid generation workflow
- `apps/factoids/models.py`: Database models for factoids, votes, feedback
- `apps/core/services/rate_limits.py`: Rate limiting with Redis fallback

### Frontend Structure
- `src/app/page.tsx`: Main server component that fetches factoids
- `src/lib/api.ts`: Centralized API client with no-cache policy
- `src/components/generate-factoid-form.tsx`: Interactive generation with SSE streaming
- `src/app/globals.css`: Global styles and color tokens

### Generation Flow
1. Rate limit check via `apps.core.services.rate_limits`
2. Cost guard validation (budget enforcement)
3. Prompt building with recent factoids for variety
4. OpenRouter API call through LangChain with PostHog callbacks
5. Database persistence and streaming response

### Environment Variables
Backend requires: `OPENROUTER_API_KEY`, `DATABASE_URL`, `DJANGO_SECRET_KEY`
Optional: `REDIS_URL`, `POSTHOG_PROJECT_API_KEY`, `POSTHOG_HOST`
Frontend requires: `NEXT_PUBLIC_FACTOIDS_API_BASE` (defaults to localhost:8000)

## Testing Strategy

- Backend: pytest with Django test database
- Frontend: ESLint for now (component tests planned)
- Integration: Node.js scripts that hit deployed endpoints
- Rate limiting: Dedicated test scripts for validation

## Code Conventions

- Backend: Django patterns with DRF, ruff formatting (line length 100)
- Frontend: Next.js 15 App Router, TypeScript, Tailwind CSS
- API: RESTful endpoints under `/api/factoids/` with streaming support via SSE
- Models: UUIDs for primary keys, structured JSON fields for metadata
- Services: Clear separation between API, business logic, and data access layers

## Local Development Setup

1. `make install` to install both backend and frontend dependencies
2. `make migrate-backend` to set up the SQLite database
3. Copy `backend/.env.example` to `backend/.env` and add OpenRouter API key
4. `make run` to start both servers (backend on :8000, frontend on :3000)
5. Optionally `make seed-backend` for sample data

The frontend automatically connects to `http://localhost:8000/api/factoids` by default.