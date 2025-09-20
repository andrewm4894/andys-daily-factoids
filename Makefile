.PHONY: install install-frontend local factoid test test-backend test-frontend test-rate-limit lint lint-backend lint-frontend

install:
	npm install

install-frontend:
	cd ./frontend && npm install

local:
	@bash -lc 'set -a; source frontend/.env; export REACT_APP_API_BASE_URL=http://localhost:8888; set +a; netlify dev --dir frontend --command "npm start --prefix frontend"'

factoid:
	node scripts/generateFactoid.mjs

test:
	@echo "Running all tests..."
	$(MAKE) test-backend
	$(MAKE) test-frontend
	$(MAKE) test-integration
	$(MAKE) test-rate-limit

test-backend:
	@echo "Testing backend functions..."
	node tests/backend/simpleRateLimit.test.mjs

test-frontend:
	@echo "Testing frontend components..."
	cd ./frontend && npm test -- --watchAll=false

test-integration:
	@echo "Testing integration..."
	node tests/integration/rateLimitIntegration.test.mjs

test-rate-limit:
	@echo "Testing rate limit functionality..."
	node scripts/testRateLimit.mjs

lint:
	@echo "Running all linting..."
	$(MAKE) lint-backend
	$(MAKE) lint-frontend

lint-backend:
	@echo "Linting backend files..."
	npm run lint

lint-frontend:
	@echo "Linting frontend files..."
	cd ./frontend && npm run lint
