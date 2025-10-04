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
- `apps/payments/`, `apps/analytics/`, `apps/chat/`: Additional feature implementations

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
make smoke-chat-agent      # Exercise the chat agent web_search tool interactively
make smoke-chat-agent-search   # Test examples that should trigger web search
make smoke-chat-agent-no-search # Test examples that should NOT trigger web search
make smoke-chat-agent-edge     # Test edge case examples for web search behavior

# Pre-commit hooks
make precommit             # Run pre-commit hooks on all files
make precommit-install     # Install pre-commit hooks
make precommit-update      # Update pre-commit hooks to latest versions

# Quality evaluation
make eval-daily            # Run daily quality evaluation (20 recent factoids)
make eval-manual           # Manual evaluation of larger sample (100 factoids)

# Observability testing
make test-braintrust       # Test Braintrust integration setup
make test-braintrust-simple # Test simple LangChain call with Braintrust tracing
make test-langfuse         # Test Langfuse integration with full factoid generation
make test-langfuse-simple  # Test simple LangChain call with Langfuse tracing
```

### Running a Single Test

Backend tests use pytest:
```bash
cd backend
uv run pytest apps/factoids/tests/test_models.py           # Single file
uv run pytest apps/factoids/tests/test_models.py::TestFactoidModel  # Single class
uv run pytest apps/factoids/tests/test_models.py::TestFactoidModel::test_creation  # Single test
uv run pytest -k "test_rate_limit"                         # All tests matching pattern
uv run pytest -v                                           # Verbose output
```

### Backend Commands (Direct)

```bash
cd backend
uv sync --extra dev        # Install dependencies
uv run python manage.py runserver
uv run python manage.py migrate
uv run python manage.py seed_factoids
uv run pytest             # Run tests
uv run ruff check .        # Lint code
```

### Frontend Commands (Direct)

```bash
cd frontend
npm install
npm run dev                # Development with Turbopack
npm run build              # Production build with Turbopack
npm run start              # Production server
npm run lint               # ESLint
npm run lint:fix           # Fix ESLint issues
npm run format             # Format with Prettier
npm run format:check       # Check Prettier formatting
```

## Architecture Patterns

### Backend: Service Layer Design
The backend follows a clear separation of concerns:
- **API layer** (`apps/factoids/api.py`): DRF ViewSets handle HTTP concerns (auth, serialization, rate limits)
- **Service layer** (`apps/factoids/services/`): Business logic isolated from HTTP details
  - `generator.py`: Core generation workflow with observability hooks (PostHog, Braintrust, LangSmith)
  - `openrouter.py`: LangChain integration for model calls
- **Models** (`apps/factoids/models.py`): Data persistence with UUID primary keys
- **Core services** (`apps/core/services/`): Shared infrastructure
  - `rate_limits.py`: Redis-backed rate limiting with in-memory fallback
  - `cost_guard.py`: Per-profile budget enforcement
  - `api_keys.py`: API key management for authenticated access

### Generation Flow Architecture
```
1. API receives request → client_hash derived from IP + UA
2. Rate limiter check (Redis or in-memory fallback)
3. Cost guard validation (profile budget enforcement)
4. Prompt construction from recent factoids (variety heuristic)
5. LangChain → OpenRouter call with callbacks for:
   - PostHog: $ai_generation events with metadata
   - Braintrust: Structured tracing for evals
   - LangSmith: Optional debugging traces
   - Langfuse: Optional session tracking and prompt management
6. Persist Factoid + GenerationRequest models
7. Return JSON or stream SSE events (status/factoid/error)
```

### Frontend: Server Components + Streaming
- `src/app/page.tsx`: RSC fetches initial data server-side (no ISR, always fresh)
- `src/lib/api.ts`: Centralized fetch wrapper with no-cache policy
- `src/components/generate-factoid-form.tsx`: Client component using EventSource for SSE
- Streaming fallback: Falls back to sync POST if EventSource unavailable

### Key Backend Files
- `factoids_project/settings/`: Layered config (base, local, production) via pydantic-settings
- `apps/factoids/api.py`: DRF ViewSets for REST + SSE endpoints
- `apps/factoids/services/generator.py`: Core generation orchestration
- `apps/factoids/prompts.py`: Prompt templates and construction logic
- `apps/core/services/rate_limits.py`: Distributed rate limiting
- `apps/chat/services/factoid_agent.py`: Conversational agent with tool use

### Observability Integration
The codebase integrates four observability platforms via callback handlers:
- **PostHog**: Client/server analytics, `$ai_generation` events, user tracking
- **Braintrust**: LLM evaluation traces, structured experiment tracking
- **LangSmith**: Optional LangChain debugging traces
- **Langfuse**: Open-source LLM observability, session tracking, prompt management

All four are optional and controlled via environment variables. See `apps/core/posthog.py`, `apps/core/braintrust.py`, `apps/core/langsmith.py`, `apps/core/langfuse.py`. For comprehensive observability documentation, see `LLM_OBSERVABILITY.md`.

### Environment Variables
Backend requires: `OPENROUTER_API_KEY`, `DATABASE_URL`, `DJANGO_SECRET_KEY`
Optional observability: `POSTHOG_PROJECT_API_KEY`, `BRAINTRUST_API_KEY`, `LANGSMITH_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`
Optional infrastructure: `REDIS_URL` (rate limiting), `STRIPE_SECRET_KEY` (payments)
Frontend requires: `NEXT_PUBLIC_FACTOIDS_API_BASE` (defaults to localhost:8000)

## Testing Strategy

- Backend: pytest with Django test database
- Frontend: ESLint for now (component tests planned)
- Integration: Node.js scripts that hit deployed endpoints
- Rate limiting: Dedicated test scripts for validation

## Code Conventions

- **Backend**: Django patterns with DRF, ruff formatting (line length 100), type hints required
- **Frontend**: Next.js 15 App Router, TypeScript, Tailwind CSS, ESLint + Prettier
- **API design**: RESTful under `/api/factoids/`, SSE streaming for generation progress
- **Models**: UUID primary keys, JSONField for metadata, `created_at`/`updated_at` timestamps
- **Services**: Three-layer architecture (API → Service → Model), business logic stays in services
- **Error handling**: Custom exceptions for rate limits/budget (see `generator.py`)
- **Testing**: pytest for backend, request/response mocking with Django test client

## Important Development Notes

### Rate Limiting Behavior
- Uses Redis if `REDIS_URL` set, otherwise in-memory fallback (resets on restart)
- Client identity derived from IP + User-Agent (see `client_hash` in `api.py`)
- Limits configured per profile in `settings.RATE_LIMITS` dict
- Anonymous users default to strict limits; API keys get higher quotas

### Cost Guard System
- Per-profile daily budgets enforced before generation (default $1/day for anonymous)
- Tracks spend in `GenerationRequest.cost` field from OpenRouter responses
- Budget resets daily, checked in `generator.generate_factoid()`
- Can be overridden per-request or disabled for testing

### Prompt Engineering
- `build_factoid_generation_prompt()` in `apps/factoids/prompts.py` samples recent factoids
- Includes variety heuristic to avoid repetition (currently 10 recent factoids as negative examples)
- Structured output via Pydantic schema ensures consistent JSON responses

## Local Development Setup

1. `make install` to install both backend and frontend dependencies
2. `make migrate-backend` to set up the SQLite database
3. Copy `backend/.env.example` to `backend/.env` and add OpenRouter API key
4. `make run` to start both servers (backend on :8000, frontend on :3000)
5. Optionally `make seed-backend` for sample data

The frontend automatically connects to `http://localhost:8000/api/factoids` by default.