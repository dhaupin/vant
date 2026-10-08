---
version: 0.8.6
permalink: /operations/events
layout: default
title: Events
nav_order: 57
---

# Events

Unified event system: Event emitter, pub/sub, and job queue.

## What

Vant includes an event system with:

- Event - Basic emit/on/once/off
- PubSub - Channel-based pub/sub with rooms
- Queue - Background job processing
- Job - Individual job representation

## Quick Start

Import events:

```javascript
const event = require('./lib/event');
const { Event, PubSub, Queue } = event;
```

## Event

Basic event emitter.

Create an event emitter:

```javascript
const { Event } = require('./lib/event');

const emitter = new Event();
```

### Emit

Emit an event:

```javascript
emitter.emit('task:complete', { id: 123, result: 'done' });
```

Returns the number of handlers called.

### On

Subscribe to events:

```javascript
emitter.on('task:complete', (data) => {
    console.log('Task done:', data.id);
});
```

### Once

One-time handler:

```javascript
emitter.once('task:start', (data) => {
    console.log('Starting:', data.id);
});
```

### Off

Unsubscribe:

```javascript
function myHandler(data) { ... }
emitter.on('event', myHandler);
emitter.off('event', myHandler);
```

### List

List registered events:

```javascript
console.log(emitter.list());
// ['task:complete', 'task:start']
```

### Stats

Get event stats:

```javascript
console.log(emitter.stats());
// { events: 2, uptime: 5000 }
```

## PubSub

Channel-based pub/sub with rooms.

Create a pub/sub:

```javascript
const { PubSub } = require('./lib/event');

const ps = new PubSub();
```

### Subscribe

Subscribe to a channel:

```javascript
ps.subscribe('notifications', (data) => {
    console.log('Got notification:', data);
});
```

### Publish

Publish to a channel:

```javascript
ps.publish('notifications', { message: 'hello' });
```

### Rooms

Join/leave rooms:

```javascript
ps.join('admin-room');
ps.leave('admin-room');
```

### Stats

Get pub/sub stats:

```javascript
console.log(ps.stats());
// { rooms: 1, listeners: 5, uptime: 5000 }
```

## Queue

Background job queue.

Create a queue:

```javascript
const { Queue } = require('./lib/event');

const queue = new Queue({
    concurrency: 3  // max concurrent jobs (default: 1)
});
```

### Enqueue

Add a job - the queue processes it automatically:

```javascript
const job = queue.enqueue('process', { data: 'hello' });
console.log(job.id);    // job id
console.log(job.state); // pending -> completed/failed
```

### Track

The queue runs jobs itself (there is no user `process()` handler API
and the queue is not an EventEmitter - no `.on('job:complete')`).
Track jobs by id and watch stats:

```javascript
const job = queue.get(jobId);  // job state after the fact
console.log(queue.stats());    // { queued, running, total, uptime }
```

### Job States

| State | What |
|-------|------|
| pending | Waiting to run |
| running | Currently executing |
| completed | Finished successfully |
| failed | Finished with error |

### Options

| Option | Default | What |
|--------|---------|------|
| concurrency | 1 | Max concurrent jobs |

---

## Use Cases

### Multi-Agent Communication

Agents communicate via events:

```javascript
const event = require('./lib/event');

// Agent A publishes
event.emit('agent:a:done', { result: 'data' });

// Agent B subscribes
event.on('agent:a:done', (data) => {
    console.log('Got from A:', data.result);
});
```

### Background Processing

Queue slow operations:

```javascript
const { Queue } = require('./lib/event');

const queue = new Queue({ concurrency: 2 });

// Enqueue work - the queue tracks and processes it
const job = queue.enqueue('email', {
    to: 'user@example.com',
    subject: 'Hello',
    body: 'Message'
});

// Check on it later
console.log(queue.get(job.id).state);  // e.g. completed
```

### Notifications

Pub/sub for notifications:

```javascript
const ps = new PubSub();

ps.subscribe('alerts', (alert) => {
    console.log('Alert:', alert.message);
});

// Later
ps.publish('alerts', { message: 'High CPU' });
```

---

## Integration

Events integrate with sandbox:

```javascript
const sandbox = require('./lib/sandbox');

sandbox.on('blocked', (info) => {
    console.log('Blocked:', info.reason);
});
```

---

## Related

- [Runtime](/vant/runtime/runtime) - Programmatic API
- [Sandbox](/vant/security/sandbox) - Execution isolation
- [Multi-Agent](/vant/multi-agent/agents) - Branch and lock