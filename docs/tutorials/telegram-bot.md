---
permalink: /tutorials/telegram-bot.html
layout: default
title: Telegram Bot Integration
---
# Tutorial: Telegram Bot with Vant

> Control your Vant brain from anywhere using a Telegram bot

## What You'll Build

A Telegram bot that lets you:
- Check Vant status and health
- Query your brain memory
- Trigger brain sync with GitHub
- Get notified of events

## Prerequisites

1. A Telegram bot token from [@BotFather](https://t.me/BotFather)
2. Vant installed and configured
3. GitHub token with repository access

## Step 1: Create Your Bot

1. Open Telegram and chat with [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Follow prompts to name your bot
4. Copy the bot token (looks like `123456789:ABCdef...`)

## Step 2: Configure Vant

```bash
# Set your Telegram bot token
export TELEGRAM_BOT_TOKEN=123456789:ABCdef...

# Or add to config.ini
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
```

## Step 3: Start the Bot

```bash
# Using CLI
vant bot

# Or directly
node bin/bot.js

# With custom token
TELEGRAM_BOT_TOKEN=xxx vant bot
```

You should see:
```
🤖 Telegram bot started!
Commands:
  /start   - Welcome message
  /status  - Show VANT status
  /brain   - Show brain version
  /health  - Run health check
  /sync    - Trigger brain sync
```

## Step 4: Test Your Bot

Open Telegram and search for your bot's username. Try these commands:

### /start
```
🤖 Welcome to Vant Bot!

I help you manage your AI brain from Telegram.

Commands:
/status - Check system status
/brain  - Show brain info
/health - Run diagnostics
/sync   - Sync with GitHub
/help   - Show all commands
```

### /status
```
📊 Vant Status

Version: 0.8.4
Branch: main
Last Sync: 2 hours ago
Brain Files: 19
Lock Status: Available
```

### /brain
```
🧠 Brain Info

Version: 0.8.4
Succession: trusted
Last Updated: Today at 14:30
Files:
  - identity.md ✓
  - ego.md ✓
  - goals.md ✓
  - lessons.md ✓
  ... (15 more)
```

### /health
```
✅ Health Check Passed

✓ Config loaded
✓ GitHub connected
✓ Brain files present
✓ No errors detected
```

### /sync
```
🔄 Syncing with GitHub...

Pulling changes... ✓
Pushing changes... ✓
Brain synced successfully!

Last sync: Just now
```

## Bot Commands Reference

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | Show all commands |
| `/status` | System status |
| `/brain` | Brain info and version |
| `/health` | Run diagnostics |
| `/sync` | Sync with GitHub |
| `/stats` | Session statistics |

## Custom Commands (Advanced)

You can add custom commands to the bot:

```javascript
const telegram = require('./lib/telegram');

// Add custom command
telegram.onCommand('hello', async (msg) => {
    await telegram.send(msg.chat, 'Hello from Vant! 🖐️');
});

// Add message handler
telegram.onMessage(async (msg) => {
    console.log('Received:', msg.text);
    
    if (msg.text.toLowerCase().includes('goals')) {
        const goals = require('./models/public/goals.md');
        await telegram.send(msg.chat, goals);
    }
});

// Start polling
await telegram.startPolling();
```

## Adding Keyboard Buttons

```javascript
// Add inline keyboard
telegram.onCommand('menu', async (msg) => {
    await telegram.send(msg.chat, 'Choose an option:', {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📊 Status', callback_data: 'status' },
                    { text: '🧠 Brain', callback_data: 'brain' }
                ],
                [
                    { text: '🔄 Sync', callback_data: 'sync' },
                    { text: '❓ Help', callback_data: 'help' }
                ]
            ]
        }
    });
});

// Handle callbacks
telegram.onCallback(async (query) => {
    const action = query.data;
    let response;
    
    switch (action) {
        case 'status':
            response = 'System is running normally ✅';
            break;
        case 'brain':
            response = 'Brain version: 0.8.4 🧠';
            break;
    }
    
    await telegram.answerCallback(query.id, response);
});
```

## Bot Security Best Practices

### Keep Your Token Secret

Use environment variables instead of hardcoding:

```bash
# Use environment variable
export TELEGRAM_BOT_TOKEN=xxx

# Never commit to git
echo "TELEGRAM_BOT_TOKEN=xxx" >> .env
```

### Limit Access (Optional)

Restrict bot access to specific users:

```javascript
const ALLOWED_USERS = ['user_id_1', 'user_id_2'];

telegram.onMessage(async (msg) => {
    if (!ALLOWED_USERS.includes(msg.from.id)) {
        await telegram.send(msg.chat, 'Access denied');
        return;
    }
    // Process message
});
```

### Rate Limit Commands

Prevent spam with simple rate limiting:

```javascript
const lastCommand = {};

telegram.onCommand('sync', async (msg) => {
    const userId = msg.from.id;
    const now = Date.now();
    
    if (lastCommand[userId] && now - lastCommand[userId] < 60000) {
        await telegram.send(msg.chat, 'Please wait 60 seconds between syncs');
        return;
    }
    
    lastCommand[userId] = now;
    // Run sync
});
```

## Deployment Options

### Local Development
```bash
npm run dev
# or
node bin/bot.js
```

### Production (with PM2)
```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start bin/bot.js --name vant-bot

# Auto-restart on failure
pm2 save

# View logs
pm2 logs vant-bot
```

### Docker
```bash
# Build
docker build -t vant-bot .

# Run
docker run -d \
  -e TELEGRAM_BOT_TOKEN=xxx \
  -e GITHUB_TOKEN=xxx \
  vant-bot
```

## Troubleshooting

### Bot not responding
1. Check token is correct
2. Verify bot was started: `vant bot`
3. Check logs for errors

### "Bot is not running"
```bash
# Check if process is running
ps aux | grep bot

# Restart
pkill -f "node bin/bot"
vant bot
```

### Polling errors
```bash
# Check network connectivity
curl -I https://api.telegram.org

# Increase timeout if needed
export TELEGRAM_TIMEOUT=30000
```

## Next Steps

- [MCP Server](/vant/guides/mcp.html) - Expose tools via HTTP API
- [Slack/Discord Integration](/vant/guides/operations.html) - Team notifications
- [Multi-Agent](/vant/guides/multi-agent.html) - Coordinate multiple agents