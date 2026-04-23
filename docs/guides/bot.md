---
permalink: /vant/guides/bot.html
layout: default
title: Telegram Bot
---
# Telegram Bot

Control Vant via Telegram - brain queries and commands.

## Concept

Vant includes a Telegram bot for:
- Brain queries from anywhere
- Remote commands
- Notifications

## Running Bot

```bash
# Set token
export TELEGRAM_BOT_TOKEN=your_bot_token

# Run bot
vant bot
```

## Commands

When running, send these to the bot:

| Command | What |
|--------|------|
| `/start` | Welcome + status |
| `/status` | Vant status |
| `/brain` | Brain version |
| `/health` | Health check |
| `/sync` | Trigger sync |

## Environment

```bash
TELEGRAM_BOT_TOKEN=xxx  # Required from @BotFather
VANT_GITHUB_REPO=owner/repo
VANT_GITHUB_TOKEN=ghp_...
```

## Bot Commands

The bot responds to:

- `/start` - Welcome message + current status
- `/status` - Show Vant running status
- `/brain` - Show brain version
- `/health` - Run health check
- `/sync` - Trigger brain sync

## Development

Use `lib/telegram.js` for custom commands:

```javascript
const telegram = require('./lib/telegram');

// Register command
telegram.onCommand('status', async (msg) => {
    await telegram.send(msg.chat, 'VANT is running');
});

// Register message handler
telegram.onMessage(async (msg) => {
    console.log('Received:', msg.text);
});

// Start polling
await telegram.startPolling();
```

## See Also

- [MCP Server](./mcp.md) - AI tool access
- [Nodes](./nodes.md) - Persistent node
- [Notifications](./operations.md) - Slack/Discord webhooks