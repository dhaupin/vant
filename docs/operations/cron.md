---
version: 0.8.11
permalink: /cron.md/cron
layout: default
title: Cron
nav_order: 42
15
---

# Cron

Scheduled job execution.

## What

Run tasks on schedule:

- Cron expressions
- One-time jobs
- Interval jobs

## Schedule

Simple interval:

```javascript
const cron = require('./lib/cron');

cron.every('1h', () => {
    console.log('Hourly task');
});
```

Cron expression:

```javascript
cron.cron('0 * * * *', () => {
    console.log('Every hour');
});
```

## One-Time

Run once:

```javascript
cron.after(60000, () => {
    console.log('Run after 1 minute');
});
```

## Stop

Stop a job:

```javascript
const jobId = cron.every('1h', () => doWork());
cron.stop(jobId);
```

## Status

List jobs:

```javascript
console.log(cron.jobs());
```

---

## See Also

- [Events](events) - Event system
- [Multi-Agent](multi-agent) - Agent system