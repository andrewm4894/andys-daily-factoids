# GitHub Workflows

This directory contains GitHub Actions workflows for automated testing, deployment, and code quality checks.

## Workflows

### 1. Test Suite (`test.yml`)
Runs the complete test suite including:
- Frontend tests with React Testing Library
- Backend validation for Netlify Functions
- Integration tests
- Coverage reporting

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Matrix Strategy:**
- Tests on Node.js 18.x and 20.x
- Ensures compatibility across Node versions

### 2. Deploy (`deploy.yml`)
Automated deployment to Netlify:
- Runs tests before deployment
- Builds the frontend application
- Validates Netlify Functions
- Deploys to production

**Triggers:**
- Push to `main` branch
- Manual workflow dispatch

**Requirements:**
- `NETLIFY_AUTH_TOKEN` secret
- `NETLIFY_SITE_ID` secret

### 3. Code Quality (`code-quality.yml`)
Comprehensive code quality checks:
- ESLint validation
- Code formatting checks
- Security audits
- Dependency checks
- Netlify Functions validation

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

## Setup

### Required Secrets
Add these secrets to your GitHub repository settings:

1. **NETLIFY_AUTH_TOKEN**: Your Netlify personal access token
2. **NETLIFY_SITE_ID**: Your Netlify site ID

### Optional Secrets
- **CODECOV_TOKEN**: For coverage reporting (if using Codecov)

## Local Development

To run the same checks locally:

```bash
# Run all tests
make test

# Run linting
make lint

# Run frontend tests
cd frontend && npm test

# Validate Netlify Functions
for file in netlify/functions/*.js; do
  node -c "$file"
done
```

## Workflow Status

Workflows will show status badges on:
- Pull requests (must pass before merging)
- Repository main page
- Commit history

## Troubleshooting

### Common Issues

1. **Test failures**: Check the Actions tab for detailed logs
2. **Deployment failures**: Verify Netlify secrets are set correctly
3. **Linting errors**: Run `npm run lint --fix` locally
4. **Node version issues**: Ensure local Node version matches workflow

### Getting Help

- Check the Actions tab in GitHub for detailed logs
- Review the workflow files in this directory
- Ensure all required secrets are configured
