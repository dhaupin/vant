---
version: 0.8.6
permalink: /operations/automation
layout: default
title: Automation
nav_order: 54
---

# Tutorial: Automation Setup

> Set up scheduled automation for your Vant brain

## What You'll Build

Automated workflows:
- Scheduled brain sync
- Periodic brain prune
- Health monitoring

## Scheduling Model

Vant's scheduler (`vant.cron`) is interval-based, not cron-expression
based: `schedule({ id, interval, handler })` with interval in
milliseconds (1000-86400000, 1 day max). For day-of-week style
schedules, use your system crontab and invoke the CLI.

## Basic Setup

### Schedule Sync

```javascript
const cron = require('vant').cron;
const sync = require('./lib/sync');

// Sync brain every hour
cron.schedule({
    id: 'hourly-push',
    interval: 3600000,
    handler: async () => {
        await sync.pushAll();
        console.log('Brain synced');
    }
});
```

### Schedule Prune

Prune is a CLI verb - put it in your system crontab:

```bash
# Prune brain daily at 2am
cd /path/to/vant && vant prune --stale-days 14 --no-fluff
```

(If you must schedule it in-process, `cron.schedule` a handler that
spawns `vant prune`.)

## Event Triggers

### On GitHub Push

Vant polls GitHub rather than receiving webhooks - run the watcher:

```bash
vant watch --interval 30
```

### On Schedule

```javascript
// Daily report
const cron = require('vant').cron;

cron.schedule({
    id: 'daily-report',
    interval: 86400000,
    handler: async () => {
        const summary = await vant.think('What did I work on yesterday?');
        console.log('Summary:', summary);
        // Delivery is yours: the Telegram bot or vant webhooks can carry it
    }
});
```

## Advanced

### Queue Jobs

```javascript
const { Queue } = require('./lib/event');

const queue = new Queue({ concurrency: 2 });

// Enqueue work - the queue runs it itself
const job = queue.enqueue('sync', { priority: 'high' });
console.log(queue.get(job.id).state);  // track completion
```

---

## More

See [Cron](/vant/operations/cron) and [Events](/vant/operations/events) for details.