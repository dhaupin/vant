---
permalink: /guides/operations.html
layout: default
title: Operations
---
# Operations Runbook

> What to run and when - operational commands for Vant.

## Notifications

Vant supports Slack and Discord webhooks for brain sync and alerts.

### Environment

Configure webhook URLs:

```bash
# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx
```

### Send Notification

Send a message to Slack or Discord:

```javascript
const notifications = require('./lib/notifications');

// Slack
await notifications.slack('Brain synced!', { 
  channel: '#alerts',
  username: 'VANT'
});

// Discord
await notifications.discord('Brain synced!');
```

### Auto-Notify on Sync

Automatically notify when brain syncs:

```javascript
// In your sync script
await vant.sync();
await notifications.discord('Brain updated');
```

## Daily Operations

Run these commands day-to-day.

### Health Check

Check Vant health status:

```bash
vant health
```

Expected output:
- ✓ GitHub connection OK
- ✓ Brain loaded
- ✓ Rate limit OK

### Check Rate Limit

View remaining API quota:

```bash
vant rate
```

### Session Summary

Get session statistics:

```bash
vant summary
```

Shows:
- Memory usage
- Sessions today
- Tokens used

## Troubleshooting

Fix common issues.

### Vant Won't Start

Debug startup failures:

```bash
# 1. Check logs
vant health

# 2. Verify .env
cat .env

# 3. Verify config
cat config.ini
```

### Brain Won't Load

Debug load failures:

```bash
# 1. Check GitHub sync
vant sync --pull

# 2. Manual reload
vant load
```

### Rate Limit Hit

Handle API quota exceeded:

```bash
# Check current limit
vant rate

# Wait for reset (GitHub resets hourly)
# Or use different token
```

## Recovery

Restore from failures.

### Full Recovery

Run full recovery sequence:

```bash
# 1. Pull latest
vant sync --pull

# 2. Reload brain
vant load

# 3. Verify
vant health
```

### Reset State

Clear state and restart:

```bash
# 1. Backup state
cp states/active/current.json states/backup.json

# 2. Clear state
echo '{}' > states/active/current.json

# 3. Restart
vant start
```

### Reinstall

Clean reinstall of Vant:

```bash
# 1. Clear node_modules
rm -rf node_modules

# 2. Install fresh
npm install

# 3. Test
vant health
```

## Maintenance

Keep Vant running smoothly.

### Manual Sync

Sync brain with GitHub:

```bash
# Pull only
vant sync --pull

# Push only
vant sync --push

# Full sync
vant sync
```

### Check for Updates

Check for updates:

```bash
vant update
```

### View Changelog
View the changelog.

```bash
vant changelog
```

## Monitoring
Tracking Vant health and activity.

### Watch Mode
Watch for changes.

```bash
vant watch
```

Monitors GitHub for changes - useful for multi-agent.

### MCP Health
MCP server functionality.

```bash
# If MCP running
curl http://localhost:3456/health
```

### Log Monitoring
Logging configuration.

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

## Telegram Bot

Control Vant via Telegram - brain queries and commands.

### Running Bot
Run the bot in production.

```bash
export TELEGRAM_BOT_TOKEN=your_bot_token
vant bot
```

### Commands

| Command | What |
|--------|------|
| `/start` | Welcome + status |
| `/status` | Vant status |
| `/brain` | Brain version |
| `/health` | Health check |
| `/sync` | Trigger sync |

### Custom Commands
Add custom commands.

```javascript
const telegram = require('./lib/telegram');

telegram.onCommand('status', async (msg) => {
    await telegram.send(msg.chat, 'VANT is running');
});

await telegram.startPolling();
```

## Common Commands

| Command | Use |
|---------|-----|
| `vant health` | Diagnose issues |
| `vant rate` | Check rate limit |
| `vant sync` | Sync brain |
| `vant load` | Load brain |
| `vant update` | Check updates |
| `vant summary` | Session summary |

See also: [Troubleshooting](/vant/guides/troubleshooting.html), [CLI Reference](/vant/reference/cli.html)