---
version: 0.8.6
permalink: /operations/webhooks
layout: default
title: Webhooks
nav_order: 55
---

# Tutorial: Webhook Automation

> 10-minute tutorial to automate Vant with webhooks

## What You'll Build

Two real automation surfaces:
- **Outbound webhooks** - Vant registers and sends hooks (`vant webhooks`)
- **Scheduled jobs** - interval timers via `vant.cron` (brain prune, sync)

There is no inbound webhook receiver for GitHub push events; to sync on
GitHub activity, use `vant watch` (GitHub polling) or the scheduler below.

## Why Webhooks?

- Notify external tools when brain events happen
- Schedule brain cleanup on a timer
- Keep GitHub in sync without manual pushes

## Outbound Webhooks (Vant's)

Vant ships its own webhook system (`bin/webhooks.js` + `lib/webhooks.js`),
serving on port 3467 by default:

```bash
vant webhooks list                 # registered hooks
vant webhooks add <name> <url>     # register a target URL
vant webhooks remove <name>        # unregister
vant webhooks test <name>          # fire a test payload
```

Required env:

```bash
VANT_WEBHOOK_SECRET=xxx   # the route refuses to bind without a secret
VANT_WEBHOOK_PORT=3467    # optional (default 3467)
VANT_WEBHOOK_BIND=127.0.0.1  # default loopback; set deliberately to widen
```

Crew-bus events are also emitted as `webhook:crew.<type>` events you can
subscribe to in-process.

## Scheduled Jobs

Use cron - schedules are interval timers in milliseconds
(1000-86400000), not cron expressions:

```javascript
const cron = require('vant').cron;

// Hourly sync
const sync = require('./lib/sync');
cron.schedule({
    id: 'hourly-push',
    interval: 3600000,
    handler: async () => {
        await sync.pushAll();
        console.log('Synced to GitHub');
    }
});
```

For pruning, use the real prune CLI on a schedule outside the process
(cron tab or your scheduler of choice):

```bash
# Daily prune at 2am (system crontab)
0 2 * * * cd /path/to/vant && vant prune --stale-days 14 --no-fluff
```

## Custom Webhooks

### Trigger Agent Action

```javascript
const vant = require('vant');
const sync = require('./lib/sync');
const { commit } = require('./lib/branch');

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
            await sync.pushAll();
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

### GitHub Push -> Sync

Vant polls GitHub itself - run the watcher rather than a receiver:

```bash
vant watch --interval 30   # poll for changes every 30s
```

### Linear Issue -> Learn

```javascript
// On issue created, learn from it
app.post('/webhook/linear', async (req, res) => {
    const { issue } = req.body;
    await vant.learn('issues/' + issue.id, issue.description);
});
```

### Cron -> Prune

```bash
# Daily brain cleanup (system crontab)
0 2 * * * cd /path/to/vant && vant prune
```

---

## Related

- [CLI](/vant/reference/cli)
- [Sync](/vant/operations/sync)
- [Search](/vant/memory/search)