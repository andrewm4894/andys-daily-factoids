.PHONY: help install install-frontend install-backend install-precommit local local-backend local-frontend migrate-backend seed-backend run factoid test test-backend test-frontend test-rate-limit lint lint-backend lint-frontend precommit precommit-install precommit-run precommit-update smoke-backend-api test-generate-factoid test-braintrust test-braintrust-simple eval eval-structure eval-truthfulness eval-daily eval-install

help: ## Show available make targets
	@awk -F ':.*## ' 'BEGIN {print "Available targets:"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: install-backend install-frontend install-precommit ## Install backend, frontend, and pre-commit dependencies

install-backend: ## Install backend dependencies via uv
	cd backend && uv sync --extra dev

install-frontend: ## Install frontend dependencies
	cd ./frontend && npm install

install-precommit: ## Install pre-commit hooks
	uv tool install pre-commit
	pre-commit install

local: ## Run backend and frontend dev servers (alias for `make run`)
	@$(MAKE) run

local-backend: ## Run Django backend locally using uv
	cd backend && uv run python manage.py runserver

local-frontend: ## Run Next.js frontend locally
	cd frontend && npm run dev

migrate-backend: ## Run Django migrations
	cd backend && uv run python manage.py migrate

seed-backend: ## Seed the backend database with sample factoids
	cd backend && uv run python manage.py seed_factoids

factoid: ## Generate a factoid via script
	node scripts/generateFactoid.mjs

test: ## Run all automated tests
	@echo "Running all tests..."
	$(MAKE) test-backend
	$(MAKE) test-frontend
	$(MAKE) test-integration
	$(MAKE) test-rate-limit

test-backend: ## Run backend unit tests
	@echo "Running Django backend tests..."
	cd backend && uv run pytest

test-frontend: ## Run frontend tests
	@echo "Running frontend tests..."
	cd ./frontend && npm run test

test-integration: ## Run integration tests
	@echo "Testing integration..."
	node tests/integration/rateLimitIntegration.test.mjs

test-rate-limit: ## Run rate limit checks
	@echo "Testing rate limit functionality..."
	node tests/backend/rateLimit.test.mjs

lint: ## Run all linting
	@echo "Running all linting..."
	$(MAKE) lint-backend
	$(MAKE) lint-frontend

lint-backend: ## Lint backend files
	@echo "Linting backend files..."
	cd backend && uv run ruff check .

smoke-backend-api: ## Hit the local factoid generation endpoint for a quick sanity check
	cd backend && uv run python scripts/smoke_generate_factoid.py

smoke-chat-agent: ## Exercise the chat agent web_search tool interactively (quick test suite)
	cd backend && uv run python scripts/chat_agent_examples.py

smoke-chat-agent-search: ## Test examples that should trigger web search
	cd backend && uv run python scripts/chat_agent_examples.py search

smoke-chat-agent-no-search: ## Test examples that should NOT trigger web search
	cd backend && uv run python scripts/chat_agent_examples.py no-search

smoke-chat-agent-edge: ## Test edge case examples for web search behavior
	cd backend && uv run python scripts/chat_agent_examples.py edge

test-generate-factoid: ## Generate a factoid via the service layer (includes PostHog analytics when configured)
	cd backend && uv run python scripts/test_generate_factoid.py

test-braintrust: ## Test Braintrust integration setup and configuration
	cd backend && uv run python scripts/test_braintrust_integration.py

test-braintrust-simple: ## Test simple LangChain call with Braintrust tracing
	cd backend && uv run python scripts/test_braintrust_simple.py

lint-frontend: ## Lint frontend files
	@echo "Linting frontend files..."
	cd ./frontend && npm run lint

run: ## Run backend and frontend dev servers concurrently
	@bash -lc 'trap "kill 0" EXIT; (cd backend && uv run python manage.py runserver) & (cd frontend && npm run dev)'

precommit: ## Run pre-commit hooks on all files (alias for precommit-run)
	@$(MAKE) precommit-run

precommit-install: ## Install pre-commit hooks
	uv tool install pre-commit
	pre-commit install

precommit-run: ## Run pre-commit hooks on all files
	pre-commit run --all-files

precommit-update: ## Update pre-commit hooks to latest versions
	pre-commit autoupdate

# Braintrust Evaluation Commands
eval-install: ## Install eval dependencies (braintrust and autoevals)
	cd backend && uv pip install braintrust autoevals

eval: eval-install ## Run all Braintrust evaluations
	cd backend && uv run python evals/run_evals.py --eval-type all

eval-structure: eval-install ## Test factoid structure parsing only
	cd backend && uv run python evals/run_evals.py --eval-type structure

eval-truthfulness: eval-install ## Test factoid truthfulness with LLM judge
	cd backend && uv run python evals/run_evals.py --eval-type truthfulness

eval-daily: eval-install ## Run daily eval on small random sample (5 topics)
	cd backend && uv run python evals/run_evals.py --daily --sample-size 5
