---
version: 0.8.11
permalink: /guides/network
layout: default
title: Network
nav_order: 25
32
---

# Network

Network layer for external connections (lib/network.js).

## What

The network layer handles HTTP/HTTPS communication:

- Fetch with retries
- Latency tracking
- Exponential backoff
- Circuit breaker
- Domain whitelist
- Response caching

## Quick Start

Import network:

```javascript
const network = require('./lib/network');
```

## Fetch

Make HTTP requests:

```javascript
const response = await network.fetch('https://api.example.com/data');
console.log(response.json);   // parsed JSON
console.log(response.status); // 200
```

### Options

Configure fetch:

```javascript
const response = await network.fetch('https://api.example.com/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'value' }),
    timeout: 30000,
    retries: 3
});
```

## Retry

Automatic retry with backoff:

```javascript
// After failure, retries with exponential backoff
const result = await network.fetchWithRetry('https://api.example.com/data', {
    retries: 3,
    backoff: 1000  // 1s, 2s, 4s
});

if (result.error) {
    console.log(result.code); // "RETRY_EXHAUSTED"
}
```

## Latency

Track API latency:

```javascript
const stats = network.getLatencyStats();
console.log(stats.avg);     // average ms
console.log(stats.min);     // min ms
console.log(stats.max);     // max ms
```

## Online Check

Check if online:

```javascript
const online = await network.isOnline();
console.log(online); // true | false
```

## Domain Restrictions

Whitelist allowed domains:

```javascript
network.setAllowedDomains(['api.github.com', 'api.openai.com']);

const allowed = network.isDomainAllowed('https://api.github.com/user');
console.log(allowed); // true
```

## Circuit Breaker

Network includes circuit breaker:

```javascript
const stats = network.getCircuitStatus();
console.log(stats.state);  // "closed" | "open" | "half-open"
```

After failures, circuit opens to prevent cascade.

## Connection Pool

HTTP agent settings:

```javascript
console.log(network.getPoolStats());
// { size: 5, free: 4 }
```

---

## Configuration

Network options:

```javascript
const network = require('./lib/network');

network.configure({
    timeout: 30000,
    retries: 3,
    backoff: 1000,
    poolSize: 5,
    allowedDomains: []
});
```

---

## Integration

Network integrates with sandbox:

```javascript
const sandbox = require('./lib/sandbox');

const s = sandbox.create({
    allowedDomains: ['api.github.com'],
    canNetwork: true
});

const result = await network.fetch('https://evil.com');
// Blocked by domain whitelist
```

See [Security](security) for details.

---

## See Also

- [Sandbox](sandbox) - Execution isolation
- [Server](server) - HTTP server
- [Security](security) - VAF and encryption