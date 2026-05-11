---
version: 0.8.11
permalink: /guides/telegram
layout: default
title: Telegram Bot
nav_order: 35
---

# Telegram Bot

Control Vant via Telegram.

## Setup

Get bot token from @BotFather:

```bash
export TELEGRAM_BOT_TOKEN=your-token-here
```

## Start Bot

```bash
vant bot
```

## Commands

| Command | What |
|---------|------|
| /start | Initialize |
| /brain | Get brain status |
| /sync | Sync brain |
| /help | Show help |

## Usage

Message the bot to interact:

```
/brain
/start
/sync
```

---

## API

Control programmatically:

```javascript
const telegram = require('./lib/telegram');

telegram.onMessage((msg) => {
    console.log('From:', msg.from);
    console.log('Text:', msg.text);
});

telegram.sendMessage('chat_id', 'Hello!');
```

---

## Webhooks

Use webhooks instead of polling:

```bash
export TELEGRAM_WEBHOOK=https://your-domain.com/webhook
vant bot --webhook
```

---

## Security

Restrict access:

```javascript
telegram.allow(['user_id_1', 'user_id_2']);
```

---

## See Also

- [CLI](cli) - Command reference
- [Webhooks](webhooks) - Webhook handlers