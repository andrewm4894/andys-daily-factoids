# Andy's Daily Factoids – Migration Plan

## Purpose
- Replace the Netlify SPA + serverless backend with a cohesive Django application deployed on Render.
- Deliver an API-first backend so both the web UI and future clients (agents, chat interfaces) consume the same endpoints.
- Stand up a Next.js (TypeScript) frontend that consumes the Django API, providing a polished user experience.
- Preserve and extend user-facing capabilities (browse, generate, vote, pay-per-generate, future chat agent) while making backend work easier.

## Assumptions
- Start fresh with a Render-managed Postgres database; Firestore migration is optional and deferred.
- Target stack: Python 3.12+, Django 5.x (REST API), Postgres 15, Redis (recommended for rate limits, Celery, LangGraph state).
- Next.js 14+ (App Router) with TypeScript for the frontend; deployed separately (Render, Vercel, or static hosting) and pointed at the Django API.
- Netlify deployment remains live until Django + Next.js versions reach feature parity.
- LLM orchestration (factoids + forthcoming agent) will be Python services integrated with OpenRouter and exposed via the Django API.

## Roles
- Andrew – product owner & primary developer.
- Codex – planning/support (this assistant).

## Milestones
- **M0**: PLAN.md and DESIGN.md approved.
- **M1**: Django project scaffolded, local dev environment + CI green.
- **M2**: Core models and LLM service layer implemented; hourly generation running locally.
- **M3**: Django API endpoints cover browse/generate/vote flows with strong rate limiting and cost guards.
- **M4**: Next.js frontend MVP consuming the API (factoid browsing, generation, voting) with SSE streaming hook-up.
- **M5**: PostHog LLM analytics wired end-to-end; cost guardrails (quotas, alerting) in place.
- **M6**: LangGraph-based chat agent MVP available via API and surfaced in Next.js UI; groundwork for Braintrust evaluation harness.
- **M7**: Render deployment (web, worker, cron/beat) live with Postgres/Redis + coordinated Next.js deployment.
- **M8**: Netlify stack decommissioned, documentation updated, follow-up backlog captured.

## Phase Breakdown
### Phase 0 – Discovery & Setup
- [x] Validate scope, non-goals, and confirm API-first + Next.js frontend approach.
- [x] Inventory secrets (OpenRouter, Stripe, PostHog, future Braintrust) for new environments.
- [x] Agree on default rate-limit thresholds and cost envelopes (anonymous vs API key).
- [x] Plan SSE streaming for real-time generation/chat updates (WebSockets optional later).
- [x] Sign off on PLAN.md and DESIGN.md.

### Phase 1 – Django Backend Bootstrap
- [x] Create Django project (`factoids_project`) and apps (`core`, `factoids`, `payments`, `analytics`, `chat`).
- [x] Manage Python environment with `uv` (pyproject + lockfile) and add core dependencies (`django`, `djangorestframework`, `django-ratelimit`, `psycopg[binary]`, `httpx`, `stripe`, `django-cors-headers`, `whitenoise`, `pytest-django`, `structlog`, `langgraph`, `posthog`, `pydantic`, `dj-database-url`).
- [x] Configure settings split leveraging Pydantic-based config helpers for environment management.
- [ ] Establish lint/test tooling (pre-commit, mypy optional, GitHub Actions workflow).
- [x] Document local setup (Make targets, sample `.env`, seed data).

### Phase 2 – Domain & Services
- [x] Define models: `Factoid`, `GenerationRequest`, `VoteAggregate`, `FactoidFeedback`, `RateLimitSnapshot`, `PaymentSession`, `ModelCache`, `ChatSession`, `ChatMessage`.
- [x] Implement OpenRouter client with model catalogue caching, parameter defaults, price metadata.
- [x] Harden rate limiting (Redis + Postgres audit) and cost guard service with configurable quotas. *(Redis-backed limiter in place; audit dashboard still pending.)*
- [x] Introduce layered abuse protection: signed anonymous session tokens, API key management, captcha hook, anomaly monitoring plan.
- [ ] Build Django admin + staff dashboards for monitoring usage, costs, rate limits.
- [x] Seed fixtures for local testing.

### Phase 3 – Django API Layer
- [x] Expose DRF endpoints (`/api/factoids`, `/api/factoids/generate`, `/api/factoids/{id}/vote`, `/api/models`, `/api/factoids/limits`) with API key + anonymous throttling.
- [x] Extend voting API to optionally accept structured text feedback (`POST /api/factoids/feedback`) and store for analytics/evals.
- [x] Implement native Django SSE endpoints for generation status updates (`/api/factoids/generate/stream/`) using streaming responses; document upgrade path to Channels/WebSockets if needed.
- [ ] Add OpenAPI schema (drf-spectacular) and developer docs.

### Phase 4 – Next.js Frontend Bootstrap
- [x] Scaffold Next.js (TypeScript, App Router) project under `frontend/` with linting configured.
- [x] Implement API client layer (fetch wrappers) with auth headers, error handling, rate-limit messaging.
- [x] Build core pages/components: home feed, factoid cards, generate modal, vote interactions with optional text feedback capture, share/search actions.
 - [x] Integrate SSE client for live generation updates; show spinners/errors gracefully.
- [ ] Add PostHog JS snippet and align event names with backend analytics.

### Phase 5 – Monetisation, Analytics, & Safeguards
- [ ] Integrate Stripe Checkout (session creation, webhook verification, quota updates) on backend; Next.js handles redirect and success/cancel UI.
- [ ] Enable PostHog LLM analytics for backend services and capture frontend usage events; align distinct IDs where possible.
- [ ] Implement cost guard monitors (soft/hard limits) with notifications (email/Slack/PostHog alert) when nearing thresholds; tie guardrails to session/API-key tiers.
- [ ] Prepare Braintrust evaluation hooks (artifact storage, CLI stub) for future rollout.

### Phase 6 – Background Workloads & Scheduling
- [ ] Configure Celery + Redis; move factoid generation to async task (or reusable generator service).
- [x] Introduce management command (`generate_factoid`) to support scheduled hourly generation via Render cron.
- [ ] Ensure rate-limit and cost accounting include scheduled and paid tasks.

### Phase 7 – Chat Agent (LangGraph)
- [ ] Build LangGraph workflow for factoid-based Q&A; persist session/messages in Django models.
- [ ] Expose chat API endpoints and SSE streaming responses; apply rate limiting and cost guard.
- [ ] Surface chat UI in Next.js (chat page, message list, streaming responses, token budget display).
- [ ] Instrument with PostHog LLM analytics and capture evaluation metadata.

### Phase 8 – Deployments & Cutover
- [x] Author `render.yaml` (web service, worker, beat) for Django and Next.js; prepare Dockerfile/build scripts.
- [x] Deploy both backend and frontend on Render to keep a single platform footprint; manage environment variables (API base URL, PostHog key, secrets) via Render environment groups.
- [x] Run migrations, smoke tests, and health checks; set up auto deploy from GitHub.
- [ ] Create staging environments for both backend and frontend with shared secrets.
- [ ] Execute launch checklist, update DNS, disable Netlify deployment once stable.
- [x] Archive legacy assets and update documentation (README, ARCHITECTURE, developer onboarding).

## Dependencies
- Secrets: `OPENROUTER_API_KEY`, `DJANGO_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `POSTHOG_PROJECT_API_KEY`, `POSTHOG_HOST`, optional `POSTHOG_PERSONAL_API_KEY`, future `BRAINTRUST_API_KEY`, Render Postgres/Redis URLs, Next.js env (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_API_BASE_URL`).
- Tooling: Python 3.12, Node 20+, Redis CLI, Docker (optional), Make, Yarn/PNPM/NPM.
- Third-party services: OpenRouter, Stripe, PostHog, future Braintrust.

## Risks & Mitigations
- **LLM cost spikes**: enforce per-endpoint budgets, integrate alerts, require API keys for scripted use.
- **Rate limiting bypass**: combine Redis counters, signed tokens, per-session quotas, anomaly detection via PostHog.
- **Async/task complexity on Render**: prototype Celery + LangGraph early; document scaling constraints; include fallback synchronous path for emergencies.
- **Next.js/Django integration**: ensure robust API client, shared validation, CORS configuration.
- **Stripe webhooks**: verify signatures, log requests, retry policy.
- **PostHog/Braintrust data volume**: configure sampling, redact sensitive data before export.

## Current Status (Sept 22, 2025)
**Phase 8 - Deployments in Progress:**
- ✅ Django backend deployed on Render with PostgreSQL and Redis
- ✅ Render Blueprint configured with backend, frontend, and hourly cron job
- ✅ Environment variables configured (DATABASE_URL, DJANGO_SECRET_KEY, OPENROUTER_API_KEY, etc.)
- ✅ Database migrations added to build process  
- ✅ Legacy Netlify configuration cleaned up
- 🚧 Backend deployment debugging (Pydantic settings, gunicorn, database connection)
- ⏳ Frontend deployment pending backend stability
- ⏳ Cron job testing pending

**Services Created:**
- `factoids-backend` - Django API server
- `factoids-frontend` - Next.js web application  
- `hourly-factoid` - Cron job for automated factoid generation

## Open Questions
- SSE is the default streaming transport; revisit WebSockets/Channels if we need bidirectional features.
- What spend thresholds trigger alerts vs. hard stops for anonymous vs. API-key users?
- Any external partners need dedicated API keys/quotas at launch?

## Success Criteria
- Django API and Next.js frontend deliver feature parity with legacy product and provide a foundation for future agent features.
- Hourly factoid generation + LangGraph agent run reliably with strong rate limiting and spend controls.
- PostHog LLM analytics captures both generation and chat flows; data ready for future Braintrust evals.
- Deployment pipelines for backend and frontend are reproducible; documentation enables new contributors to run and ship the project.
