---
permalink: /guides/github.html
layout: default
title: GitHub Integration
---
# GitHub Integration

Deep dive on Vant's GitHub integration.

## Overview

Vant uses GitHub as the brain storage and sync backend. Each brain file is a commit.

## Required Setup

Set up GitHub for brain storage.

### 1. Create Repository

Create a new GitHub repository:

```bash
# Via GitHub CLI
gh repo create vant-brain --private

# Or via web: https://github.com/new
```

### 2. Generate Token

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (full control) ✓
4. Copy token

### 3. Configure

Set environment variables:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
export GITHUB_REPO=your-username/vant-brain
```

## Token Scopes

| Scope | Required | Description |
|-------|----------|-------------|
| `repo` | Yes | Full repository control |
| `read:user` | No | Read user profile |
| `delete_repo` | No | Delete repository |

> Minimum required: `repo` for private brain storage.

## Rate Limits
Understand rate limits and quotas.

### Understanding Limits

| Plan | Requests/Hour |
|------|---------------|
| Authenticated | 5,000 |
| Unauthenticated | 60 |

### Managing Limits
Handle rate limits.

```bash
# Check current limit
vant rate

# Wait until reset
vant rate reset
```

### Best Practices

| Practice | Description |
|----------|-------------|
| Batch commits | Combine multiple changes into one commit |
| Skip auto-push | Use `AUTO_PUSH=false` for testing |
| Cache brain | Load once, use locally |
| Limit sync frequency | Don't sync every message |

## Sync Strategies
Optimize GitHub sync strategy.

### Full Sync
Push and pull all changes.

```bash
vant sync  # Pull + push
```

### Pull Only
Pull changes without pushing.

```bash
vant sync --pull  # Get latest
```

### Push Only
Push changes without pulling.

```bash
vant sync --push  # Push local changes
```

## Best Practices
Recommended approaches.

### Manual Sync

Always sync manually when ready:

```bash
vant sync --push  # Push local changes
```

> ⚠️ **Don't use cron or auto-sync** - GitHub Terms prohibit using GitHub as a database with automated polling. Sync intentionally when your agent has meaningful updates.

## Branching Strategy
Manage Git branches for brain versions.

### Default Branch
Main production branch.

```
main - Production brain
```

### Experiment Branches
Try changes safely.

```
main
├── agent-1-experiment/
├── personality-test/
└── feature-xyz/
```

### Workflow
Recommended workflow.

```bash
# Create experiment branch
git checkout -b experiment-feature

# Work on branch
# ... make changes ...

# Push branch
git push origin experiment-feature

# Create PR on GitHub for review
# Merge to main when ready
```

Example:

See: [Multi-Agent](/vant/guides/multi-agent.html)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 403 Forbidden | Check token scopes |
| 404 Not Found | Verify GITHUB_REPO |
| Rate limit exceeded | Wait or use different token |
| Merge conflict | Pull latest, resolve manually |

## Security

| Practice | Description |
|----------|-------------|
| Never commit .env | Add to .gitignore |
| Use private repo | Keep brain private |
| Rotate tokens | Refresh periodically |
| Use fine-grained tokens | Restrict to brain repo only |

See also: [CLI Reference](/vant/reference/cli.html), [Troubleshooting](/vant/guides/troubleshooting.html)