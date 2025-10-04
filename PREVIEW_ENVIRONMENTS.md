# Render Preview Environments

This project is configured to automatically create preview environments for every pull request to the `main` branch on Render.

## What are Preview Environments?

Preview environments are temporary, isolated deployments of your application that are automatically created for each pull request. They allow you to:

- Test changes in a production-like environment before merging
- Share a working version with stakeholders for feedback
- Verify that frontend and backend work together correctly
- Catch integration issues early in the development process

## How It Works

When you create a pull request to `main`:

1. **Render automatically deploys** both the backend and frontend services
2. **Preview URLs are generated** in the format:
   - Backend: `https://factoids-backend-pr-{number}.onrender.com`
   - Frontend: `https://factoids-frontend-pr-{number}.onrender.com`
3. **Services are linked** - the frontend automatically connects to its paired backend preview
4. **Database is isolated** - each preview gets its own PostgreSQL database
5. **Cron jobs are disabled** - automated tasks don't run in previews to save resources

## Preview Configuration

### Services Included in Previews

✅ **Backend (`factoids-backend`)**
- Full Django API with all endpoints
- Isolated PostgreSQL database
- Migrations run automatically on deployment
- Configured with production settings

✅ **Frontend (`factoids-frontend`)**  
- Complete Next.js application
- Automatically connects to preview backend
- All client-side features enabled

❌ **Cron Jobs (disabled in previews)**
- `factoid-generator` - 30-minute factoid generation
- `daily-eval` - Daily quality evaluation
- These only run in production to conserve resources

### Automatic Service Linking

The frontend automatically discovers the backend URL through Render's service linking:

```yaml
# In render.yaml
envVars:
  - key: RENDER_BACKEND_URL
    fromService:
      type: web
      name: factoids-backend
      property: url
```

The build and start commands then use this to set `NEXT_PUBLIC_FACTOIDS_API_BASE`:

```bash
export NEXT_PUBLIC_FACTOIDS_API_BASE="${RENDER_BACKEND_URL}/api/factoids"
```

### CORS and Domain Configuration

The backend is configured to accept requests from any `.onrender.com` subdomain:

- **ALLOWED_HOSTS**: Includes `.onrender.com` to accept all Render preview domains
- **CORS Configuration**: Uses regex patterns to allow `https://*.onrender.com`

This allows preview frontends to communicate with preview backends without manual configuration.

## Preview Lifecycle

- **Created**: Automatically when a PR is opened or updated
- **Updated**: On every push to the PR branch
- **Expires**: 7 days after the PR is merged or closed (configurable)
- **Stopped**: When the PR is closed/merged (but data persists for 7 days)

## Using Preview Environments

### Accessing Your Preview

1. Open your pull request on GitHub
2. Look for the Render deploy check - it will have a "View deployment" link
3. Click the link to see the deployed preview
4. Or navigate to your Render dashboard to find preview URLs

### Testing in Preview

Preview environments are great for:

- **Manual testing**: Click through the UI to verify changes
- **Integration testing**: Run your test suite against the preview URLs
- **Stakeholder review**: Share the preview URL for feedback
- **Performance testing**: Check behavior under production-like conditions

### Running Tests Against Preview

You can run integration tests against your preview environment:

```bash
# Set the preview URLs as environment variables
export FACTOIDS_API_BASE=https://factoids-backend-pr-123.onrender.com/api/factoids

# Run integration tests
make test-integration

# Or run specific tests
cd tests/integration
node rateLimitIntegration.test.mjs
```

## Environment Variables in Previews

Preview environments inherit most environment variables from production, with these key differences:

### Automatically Set
- `RENDER_BACKEND_URL`: Dynamic URL of the preview backend
- `NEXT_PUBLIC_FACTOIDS_API_BASE`: Constructed from backend URL
- `DATABASE_URL`: Separate PostgreSQL database for each preview
- `DJANGO_ALLOWED_HOSTS`: Includes wildcard for `.onrender.com`
- `DJANGO_CORS_ALLOWED_ORIGINS`: Includes wildcard for preview domains

### Synced from Production
All secrets are automatically synced from production:
- `OPENROUTER_API_KEY`
- `DJANGO_SECRET_KEY`
- `REDIS_URL`
- `BRAINTRUST_API_KEY`

### PostHog Analytics
Preview deployments share the same PostHog instance as production, but you can distinguish them by the source URL in events.

## Costs and Resource Usage

### Compute Costs
- Previews use the same `starter` plan as production services
- Each preview adds 2 services (backend + frontend) to your bill
- Services are spun down when inactive (free tier only)

### Database Costs
- Each preview creates a new PostgreSQL database
- Databases persist for 7 days after PR closure
- Consider cleanup strategy if you have many concurrent PRs

### Optimization Tips
- Close PRs promptly when no longer needed
- Set `previewsExpireAfterDays: 7` (already configured)
- Cron jobs are disabled to save compute credits
- Consider disabling previews for draft PRs if desired

## Troubleshooting

### Frontend Can't Connect to Backend

**Symptom**: CORS errors or connection failures

**Solutions**:
1. Check that `RENDER_BACKEND_URL` is set in frontend service
2. Verify backend is running: visit `https://factoids-backend-pr-{number}.onrender.com/api/factoids/`
3. Check Render logs for backend startup errors
4. Ensure database migrations completed successfully

### Preview URL Not Appearing

**Symptom**: GitHub checks don't show deploy link

**Solutions**:
1. Check Render dashboard for deployment status
2. Look for build errors in Render logs
3. Verify `previewsEnabled: true` in `render.yaml`
4. Ensure you're on a PR to `main` branch

### Database Migration Failures

**Symptom**: Backend fails to start, migration errors in logs

**Solutions**:
1. Check that migrations are compatible with existing data
2. Verify `uv run python manage.py migrate` runs in build command
3. Check for missing environment variables
4. Review migration files for syntax errors

### Build Takes Too Long

**Symptom**: Deployments time out or are very slow

**Solutions**:
1. Check `npm install` cache settings
2. Verify `uv sync --frozen` uses lock file
3. Consider reducing build-time dependencies
4. Check for network issues in Render status page

## Customization Options

### Adjust Preview Expiration

Change how long previews persist after PR closure:

```yaml
previewsExpireAfterDays: 14  # Keep for 2 weeks instead of 7 days
```

### Disable Previews for a Service

If you only want frontend previews:

```yaml
- type: web
  name: factoids-backend
  previewsEnabled: false  # No backend previews
```

### Add Preview-Specific Environment Variables

Override variables specifically for previews:

```yaml
envVars:
  - key: DEBUG
    value: "false"           # Production value
    previewValue: "true"     # Override for previews
```

## Best Practices

1. **Keep PRs Small**: Faster builds, easier review, lower costs
2. **Test Locally First**: Don't rely solely on previews for initial testing  
3. **Close Old PRs**: Clean up to avoid accumulating costs
4. **Review Logs**: Check Render logs if something seems off
5. **Share Preview URLs**: Use them for stakeholder sign-off
6. **Run Integration Tests**: Verify end-to-end functionality in preview

## Further Reading

- [Render Preview Environments Docs](https://render.com/docs/preview-environments)
- [Render Service Previews](https://render.com/docs/service-previews)
- [Render Blueprint Spec](https://render.com/docs/blueprint-spec)
- [Preview Environment Example](https://github.com/render-examples/preview-environment)

## Support

If you encounter issues with preview environments:

1. Check the [Render Dashboard](https://dashboard.render.com) for deployment status
2. Review logs in Render for specific error messages
3. Verify `render.yaml` syntax with [Render's validator](https://dashboard.render.com/select-repo)
4. Contact Render support or check their [community forum](https://community.render.com)
