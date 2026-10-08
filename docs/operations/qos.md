---
version: 0.8.6
permalink: /operations/qos
layout: default
title: QoS
nav_order: 59
---

# QoS

Quality of Service features: rate limiting, throttling, circuit breaking, and bulkhead isolation.

## What

Vant includes built-in QoS features to protect against:

- Rate limiting - prevent API abuse
- Throttling - control call frequency
- Circuit breaking - fail fast on errors
- Bulkhead isolation - limit concurrency
- Debouncing - coalesce rapid calls

## Quick Start

Import QoS:

```javascript
const { QoS } = require('./lib/qos');
const qos = new QoS();
```

## Rate Limiter

Sliding-window rate limiting per client id.

Create a rate limiter:

```javascript
const { RateLimiter } = require('./lib/qos');

const limiter = new RateLimiter({
    windowMs: 60000,      // 1 minute window
    maxPerMinute: 100     // max requests per window (default: 60)
});

// Check an operation - throws RATE_LIMIT_EXCEEDED when the limit is hit
await limiter.check('client-1', 'read');

// Inspect current settings + unique clients
console.log(limiter.getStatus());
```

`check(clientId, operation)` is async and records the request when
allowed; when the window is full it throws a retryable
`RATE_LIMIT_EXCEEDED` error (and emits `qos:rate-limit`). There is no
boolean `isAllowed()`/`consume()` API. Reset a client with
`limiter.reset(clientId)`.

Defaults come from `VANT_QOS_MAX_PER_MINUTE` (60) and
`VANT_QOS_WINDOW_MS` (60000) when options are omitted.

### Use with Sandbox

The sandbox wires rate limiters for you - read/write quotas become
per-minute `RateLimiter`s:

```javascript
const sandbox = require('./lib/sandbox');

const s = sandbox.create({
    readQuota: 100,   // reads per minute
    writeQuota: 20    // writes per minute
});
```

### Options

| Option | Default | What |
|--------|---------|------|
| windowMs | 60000 | Time window (ms) |
| maxPerMinute | 60 | Max requests per window |

## Circuit Breaker

Prevent cascade failures. When failures pile up, the circuit opens.

Create a circuit breaker:

```javascript
const { CircuitBreaker } = require('./lib/qos');

const breaker = new CircuitBreaker({
    threshold: 5,    // open after 5 failures (default: 5)
    timeout: 60000   // recovery window (default: 60s)
});
```

### States

| State | What |
|-------|------|
| CLOSED | Normal operation |
| OPEN | Failing - calls are refused until the timeout elapses |

After the timeout passes, the circuit closes again and failure counting
restarts. (`mode: 'full'` adds per-provider state with exponential
backoff and optional persistence.)

### Record Outcomes

The breaker does not wrap your function - you record outcomes:

```javascript
const breaker = new CircuitBreaker({ threshold: 5 });

if (breaker.isClosed('api')) {
    try {
        await fetch('https://api.example.com/data');
        breaker.recordSuccess('api');
    } catch (e) {
        breaker.recordFailure('api');  // 5th failure opens the circuit
    }
} else {
    console.log('Circuit open for api');
}
```

Calling a gated operation while open throws a retryable
`SANDBOX_CIRCUIT_OPEN` error.

### Inspect

```javascript
breaker.getState();        // current state + failure count
breaker.getStatus('api');  // per-key status
breaker.reset('api');      // clear failures for one key
```

## Bulkhead

Limit concurrent operations.

Create a bulkhead:

```javascript
const { Bulkhead } = require('./lib/qos');

const bulkhead = new Bulkhead({
    concurrency: 5    // max concurrent (default: 10)
});
```

### Run

Execute through the bulkhead - excess calls queue instead of failing:

```javascript
const result = await bulkhead.run(async () => {
    return await doHeavyOperation();
});
```

There is no `execute()` method or `BULKHEAD_REJECTED` rejection: calls
beyond `concurrency` wait in the queue until a slot frees up.

### Options

| Option | Default | What |
|--------|---------|------|
| concurrency | 10 | Max concurrent |

## Throttler

Control call frequency.

Create a throttler:

```javascript
const { Throttler } = require('./lib/qos');

const throttler = new Throttler({
    limit: 10,     // max 10 calls
    window: 1000   // per 1 second
});
```

### Wrap

Wrap a function:

```javascript
const throttled = throttler.throttle(myFunction);

// Only first 10 calls per second execute
throttled();
throttled();
```

### Stats

Get throttler stats:

```javascript
console.log(throttler.stats());
// { tracked: 5, uptime: 5000 }
```

## Debouncer

Coalesce rapid calls.

Create a debouncer:

```javascript
const { Debouncer } = require('./lib/qos');

const debouncer = new Debouncer({
    wait: 100  // wait 100ms before executing
});
```

### Wrap

Wrap a function:

```javascript
const debounced = debouncer.debounce(myFunction, 150);

// Calls within 150ms get coalesced
debounced(arg1);  // queued
debounced(arg2); // replaced
debounced(arg3);  // replaced - only last runs after 150ms
```

### Cancel

Cancel pending call:

```javascript
debounced.cancel();
```

## Combined Usage

Use multiple QoS primitives together:

```javascript
const { RateLimiter, CircuitBreaker, Bulkhead } = require('./lib/qos');

const limiter = new RateLimiter({ windowMs: 60000, maxPerMinute: 50 });
const breaker = new CircuitBreaker({ threshold: 5 });
const bulkhead = new Bulkhead({ concurrency: 3 });

async function apiCall(url, clientId) {
    // 1. Rate limit (throws when exceeded)
    await limiter.check(clientId, 'api');
    
    // 2. Bulkhead the concurrency, breaker-guard the failures
    if (!breaker.isClosed('api')) throw new Error('Circuit open');
    return bulkhead.run(() => fetch(url));
}
```

The `QoS` facade class combines the three for server pipelines - see
`getLayerStatus()` / `check(clientId, operation)` on it.

## Integration

QoS integrates with sandbox:

```javascript
const sandbox = require('./lib/sandbox');

const s = sandbox.create({
    maxConcurrent: 3,
    readQuota: 100,
    writeQuota: 20
});
```

See [Sandbox](/vant/security/sandbox) for details.

---

## Related

- [Sandbox](/vant/security/sandbox) - Execution isolation
- [Security](/vant/security/) - VAF and encryption
- [Network](/vant/runtime/server) - HTTP server with QoS