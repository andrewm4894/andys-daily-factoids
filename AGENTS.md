# Repository Guidelines

## Project Structure & Module Organization
- `backend/` hosts the Django project (`factoids_project`) with domain apps in `apps/core`, `apps/factoids`, and `apps/payments`; keep new services inside the closest app to preserve boundaries.
- `frontend/` contains the Next.js App Router under `src/`, with shared UI in `src/components/` and utilities in `src/lib/`.
- `tests/` mirrors runtime code: pytest suites in `tests/backend/`, frontend automation in `tests/frontend/`, and integration probes in `tests/integration/`.
- `scripts/` holds Python and Node helpers that power Make targets; prefer `make <task>` over calling scripts directly.

## Build, Test, and Development Commands
- `make install` aligns Python deps via `uv` and installs frontend packages with npm.
- `make run` starts Django and Next.js dev servers together; use `make local-backend` or `make local-frontend` when iterating on one side.
- `make migrate-backend` applies database migrations; follow with `make seed-backend` to load demo factoids.
- `make test-backend`, `make test-frontend`, and `make test-integration` run pytest, ESLint, and cross-service checks respectively.
- `make lint` runs Ruff plus ESLint; resolve lint violations before opening a PR.

## Coding Style & Naming Conventions
- Python targets 3.10, four-space indentation, Ruff rules `E`, `F`, `I`, and docstring type hints for new functions; prefer Pydantic models for structured payloads.
- TypeScript follows `next/core-web-vitals` linting; keep React components functional and colocate styles with components.
- Use snake_case for Django modules and fields, PascalCase for classes and React components, and kebab-case for CLI or script filenames.

## Testing Guidelines
- Mirror app structure under `tests/backend/` and mark external integrations with pytest markers.
- Frontend changes must pass linting; add Vitest or Playwright suites in `tests/frontend/` when behaviour goes beyond static rendering.
- Extend integration probes in `tests/integration/` whenever rate limiting, payments, or multi-service flows change, and export the same env vars used in production before running them.

## Commit & Pull Request Guidelines
- Write short, imperative commit subjects (≤72 chars) like `Update factoid serializer`; keep descriptions focused on intent and impact.
- PRs should link issues, list manual test steps (`make test-backend`, curl examples), and call out migrations, new configuration, or feature flags.
- Attach screenshots or API traces for UI or HTTP changes and note any follow-up tasks or monitoring needs.

## Security & Configuration Tips
- Copy `backend/.env.example` and `frontend/.env.local` before running generators or integration tests; never commit populated `.env.*` files.
- Store secrets via Render or local environment variables, and rotate keys such as `OPENROUTER_API_KEY` if exposed in logs or scripts.
