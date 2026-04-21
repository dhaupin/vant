---
version: 0.8.4
title: Configuration
slug: /configuration
order: 4
---

# Configuration

## .env

| Variable | Description |
|----------|------------|
| `VANT_GITHUB_REPO` | Brain repo (owner/repo) |
| `VANT_GITHUB_TOKEN` | GitHub PAT |
| `VANT_GITHUB_BRANCH` | Branch (default: main) |

## config.ini

```
[github]
repo = dhaupin/vant
branch = main

[paths]
models = models/public

[node]
poll-interval = 30
auto-save = true
```

## settings.ini (Optional)

Personality configuration:
- `HANDLE`, `DISPLAY_NAME`
- `DIRECTNESS`, `CURIOSITY`, `PATIENCE`
- `CURRENT_MOOD`

## mood.ini (Optional)

Behavior overrides:
- `MOOD`, `ENERGY`, `SOCIABILITY`

See also: [CLI Commands](./cli.md)
