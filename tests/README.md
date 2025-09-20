# Test Suite for Andy's Daily Factoids

This directory contains comprehensive tests for the rate limiting functionality.

## Test Structure

### Backend Tests (`tests/backend/`)
- **`simpleRateLimit.test.mjs`** - Unit tests for rate limiting logic
  - IP detection and validation
  - Fallback ID generation
  - Hash functions
  - Rate limit configuration

### Frontend Tests (`tests/frontend/`)
- **`useRateLimit.test.js`** - React hook tests
  - Rate limit status fetching
  - Error handling
  - State updates
- **`RateLimitStatus.test.js`** - Component tests
  - UI rendering
  - Status indicators
  - User interactions

### Integration Tests (`tests/integration/`)
- **`rateLimitIntegration.test.mjs`** - End-to-end tests
  - API endpoint testing
  - Real rate limit checks
  - Multiple request handling

## Running Tests

### All Tests
```bash
make test
```

### Individual Test Suites
```bash
# Backend unit tests
make test-backend

# Frontend component tests (requires React Testing Library)
make test-frontend

# Integration tests (requires deployed endpoint)
make test-integration

# Manual rate limit testing
make test-rate-limit
```

## Test Framework

- **Backend**: Custom lightweight test framework (`testFramework.mjs`)
- **Frontend**: Jest + React Testing Library (standard React setup)
- **Integration**: Node.js fetch API with custom assertions

## Test Coverage

### ✅ Backend Tests
- IP address extraction from headers
- IP validation (IPv4/IPv6)
- Fallback ID generation for unknown IPs
- Rate limit configuration validation
- Hash function consistency

### ✅ Frontend Tests
- Rate limit hook functionality
- Component rendering states
- Error handling
- User interactions

### ⚠️ Integration Tests
- **Note**: Requires deployed Netlify functions
- Tests actual API endpoints
- Validates real rate limiting behavior
- Checks multiple request consistency

## Test Results

### Backend Tests: ✅ All Passing (17/17)
- IP Detection: 5/5 tests
- IP Validation: 4/4 tests  
- Fallback ID Generation: 3/3 tests
- Rate Limit Configuration: 2/2 tests
- Hash Functions: 3/3 tests

### Integration Tests: ⚠️ Requires Deployment
- Will pass once rate limiting functions are deployed to Netlify
- Tests actual API behavior and Firebase integration

## Adding New Tests

### Backend Tests
1. Add test functions to `tests/backend/simpleRateLimit.test.mjs`
2. Use the custom test framework (`describe`, `it`, `expect`)
3. Run with `make test-backend`

### Frontend Tests
1. Add test files to `tests/frontend/`
2. Use Jest and React Testing Library
3. Run with `make test-frontend`

### Integration Tests
1. Add test functions to `tests/integration/rateLimitIntegration.test.mjs`
2. Test actual API endpoints
3. Run with `make test-integration`

## Environment Setup

Tests use environment variables from `frontend/.env`:
- `NETLIFY_FUNCTION_URL` - Base URL for Netlify functions
- `FUNCTIONS_API_KEY` - API key for function authentication

Make sure these are set up before running integration tests.
