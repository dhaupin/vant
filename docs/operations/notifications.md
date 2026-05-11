---
version: 0.8.6
permalink: /notifications.md/notifications
layout: default
title: Notifications
nav_order: 45
description: Configuring notification channels - Slack, Discord, Email, Pushover, Telegram
---

# Notifications

Vant supports multiple notification channels for alerts and updates.

## Configuration

Set environment variables for each service:

```bash
# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=app-password
FROM_EMAIL=Vant <noreply@vant.dev>

# Pushover
PUSHOVER_KEY=YOUR_USER_KEY
PUSHOVER_TOKEN=YOUR_APP_TOKEN

# Telegram
TELEGRAM_TOKEN=YOUR_BOT_TOKEN
```

## Usage

```javascript
const notifications = require('./lib/notifications');

// Slack
await notifications.slack('Deploy complete!', { 
    channel: '#deploys',
    icon: ':rocket:'
});

// Discord
await notifications.discord('Deploy complete!', {
    embed: { title: 'Deploy', color: 0x00ff00 }
});

// Email
await notifications.email(
    'user@example.com',
    'Subject',
    'Body text or HTML'
);

// Pushover
await notifications.pushover('Alert!', {
    title: 'Vant',
    priority: 1
});

// Telegram
await notifications.telegram('123456', 'Message');
```

## Broadcast

Send to all configured channels:

```javascript
const { broadcast } = require('./lib/notifications');

await broadcast('Deploy complete!', {
    channels: ['slack', 'discord', 'telegram']
});
```

## Status Updates

```javascript
const { status } = require('./lib/notifications');

await status('running', {
    tools: 20,
    islands: 5,
    uptime: '2h 30m'
});
```

## Options

| Service | Options |
|--------|---------|
| Slack | channel, username, icon, color, attachments |
| Discord | username, avatar, embed, color |
| Email | (HTML support) |
| Pushover | title, priority, sound |
| Telegram | parse_mode, reply_markup |

## Use Cases

### Deployment Alert

```javascript
await broadcast(`Deployed ${version} to ${env}`, {
    channels: ['slack', 'pushover'],
    icon: ':rocket:'
});
```

### Error Alert

```javascript
if (error) {
    await notifications.pushover('Error detected!', {
        priority: 2,  // emergency
        sound: 'siren'
    });
}
```

### Daily Summary

```javascript
const summary = {
    commits: 15,
    failures: 0,
    uptime: process.uptime()
};
await notifications.email('admin@example.com', 'Daily Summary', summary);
```

## See Also

- [CLI Reference](/api/cli)
- [Configuration](/api/configuration)