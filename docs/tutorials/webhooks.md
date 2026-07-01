---
version: 0.8.6
permalink: /tutorials/webhooks
layout: default
title: Webhooks
nav_order: 32
---

# Tutorial: Webhook Automation

> 10-minute tutorial to automate Vant with webhooks

## What You'll Build

Webhook handlers that trigger Vant actions:
- GitHub webhooks → sync brain
- Scheduled webhooks → brain prune
- Custom webhooks → agent actions

## Why Webhooks?

- Automate sync on GitHub push
- Schedule brain cleanup
- Trigger agent actions from external tools

## GitHub Webhooks

### Setup

1. Go to GitHub repo → Settings → Webhooks
2. Add webhook:
   - Payload URL: `https://your-domain.com/webhook`
   - Events: Push

### Handler

```javascript
const vant = require('vant');

app.post('/webhook', async (req, res) => {
    const { action, branch } = req.body;
    
    if (action === 'push') {
        // Sync brain on push (via network module)
        const { sync } = require('vant/lib/network');
        await sync({ direction: 'pull' });
        console.log('Synced brain');
    }
    
    res.json({ success: true });
});
```

## Scheduled Webhooks

Use cron:

```javascript
const cron = require('vant').cron;

// Daily prune at midnight
cron.cron('0 0 * * *', async () => {
    await vant.prune({ keep: 10 });
    console.log('Pruned brain');
});

// Hourly sync (via network)
const { sync } = require('vant/lib/network');
cron.cron('0 * * * *', async () => {
    await sync({ direction: 'push' });
    console.log('Synced to GitHub');
});
```

## Custom Webhooks

### Trigger Agent Action

```javascript
const vant = require('vant');
const { sync } = require('vant/lib/network');
const { commit } = require('vant/lib/branch');

app.post('/webhook/trigger', async (req, res) => {
    const { action, params } = req.body;
    
    switch (action) {
        case 'learn':
            await vant.learn(params.key, params.content);
            break;
        case 'search':
            const results = await vant.think(params.query);
            return res.json(results);
        case 'commit':
            await commit('MyAgent', params.message);
            break;
        case 'sync':
            await sync({ direction: 'push' });
            break;
    }
    
    res.json({ success: true });
});
```

### Usage

```bash
# Learn something
curl -X POST https://your-domain.com/webhook/trigger \
  -H "Content-Type: application/json" \
  -d '{"action": "learn", "params": {"key": "test", "content": "Learned something!"}}'

# Search brain
curl -X POST https://your-domain.com/webhook/trigger \
  -H "Content-Type: application/json" \
  -d '{"action": "search", "params": {"query": "python"}}'
```

## Security

### Verify GitHub Signature

```javascript
const crypto = require('crypto');

function verifyGitHubSignature(payload, signature) {
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(digest)
    );
}

app.post('/webhook', (req, res) => {
    const signature = req.headers['x-hub-signature-256'];
    
    if (!verifyGitHubSignature(JSON.stringify(req.body), signature)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Process webhook
});
```

### API Key

```javascript
const API_KEY = process.env.WEBHOOK_API_KEY;

app.post('/webhook/trigger', (req, res) => {
    const key = req.headers['x-api-key'];
    
    if (key !== API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    
    // Process request
});
```

---

## Use Cases

### GitHub Push → Sync

```javascript
// On every push, pull latest brain
const { sync } = require('vant/lib/network');
app.post('/webhook/github', async (req, res) => {
    await sync({ direction: 'pull' });
    console.log('Updated brain from GitHub');
});
```

### Linear Issue → Learn

```javascript
// On issue created, learn from it
app.post('/webhook/linear', async (req, res) => {
    const { issue } = req.body;
    await vant.learn('issues/' + issue.id, issue.description);
});
```

### Cron → Prune

```javascript
// Daily brain cleanup
cron.cron('0 0 * * *', async () => {
    await vant.prune({ keep: 20 });
});
```

---

## Related

- [CLI](reference/cli)
- [Sync](operations/sync)
- [Search](advanced/search)