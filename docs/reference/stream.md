---
version: 0.8.7
permalink: /reference/stream
layout: default
title: Stream API
nav_order: 83
---

# Stream API

Async queues and streaming jobs.

## Functions

| Function | What |
|----------|------|
| `enqueue(job)` | Add to queue |
| `poll()` | Get next job |
| `complete(id)` | Mark done |
| `fail(id, err)` | Mark failed |
| `list()` | All jobs |
| `info(id)` | Job details |
| `peek(queue)` | Peek without dequeue |
| `stats()` | Queue stats |
| `lease(id)` | Lease job |
| `release(id)` | Release lease |
| `watch(queue)` | Watch for changes |
| `unwatch(queue)` | Stop watching |

## Usage

```javascript
const stream = require('vant/lib/stream');

// Enqueue
await stream.enqueue({ type: 'task', data: { x: 1 } });
// → { id: 'job_xxx', status: 'pending' }

// Poll
const job = await stream.poll();
// → { id, type, data, status }

// Lease (for distributed workers)
const leased = await stream.lease(id, 5000);
// → { id, expires }

// Complete
await stream.complete(id);

// Stats
const s = await stream.stats();
// → { pending: 5, processing: 2, completed: 100 }
```

## Job States

| State | Meaning |
|-------|---------|
| `pending` | In queue |
| `processing` | Currently leased |
| `completed` | Done successfully |
| `failed` | Error occurred |