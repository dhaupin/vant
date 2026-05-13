---
version: 0.8.11
permalink: /operations/events
layout: default
title: Events
nav_order: 43
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
const { PubSub } = require('./lib/qos').PubSub || require('./lib/event').PubSub;

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
    concurrency: 3,  // max concurrent jobs
    timeout: 30000   // job timeout
});
```

### Enqueue

Add a job:

```javascript
const job = queue.enqueue('process', { data: 'hello' });
console.log(job.id);  // "job_abc123"
console.log(job.state); // "pending"
```

### Process

Define job handler:

```javascript
queue.process('process', async (job) => {
    console.log('Processing:', job.id);
    return { result: 'done' };
});
```

### Events

Listen to job events:

```javascript
queue.on('job:complete', (job) => {
    console.log('Job done:', job.id);
});

queue.on('job:failed', (job) => {
    console.log('Job failed:', job.error);
});
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
| concurrency | 3 | Max concurrent jobs |
| timeout | 30000 | Job timeout (ms) |

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

// Enqueue work
const job = queue.enqueue('email', {
    to: 'user@example.com',
    subject: 'Hello',
    body: 'Message'
});

// Process
queue.process('email', async (job) => {
    await sendEmail(job.data);
});
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

## See Also

- [Runtime]/essential/runtime - Programmatic API
- [Sandbox]/security/sandbox - Execution isolation
- [Multi-Agent](multi-agent) - Branch and lock