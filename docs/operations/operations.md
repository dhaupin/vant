---
version: 0.8.6
permalink: /operations.md/operations
layout: default
title: Operations
nav_order: 46
35
---
# Operations

CLI commands for day-to-day work.

---

## Daily Commands

These are what you need:

| Command | Use For |
|---------|---------|
| `vant health` | Check everything working |
| `vant sync` | Pull/push brain |
| `vant load` | Load brain to memory |
| `vant rate` | Check your rate limit |

---

## Health Check

Run at session start:

```bash
vant health
```

Checks:
- GitHub connection
- Config
- Brain files

---

## Sync Brain

Pull + push your changes:

```bash
vant sync
```

Or do manually:

```bash
git pull origin main
# Do work...
git add -A
git commit -m "agent-name: Did X"
git push origin your-branch
```

---

## Notifications

Slack/Discord when brain syncs.

### Setup

Set these env vars:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
DISCORD_WEBHOOK_URL=https://discord.com/api/...
```

When vant syncs, you get notified.

---

## Telegram (Optional)

Control via Telegram bot.

### Commands

| Command | What |
|---------|------|
| `/start` | Welcome |
| `/status` | Vant status |
| `/brain` | Brain version |
| `/health` | Health check |

### Run

```bash
vant bot
```

---

## Logs

Follow what's happening:

```bash
tail -f .vant.log
```

---

## Emergency

| Issue | What to Do |
|-------|-----------|
| GitHub down | Wait |
| Token issues | Check GITHUB_TOKEN |
| Stuck | vant health |

---

## CLI Reference

| Shortcut | Full |
|-----------|------|
| `vant start` | Full startup |
| `vant sync` | Pull/push |
| `vant health` | Check system |
| `vant onboard` | Browse brain |

---

## Related

- [AI Onboarding](ai-onboard) - Getting started
- [Troubleshooting](troubleshooting) - Problem solving