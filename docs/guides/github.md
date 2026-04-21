---
permalink: /github.html
---


---
version: 0.8.4
title: GitHub Integration
slug: /github
order: 17
---

# GitHub Integration

Deep dive on Vant's GitHub integration.

## Overview

Vant uses GitHub as the brain storage and sync backend. Each brain file is a commit.

## Required Setup

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

### Understanding Limits

| Plan | Requests/Hour |
|------|---------------|
| Authenticated | 5,000 |
| Unauthenticated | 60 |

### Managing Limits

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

### Full Sync

```bash
vant sync  # Pull + push
```

### Pull Only

```bash
vant sync --pull  # Get latest
```

### Push Only

```bash
vant sync --push  # Push local changes
```

### Batch Mode

```bash
# Don't auto-push
AUTO_PUSH=false vant run
# Manual push when ready
vant sync --push
```

## Branching Strategy

### Default Branch

```
main - Production brain
```

### Experiment Branches

```
main
├── agent-1-experiment/
├── personality-test/
└── feature-xyz/
```

### Workflow

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

See: [Multi-Agent](./multi-agent.md)

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

## CI/CD Integration

### GitHub Actions

```yaml
name: Sync Brain
on:
  schedule:
    - cron: '*/30 * * * *'
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Sync brain
        run: node bin/sync.js
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

See also: [CLI Reference](../reference/cli.md), [Troubleshooting](./troubleshooting.md)