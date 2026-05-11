---
version: 0.8.11
permalink: /tutorials/automation
layout: default
title: Automation
nav_order: 20
---

# Tutorial: Automation Setup

> Set up scheduled automation for your Vant brain

## What You'll Build

Automated workflows:
- Scheduled brain sync
- Auto-commit on changes
- Periodic brain prune
- Health monitoring

## Cron Syntax

Vant uses cron for scheduling:

| Field | Values |
|-------|--------|
| minute | 0-59 |
| hour | 0-23 |
| day | 1-31 |
| month | 1-12 |
| weekday | 0-6 |

```bash
# Every hour
0 * * * *

# Every day at midnight
0 0 * * *

# Every Monday at 9am
0 9 * * 1
```

## Basic Setup

### Schedule Sync

```javascript
const cron = require('./lib/cron');
const vant = require('./lib/vant');

// Sync brain every hour
cron.cron('0 * * * *', async () => {
    await vant.sync.push();
    console.log('Brain synced');
});
```

### Schedule Prune

```javascript
// Prune brain daily at 2am
cron.cron('0 2 * * *', async () => {
    await vant.prune({ keep: 20 });
    console.log('Brain pruned');
});
```

## Event Triggers

### On Push

```javascript
// Trigger on GitHub push
app.post('/webhook', async (req, res) => {
    const { commits } = req.body;
    
    for (const commit of commits) {
        await vant.learn('commits/' + commit.id, commit.message);
    }
    
    res.json({ synced: commits.length });
});
```

### On Schedule

```javascript
// Daily report
cron.cron('0 9 * * *', async () => {
    const summary = await vant.think('What did I work on yesterday?');
    
    await notify.discord('Daily Summary: ' + summary.insights);
});
```

## Advanced

### Queue Jobs

```javascript
const queue = require('./lib/events').Queue;

// Add to queue
await queue.add('sync', { priority: 'high' });

// Process queue
queue.process('sync', async (job) => {
    await vant.sync.push();
    return { synced: true };
});
```

---

## More

See [Cron](/guides/cron) and [Events](/guides/events) for details.