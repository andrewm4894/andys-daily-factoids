.PHONY: help install install-frontend local factoid test test-backend test-frontend test-rate-limit lint lint-backend lint-frontend

help: ## Show available make targets
	@awk -F ':.*## ' 'BEGIN {print "Available targets:"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install backend dependencies
	npm install

install-frontend: ## Install frontend dependencies
	cd ./frontend && npm install

local: ## Run Netlify dev with local frontend
	@bash -lc 'set -a; source frontend/.env; export REACT_APP_API_BASE_URL=http://localhost:8888; set +a; netlify dev --dir frontend --command "npm start --prefix frontend"'

factoid: ## Generate a factoid via script
	node scripts/generateFactoid.mjs

test: ## Run all automated tests
	@echo "Running all tests..."
	$(MAKE) test-backend
	$(MAKE) test-frontend
	$(MAKE) test-integration
	$(MAKE) test-rate-limit

test-backend: ## Run backend unit tests
	@echo "Testing backend functions..."
	node tests/backend/simpleRateLimit.test.mjs

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
	npm run lint

lint-frontend: ## Lint frontend files
	@echo "Linting frontend files..."
	cd ./frontend && npm run lint
