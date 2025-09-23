# Andy's Daily Factoids – Backend

Django backend for the Next.js + LangGraph migration. Managed with [`uv`](https://github.com/astral-sh/uv).

## Quick Start

```bash
# Install uv if you don't have it yet:
# curl -LsSf https://astral.sh/uv/install.sh | sh

cd backend
uv sync --extra dev
uv run python manage.py migrate
uv run python manage.py runserver
```

This uses the local settings module (`factoids_project.settings.local`). Copy `.env.example` to `.env` and fill in secrets as needed.

## Common Commands

```bash
# Run tests
uv run pytest

# Run formatting/linting (ruff)
uv run ruff check .

# Generate new requirements lockfile
uv lock
```

## Project Layout

- `apps/` – Django apps (`core`, `factoids`, `payments`, `analytics`, `chat`)
- `factoids_project/` – project configuration and settings
- `manage.py` – Django CLI entry point
- `pyproject.toml` – dependencies and tooling managed via uv

Further setup (Celery, Redis, LangGraph, etc.) will come in later phases.
