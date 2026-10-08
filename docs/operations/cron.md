---
version: 0.8.6
permalink: /operations/cron
layout: default
title: Cron
nav_order: 56
---

# Cron

Scheduled job execution.

## What

Run tasks on schedule:

- Cron expressions
- One-time jobs
- Interval jobs

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

## One-Time

Run once:

```javascript
cron.once('event-name', (data) => {
    console.log('Fired once');
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

`vant cron` is also a routed command (see `vant cron --help`).

---

## Related

- [Events](/vant/operations/events) - Event system
- [Multi-Agent](/vant/multi-agent/agents) - Agent system