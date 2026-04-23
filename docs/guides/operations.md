---
permalink: /vant/guides/operations.html
layout: default
title: Operations
---
# Operations Runbook

What to run and when - operational commands for Vant.

## Daily Operations

### Health Check

```bash
vant health
```

Expected output:
- ✓ GitHub connection OK
- ✓ Brain loaded
- ✓ Rate limit OK

### Check Rate Limit

```bash
vant rate
```

### Session Summary

```bash
vant summary
```

Shows:
- Memory usage
- Sessions today
- Tokens used

## Troubleshooting

### Vant Won't Start

```bash
# 1. Check logs
vant health

# 2. Verify .env
cat .env

# 3. Verify config
cat config.ini
```

### Brain Won't Load

```bash
# 1. Check GitHub sync
vant sync --pull

# 2. Manual reload
vant load
```

### Rate Limit Hit

```bash
# Check current limit
vant rate

# Wait for reset (GitHub resets hourly)
# Or use different token
```

## Recovery

### Full Recovery

```bash
# 1. Pull latest
vant sync --pull

# 2. Reload brain
vant load

# 3. Verify
vant health
```

### Reset State

```bash
# 1. Backup state
cp states/active/current.json states/backup.json

# 2. Clear state
echo '{}' > states/active/current.json

# 3. Restart
vant start
```

### Reinstall

```bash
# 1. Clear node_modules
rm -rf node_modules

# 2. Install fresh
npm install

# 3. Test
vant health
```

## Maintenance

### Manual Sync

```bash
# Pull only
vant sync --pull

# Push only
vant sync --push

# Full sync
vant sync
```

### Check for Updates

```bash
vant update
```

### View Changelog

```bash
vant changelog
```

## Monitoring

### Watch Mode

```bash
vant watch
```

Monitors GitHub for changes - useful for multi-agent.

### MCP Health

```bash
# If MCP running
curl http://localhost:3456/health
```

### Log Monitoring

```bash
# View last 100 lines
tail -100 .vant.log

# Follow logs
tail -f .vant.log
```

## Emergency Contacts

| Issue | Contact |
|-------|--------|
| GitHub down | GitHub Status |
| Token issues | GitHub Settings |
| Vant bugs | GitHub Issues |

## Common Commands

| Command | Use |
|---------|-----|
| `vant health` | Diagnose issues |
| `vant rate` | Check rate limit |
| `vant sync` | Sync brain |
| `vant load` | Load brain |
| `vant update` | Check updates |
| `vant summary` | Session summary |

See also: [Troubleshooting](./troubleshooting.md), [CLI Reference](../reference/cli.md)