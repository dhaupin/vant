---
version: 0.8.6
permalink: /operations/operations
layout: default
title: Operations
nav_order: 61
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

There is no built-in Slack/Discord/email notifier (lib/notifications.js
does not exist). Vant's real outbound surfaces today:

- **Telegram bot** (below) - status, brain, health, sync via chat
- **Events** - subscribe in-process: `require('./lib/event')`
- **Webhooks** - `vant webhooks add` to register outbound hooks

---

## Telegram (Optional)

Control via Telegram bot.

### Setup

Set your bot token from [@BotFather](https://t.me/BotFather), then run
the bot:

```bash
TELEGRAM_BOT_TOKEN=xxx vant bot
```

### Commands

| Command | What |
|---------|------|
| `/start` | Welcome |
| `/status` | Vant status |
| `/brain` | Brain version |
| `/health` | Health check |
| `/sync` | Trigger brain sync |

### Run

```bash
vant bot
```

---

## Logs

Follow what's happening:

```bash
tail -f vant.log
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

- [Agent Onboarding](/vant/getting-started/agent-onboarding) - Getting started
- [Troubleshooting](/vant/advanced/troubleshooting) - Problem solving