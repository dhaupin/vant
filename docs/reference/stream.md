---
version: 0.8.6
permalink: /reference/stream
layout: default
title: Stream API
nav_order: 132
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

Stream functions are stream-scoped - the stream name comes first:

```javascript
const stream = require('vant/lib/stream');

// Enqueue a task on a named stream
await stream.enqueue('tasks', { type: 'task', data: { x: 1 } });

// Poll the next job from that stream
const job = await stream.poll('tasks');

// Lease (for distributed workers)
const leased = await stream.lease(id, 5000);

// Complete
await stream.complete(id);

// Stats
const s = await stream.stats();
// → { pending: 5, processing: 2, completed: 100 }
```

Call `stream.init()` first (the module gates ops until initialized).
Also exported: `create`/`deleteStream` (stream lifecycle), `peek`,
`checkLease`, `load`, `info`, `watch(event, callback)`/`unwatch`
(subscribe to stream events), and the multibrain `listStack`/`getStackStreamInfo`/
`getStackStats`.

## Job States

| State | Meaning |
|-------|---------|
| `pending` | In queue |
| `processing` | Currently leased |
| `completed` | Done successfully |
| `failed` | Error occurred |