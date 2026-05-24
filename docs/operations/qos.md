---
version: 0.8.11
permalink: /operations/qos
layout: default
title: QoS
nav_order: 47
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

Limit how often operations can run.

Create a rate limiter:

```javascript
const { RateLimiter } = require('./lib/qos');

const limiter = new RateLimiter({
    windowMs: 60000,  // 1 minute window
    maxPerMinute: 100  // max 100 requests
});

// Check if allowed
const { allowed, remaining } = limiter.isAllowed();
console.log(allowed);    // true | false
console.log(remaining);  // 99

// Consume a request
limiter.consume();
```

### Use with Network

Wrap API calls:

```javascript
const limiter = new RateLimiter({ windowMs: 60000, maxPerMinute: 50 });

async function callAPI() {
    const { allowed, remaining, resetIn } = limiter.isAllowed();
    if (!allowed) {
        await delay(resetIn);  // wait for window reset
        return callAPI();
    }
    
    return fetch('https://api.example.com/data');
}
```

### Options

| Option | Default | What |
|--------|---------|------|
| windowMs | 60000 | Time window (ms) |
| maxPerMinute | 100 | Max requests per window |

## Circuit Breaker

Prevent cascade failures. When failures pile up, the circuit opens.

Create a circuit breaker:

```javascript
const { CircuitBreaker } = require('./lib/qos');

const breaker = new CircuitBreaker({
    failureThreshold: 5,     // open after 5 failures
    successThreshold: 3,    // close after 3 successes
    timeout: 30000          // 30 second timeout
});
```

### States

| State | What |
|-------|------|
| closed | Normal operation |
| open | Failing - reject calls |
| half-open | Testing recovery |

### Execute

Execute through circuit breaker:

```javascript
async function callService() {
    const result = await breaker.execute(() => {
        return fetch('https://api.example.com/data');
    });
    
    if (result.error) {
        console.log(result.code); // "CIRCUIT_OPEN"
    }
    
    return result;
}
```

### Events

Listen to state changes:

```javascript
breaker.onOpen(() => console.log('Circuit opened'));
breaker.onClose(() => console.log('Circuit closed'));
```

### Options

| Option | Default | What |
|--------|---------|------|
| failureThreshold | 5 | Failures before open |
| successThreshold | 3 | Successes to close |
| timeout | 30000 | Operation timeout |

## Bulkhead

Limit concurrent operations.

Create a bulkhead:

```javascript
const { Bulkhead } = require('./lib/qos');

const bulkhead = new Bulkhead({
    maxConcurrent: 5,    // max 5 concurrent
    maxQueue: 10         // max 10 queued
});
```

### Execute

Execute through bulkhead:

```javascript
const result = await bulkhead.execute(async () => {
    return await doHeavyOperation();
});

if (result.error) {
    console.log(result.code); // "BULKHEAD_REJECTED"
}
```

### Options

| Option | Default | What |
|--------|---------|------|
| maxConcurrent | 5 | Max concurrent |
| maxQueue | 10 | Max queued |

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

Use multiple QoS together:

```javascript
const { RateLimiter, CircuitBreaker, Bulkhead } = require('./lib/qos');

const limiter = new RateLimiter({ windowMs: 60000, maxPerMinute: 50 });
const breaker = new CircuitBreaker({ failureThreshold: 5 });
const bulkhead = new Bulkhead({ maxConcurrent: 3 });

async function apiCall(url) {
    // 1. Check rate limit
    if (!limiter.isAllowed().allowed) {
        throw new Error('Rate limited');
    }
    
    // 2. Check circuit
    const result = await breaker.execute(async () => {
        // 3. Check bulkhead
        return await bulkhead.execute(() => fetch(url));
    });
    
    limiter.consume();
    return result;
}
```

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

See [Sandbox](security/sandbox) for details.

---

## Related

- [Sandbox](security/sandbox) - Execution isolation
- [Security](security) - VAF and encryption
- [Network](server) - HTTP server with QoS