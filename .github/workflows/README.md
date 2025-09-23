# GitHub Workflows

This directory contains GitHub Actions workflows for automated testing, deployment, and code quality checks for the Django + Next.js architecture.

## Workflows

### 1. Test Suite (`tests.yml`)
Runs the complete test suite including:
- **Frontend Tests**: Next.js application linting and build validation
- **Backend Tests**: Django unit tests with pytest, migrations, and smoke tests
- **Integration Tests**: API endpoint validation against Django backend
- **Legacy Tests**: JavaScript test framework compatibility checks

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Matrix Strategy:**
- Frontend: Node.js 18.x and 20.x
- Backend: Python 3.10, 3.11, and 3.12
- Ensures compatibility across Node and Python versions

### 2. Linting (`lint.yml`)
Comprehensive code quality checks:
- **Frontend Linting**: ESLint validation and formatting checks
- **Backend Linting**: Ruff linting, formatting, and MyPy type checking
- **Security Audits**: npm audit and Python safety checks
- **Dependency Checks**: Outdated package detection for both frontend and backend
- **Secret Detection**: Scans for hardcoded secrets in Python code

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

### 3. Generate Factoid (`generate-factoid.yml`)
Automated factoid generation:
- Runs daily at 6 AM UTC
- Generates new factoids via Django management command
- Updates the database with fresh content

**Triggers:**
- Scheduled: Daily at 6:00 AM UTC
- Manual workflow dispatch

## Setup

### Required Secrets
Add these secrets to your GitHub repository settings:

1. **OPENAI_API_KEY**: For AI-powered factoid generation
2. **POSTHOG_API_KEY**: For analytics tracking
3. **STRIPE_SECRET_KEY**: For payment processing
4. **DATABASE_URL**: PostgreSQL connection string for production

### Optional Secrets
- **FACTOIDS_API_BASE**: Base URL for API testing (defaults to production)
- **FACTOIDS_API_KEY**: API key for endpoint authentication

## Local Development

To run the same checks locally:

```bash
# Run all tests
make test

# Run all linting
make lint

# Run backend tests only
make test-backend

# Run frontend linting only
make test-frontend

# Run integration tests
make test-integration

# Run backend linting
make lint-backend

# Run frontend linting
make lint-frontend

# Run Django migrations
make migrate-backend

# Generate a factoid locally
make test-generate-factoid
```

## Architecture

This project uses a **Django + Next.js** architecture:

- **Backend**: Django REST API with PostgreSQL database
- **Frontend**: Next.js application with TypeScript
- **Package Management**: uv for Python, npm for Node.js
- **Testing**: pytest for Django, ESLint for Next.js
- **Linting**: ruff + mypy for Python, ESLint for JavaScript

## Workflow Status

Workflows will show status badges on:
- Pull requests (must pass before merging)
- Repository main page
- Commit history

## Troubleshooting

### Common Issues

1. **Backend test failures**: Check Django logs in Actions tab
2. **Frontend build failures**: Verify Node.js version compatibility
3. **Python dependency issues**: Ensure uv is properly configured
4. **Database migration failures**: Check Django settings and database connection
5. **Linting errors**: Run `make lint` locally to see detailed errors

### Getting Help

- Check the Actions tab in GitHub for detailed logs
- Review the workflow files in this directory
- Ensure all required secrets are configured
- Verify local environment matches CI environment (Python 3.11+, Node 18+)
