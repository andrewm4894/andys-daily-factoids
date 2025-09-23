# Andy's Daily Factoids – Django Architecture Design

## Goals
- Build an API-first Django backend that powers the Next.js frontend, LangGraph agent, and any future clients.
- Implement LLM orchestration in Python using OpenRouter with robust safety, rate limiting, and cost guardrails.
- Deliver full PostHog (including LLM analytics) integration and prepare hooks for Braintrust evaluations.
- Offer real-time UX via SSE for factoid generation and chat responses (upgrade path to WebSockets if needed).

## Non-Goals
- Migrating existing Firestore data for v1 (start fresh in Postgres; optional backfill later).
- Shipping user authentication in v1 (design for future integration).
- Supporting legacy React SPA; Next.js becomes the primary frontend.

## System Overview
```
[Browser / Next.js Frontend] ←→ [Django REST API + SSE Streams]
                                      │
                                      ├─ Factoid Service (OpenRouter client, generation logic)
                                      ├─ LangGraph Chat Agent Service
                                      ├─ Rate Limiting & Cost Guard (Redis + Postgres)
                                      ├─ PostHog / Braintrust Integrations
                                      ├─ Celery Worker & Beat
                                      └─ Render Postgres + Redis
```

## Backend Architecture
- Django REST Framework for all API endpoints.
- Native Django async views using `StreamingHttpResponse`/ASGIResponse for SSE streaming (upgrade path to Channels/WebSockets documented).
- Celery + Redis for async processing (factoid generation, chat tasks, scheduled jobs).
- Structured logging (`structlog`), PostHog instrumentation, optional Sentry.
- Configuration handled by Pydantic settings classes to centralise environment parsing and validation.

## Environment & Dependency Management
- Python toolchain managed with `uv` (pyproject and lockfile) for reproducible installs.
- Pydantic settings classes load from environment or `.env` for local development; `sample.env` documents variables.
- Separate settings modules (`local`, `production`, later `staging`) import shared base config object.
- Secrets stored in Render environment groups; local development uses `.env` consumed by uv virtual environment activation.

## Frontend Architecture
- Next.js 14 (App Router) with TypeScript.
- API client module wrappers (fetch + React Query/TanStack Query optional) for talking to Django.
- Components/pages: factoid feed, generation dialog, voting interactions with optional feedback form, chat interface with SSE handling.
- PostHog JS for frontend analytics, receiving distinct IDs from backend when available.
- Deployment to Render or Vercel; environment variables for API base URL and PostHog keys.

## API Design
- **Factoids**
  - `GET /api/factoids/` – list factoids with pagination, filters (subject, vote threshold).
  - `POST /api/factoids/generate/` – trigger generation; returns `GenerationRequest` ID.
  - `GET /api/factoids/requests/{id}/` – poll generation status (synchronous fallback).
  - `GET /api/factoids/streams/{id}/` (SSE) – stream progress/completion events.
  - `POST /api/factoids/{uuid}/vote/` – vote up/down (includes client hash dedup).
  - `POST /api/factoids/{uuid}/feedback/` – optional structured text feedback tied to vote/session.
  - `GET /api/models/` – list OpenRouter models + pricing/context info.
- **Chat Agent**
  - `POST /api/chat/sessions/` – create session (returns SSE endpoint URL, session metadata).
  - `POST /api/chat/sessions/{id}/messages/` – send message; triggers LangGraph task and returns ack.
  - `GET /api/chat/sessions/{id}/stream/` (SSE) – stream agent responses/events.
  - `GET /api/chat/sessions/{id}/` – retrieve transcript and metrics.
- **Payments**
  - `POST /api/payments/session/` – create Stripe Checkout session.
  - `POST /api/payments/webhook/` – Stripe webhook.
- **Admin/Monitoring**
  - Health endpoints (`/healthz`, `/livez`).
  - Protected endpoints for cost/rate statistics (optional).
- Auth: API key header for privileged clients; anonymous traffic managed via signed cookies and rate-limits. Future user auth can layer on top.

## Data Model
- `Factoid`, `GenerationRequest`, `VoteAggregate`, `RateLimitSnapshot`, `PaymentSession`, `ModelCache`, `ChatSession`, `ChatMessage`, `EvaluationArtifact` (see PLAN for details).
- `FactoidFeedback` capturing optional user text feedback (FK to `Factoid`, vote context, client hash, timestamps).
- Redis structures:
  - Sorted sets/hash for rate limiting (bucket windows, counts).
  - Token budget tracking per session and global budgets.
  - SSE stream message queues (if needed for delivery integrity).

## Factoid Generation Flow
1. Next.js calls `POST /api/factoids/generate/` with model overrides (optional).
2. Django validates request, enforces rate limit/cost guard (predicts expense using model pricing).
3. Enqueue Celery `generate_factoid` task; respond with request ID.
4. SSE endpoint streams events (`pending`, `running`, `succeeded`, `failed`, token usage, cost).
5. Task uses OpenRouter via `httpx`, applies prompt templates, clamps tokens, sanitizes output.
6. Persist factoid & metadata, log PostHog event (`$ai_generation`), update cost counters.
7. Next.js updates UI via SSE; fallback to polling endpoint if SSE not supported.

### Simplification Plan (Sept 2025)
- Rebuild the factoid generator as a slim LangChain pipeline (`ChatPromptTemplate` → `ChatOpenAI`).
- Target OpenRouter by passing its `base_url` and any required headers directly to the LangChain model.
- Emit PostHog LLM analytics solely via `posthog.ai.langchain.CallbackHandler` callbacks.
- Remove bespoke HTTP clients, stub branches, and defensive parsing — the new flow can assume happy-path operation.
- Treat this as greenfield work; no need to preserve previous service abstractions or backwards compatibility.

## LangGraph Chat Agent
- Graph nodes orchestrated in `apps/chat/langgraph.py`.
  - Retrieve context (`Factoid` search, optional embeddings), build prompt.
  - Invoke OpenRouter (model per session), handle tool calls (future extension).
  - Post-process responses; update cost/token usage, store messages.
  - Log PostHog LLM events + product analytics.
- Rate limits & cost guard enforce per-session and global quotas (tokens, requests).
- SSE streaming for incremental tokens; session state stored in Postgres with Redis cache for fast access.
- Braintrust hooks record transcripts and metadata for later evaluation.

## Rate Limiting & Cost Guards
- Redis-based counters with hierarchical buckets (global, anonymous, API key, chat session).
- Configurable thresholds via settings (`RATE_LIMITS = {"factoids": {...}, "chat": {...}}`).
- Cost guard service calculates expected cost (model price * token estimate) and actual cost (from OpenRouter response) and updates budgets.
- Soft limit: log + notify (PostHog event, optional Slack/email). Hard limit: return 429/402 with messaging pointing to Stripe upsell or API key requirement.
- Daily reset job (Celery beat) recalculates budgets and archives previous day’s stats.
- Layered abuse controls:
  - Signed anonymous session token issued via Next.js frontend; combined with IP/UA hash for client identity.
  - API key authentication (hashed storage) for higher-tier access; quotas configurable per key.
  - Optional hCaptcha/Turnstile challenge before elevating anonymous quotas.
  - Anomaly detection hooks (rate spikes, repeated identical prompts) triggering temporary throttles or alerts.

## PostHog Integration
- Backend: use PostHog Python SDK to emit `$ai_generation` events with prompt/response, model, tokens, cost, latency, request metadata. Tag events by feature (`factoid_generator`, `chat_agent`).
- Frontend: PostHog JS captures page views, CTA interactions; passes distinct ID to backend where possible.
- Align event schemas between frontend/backed; store PostHog keys via environment variables.
- Use PostHog feature flags if we need staged rollouts.

## Braintrust Preparation
- Capture evaluation artifacts in Postgres or S3 (prompt, completion, metadata).
- Provide CLI/management command stub to push artifacts to Braintrust when API key configured.
- Keep code modular so evaluation harness can wrap both factoid generation and chat transcripts.

-## Deployment Blueprint
- `render.yaml` defines backend web (Gunicorn), worker (Celery), beat (Celery beat), and Next.js services; run migrations in postdeploy.
- Host both Django and Next.js on Render for a single-platform deployment; configure build commands (`pip install`, `python manage.py collectstatic`, `next build`).
- Manage configuration via Render environment groups; Next.js uses env vars for API base URL and PostHog key.
- Ensure CORS settings allow the Render-hosted Next.js domain; configure CSRF for future authenticated flows.
- Health checks: `/healthz` (DB/Redis ping), `/livez` (basic up).

## Testing Strategy
- Backend: `pytest-django`, factories for models, service-level tests (OpenRouter client mocked), API tests with rate-limit scenarios, Celery tasks tested in eager mode, SSE endpoints tested via ASGI client.
- LangGraph: unit tests for graph flow using deterministic fixtures and mocked LLM responses.
- Frontend: Jest/Testing Library + Playwright/Cypress for integration, contract tests against mocked API (MSW), SSE client tests.
- End-to-end: run Next.js against local Django in CI; smoke tests hitting Render staging.

## Security Considerations
- HTTPS enforced; secure cookies; CSP and other Django security settings in production.
- Hash client identifiers before storage; rotate API keys; store API secrets securely.
- Sanitize LLM outputs before rendering; limit maximum response size.
- Implement request size/time limits; integrate captcha challenge flow when anonymous usage crosses thresholds.

## Observability
- Structured logs with request ID and correlation IDs across backend/worker.
- Metrics via PostHog; optional Prometheus exporter for backend metrics (requests per minute, latency, errors).
- Alerts on Celery failure queues, spending anomalies, rate-limit breaches.

## Rollout Plan
- Local dev: run Django API, Celery worker, Redis, Next.js dev server.
- Staging deployment on Render + Next.js host; test SSE, rate limits, Stripe integration with test keys.
- Launch: enable production keys, monitor usage/cost dashboards, set up alerts.
- Post-launch backlog: user auth, deeper analytics dashboards, Braintrust integration, possible WebSocket upgrade.

## Open Questions
- Confirm SSE implementation detail: native Django streaming response vs Channels? (lean toward Channels for flexibility).
- Next.js deploy target: Render vs Vercel? (affects environment setup and streaming support).
- Need for embeddings/vector search to enhance LangGraph context retrieval now or later?
- Additional anti-abuse tooling (IP allow/deny lists, hCaptcha) required before public agent launch?
