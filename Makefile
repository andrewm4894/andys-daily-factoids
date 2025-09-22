.PHONY: help install install-frontend install-backend local local-backend factoid test test-backend test-frontend test-rate-limit lint lint-backend lint-frontend smoke-backend-api

help: ## Show available make targets
	@awk -F ':.*## ' 'BEGIN {print "Available targets:"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: install-backend install-frontend ## Install backend and frontend dependencies

install-backend: ## Install backend dependencies via uv
	cd backend && uv sync --extra dev

install-frontend: ## Install frontend dependencies
	cd ./frontend && npm install

local: ## Run Netlify dev with local frontend
	@bash -lc 'set -a; source frontend/.env; export REACT_APP_API_BASE_URL=http://localhost:8888; set +a; netlify dev --dir frontend --command "npm start --prefix frontend"'

local-backend: ## Run Django backend locally using uv
	cd backend && uv run python manage.py runserver

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
	@echo "Testing frontend components..."
	cd ./frontend && npm test -- --watchAll=false

test-integration: ## Run integration tests
	@echo "Testing integration..."
	node tests/integration/rateLimitIntegration.test.mjs

test-rate-limit: ## Run rate limit checks
	@echo "Testing rate limit functionality..."
	node scripts/testRateLimit.mjs

lint: ## Run all linting
	@echo "Running all linting..."
	$(MAKE) lint-backend
	$(MAKE) lint-frontend

lint-backend: ## Lint backend files
	@echo "Linting backend files..."
	cd backend && uv run ruff check .

smoke-backend-api: ## Hit the local factoid generation endpoint for a quick sanity check
	cd backend && uv run python scripts/smoke_generate_factoid.py

lint-frontend: ## Lint frontend files
	@echo "Linting frontend files..."
	cd ./frontend && npm run lint
