---
version: 0.8.6
permalink: /operations/cron
layout: default
title: Cron
description: Cron - scheduled jobs inside Vant, their state, and how the scheduler degrades.
nav_order: 56
---

# Cron

Scheduled job execution.

## What

Run tasks on a repeating interval:

- Interval jobs ("every 30s" / 1000..86400000 ms)
- Compute and vectorization schedulers
- Event emitter hooks (on/once/off for bus events)

There is no cron-expression scheduler; for fixed system-time schedules
("daily at midnight"), drive the CLI below from a real crontab entry.

## Schedule

`lib/cron.js` exposes a scheduler backed by interval timers (not cron
expressions). `vant.cron` returns it:

```javascript
const cron = require('vant').cron;

// Interval scheduling: interval is milliseconds (1000 - 86400000, 1 day max)
const id = cron.schedule({
    id: 'hourly-task',
    interval: 3600000,           // every hour
    handler: () => console.log('Hourly task')
});
```

There is no cron-expression parser - schedules are interval-based, and
intervals outside 1s..1day are rejected (VAF-validated).

## Event Hooks

The module also exposes the shared event bus (this is `once('<event>')`,
an EVENT listener - not a scheduler):

```javascript
cron.once('task:completed', (data) => {
    console.log('Fired once when a task completes');
});
```

## Stop

Cancel a scheduled task by id:

```javascript
cron.schedule({ id: 'hourly', interval: 3600000, handler: doWork });
cron.cancel('hourly');
```

## Status

List and inspect tasks:

```javascript
cron.list();            // all scheduled tasks
cron.status('hourly');  // one task's status
```

## Specialized Schedulers

```javascript
cron.scheduleCompute('nightly-embed', code, options);  // compute intervals
cron.scheduleEmbed('reindex', options);                // vectorization
```

## CLI

`vant cron` is also a routed command (see `vant cron --help`):
`list` / `add <spec> <cmd>` / `remove <id>` / `run <id>` / `status`.
Specs are interval-style ("30s", "10m", "2h", or ms integer). Jobs are
scheduler slots in the invoking process - they are not persisted across
restarts; for durable system-time schedules use a real crontab entry.

---

## Related

- [Events](/vant/operations/events) - Event system
- [Multi-Agent](/vant/multi-agent/agents) - Agent system