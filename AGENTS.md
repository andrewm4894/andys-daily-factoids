# Repository Guidelines

## Project Structure & Module Organization
- `backend/` hosts the Django project (`factoids_project`) and domain apps (`apps/core`, `apps/factoids`, `apps/payments`); add new services within the nearest app to preserve clear boundaries.
- `frontend/` holds the Next.js App Router under `src/` with UI pieces in `src/components/` and shared helpers in `src/lib/`.
- `tests/` mirrors the stack: pytest suites live in `tests/backend/`, rate-limit and smoke automation in `tests/frontend/`, and end-to-end probes in `tests/integration/`.
- `scripts/` collects Node and Python helpers that the Make targets wrap; prefer invoking them through `make`.

## Build, Test, and Development Commands
- `make install` syncs Python deps with `uv` and installs frontend packages via npm.
- `make local-backend` / `make local-frontend` run Django and Next.js dev servers; `make run` launches both.
- `make migrate-backend` applies database migrations, while `make seed-backend` loads sample factoids for demos.
- `make test-backend`, `make test-frontend`, and `make test-integration` cover pytest, ESLint, and integration checks; `make lint` runs Ruff plus ESLint.

## Coding Style & Naming Conventions
- Python targets 3.10, uses Ruff (`line-length = 100`, rules `E`, `F`, `I`) and pytest discovery (`test_*.py`); annotate new functions and prefer Pydantic models for structured payloads.
- Next.js code uses TypeScript with `next/core-web-vitals` linting; keep React components functional and name files in PascalCase (`rate-limit-banner.tsx` renders `RateLimitBanner`).
- Use snake_case for Django modules and fields, PascalCase for classes and React components, and kebab-case for CLI scripts.

## Testing Guidelines
- Backend tests rely on `pytest` plus `pytest-django`; mirror app paths under `tests/backend/` and flag external calls with markers.
- Frontend currently lint-gates changes; add Vitest or Playwright suites in `tests/frontend/` when UI flows need coverage.
- Extend `tests/integration/` whenever rate limiting or cross-service behavior changes; export the same env vars you use in production before running them.

## Commit & Pull Request Guidelines
- Git history favors short, imperative subjects (e.g., `Remove obsolete GitHub workflows`); keep the summary ≤72 chars and skip trailing punctuation.
- Reference issues in the description, list manual test steps, and add screenshots or curl traces for UI or API updates.
- PRs should call out new configuration, migrations, or feature flags and note any follow-up tasks.

## Environment & Secrets
- Copy `backend/.env.example` and `frontend/.env.local` to supply keys like `OPENROUTER_API_KEY` and `NEXT_PUBLIC_FACTOIDS_API_BASE` before running generators or integration tests.
- Store sensitive values via Render or local environment variables; `.env.*` files are gitignored—keep them local.
