---
name: render-cli
description: Render CLI commands for managing deployments
---

# Render CLI Skill

Use this skill when managing Render deployments.

**Command:** $ARGUMENTS

## First: Discover Service IDs

Before running commands, list services to get the IDs:

```bash
render services list -o yaml | grep -e 'name:' -e 'id: srv' -e 'id: crn'
```

Use the relevant service ID in the commands below.

## Common Commands

### Check Deploy Status

```bash
render deploys list <SERVICE_ID> -o yaml | head -30
```

### View Logs

```bash
render logs <SERVICE_ID> -o text --tail 100
```

### Trigger Manual Deploy

```bash
render deploys create <SERVICE_ID>
```

### List All Services

```bash
render services list -o yaml
```

### Service Details

```bash
render services show <SERVICE_ID> -o yaml
```

### Restart Service

```bash
render services restart <SERVICE_ID>
```

### Environment Variables

```bash
render services env-vars <SERVICE_ID> -o yaml
```

## Deploy Status Values

- `build_in_progress` - Building the service
- `update_in_progress` - Deploying the build
- `live` - Successfully deployed and serving traffic
- `build_failed` - Build step failed
- `update_failed` - Deploy step failed
- `canceled` - Deploy was canceled

## Quick Status Check

To check if a push triggered a deploy:

```bash
render deploys list <SERVICE_ID> -o yaml | head -20
```

Look for:
- `status:` to see current state
- `commit.message:` to verify correct commit
- `trigger: new_commit` confirms auto-triggered by push
