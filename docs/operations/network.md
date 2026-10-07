---
version: 0.8.6
permalink: /operations/network
layout: default
title: Network
nav_order: 60
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

Make HTTP requests - `fetch` resolves to the response BODY STRING on
2xx and rejects on non-2xx (there is no `{ json, status }` wrapper):

```javascript
const body = await network.fetch('https://api.example.com/data');
// body is a string; parse JSON yourself or use fetchJson

const data = await network.fetchJson('https://api.example.com/data');
// fetchJson: JSON.parse with a string fallback
```

### Options

Configure fetch:

```javascript
const response = await network.fetch('https://api.example.com/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'value' }),
    timeout: 30000,          // per-request timeout
    cache: true,             // GET responses are cached (default)
    circuit: true,           // route through the circuit breaker (default)
    system: false            // true opts system-initiated calls out of
                             // the per-call sandbox canNetwork gate
});
```

Redirects (3xx + Location) are followed automatically.

## Retry

Retry is a separate export that wraps any function with exponential
backoff (there is no `fetchWithRetry`):

```javascript
const result = await network.retry(
    () => network.fetch('https://api.example.com/data'),
    { retries: 3, backoff: 1000, maxBackoff: 30000 }  // 1s, 2s, 4s...
);
// throws the last error when retries are exhausted
```

## Latency

Track API latency:

```javascript
const stats = network.getLatencyStats();
console.log(stats);  // latency record set by measureLatency()

await network.measureLatency('https://api.example.com');
```

## Online Check

Check if online:

```javascript
const online = await network.checkOnline();
console.log(online); // true | false
```

(`isOnline()` reads the cached flag; `checkOnline()` probes.)

## Domain Restrictions

Whitelist allowed domains:

```javascript
network.setAllowedDomains(['api.github.com', 'api.openai.com']);

const allowed = network.isDomainAllowed('https://api.github.com/user');
console.log(allowed);      // true
console.log(network.getAllowedDomains());
```

## Circuit Breaker

Network routes external calls through a circuit breaker (shared with
QoS):

```javascript
const stats = network.getCircuitStatus();
console.log(stats.state);  // CLOSED | OPEN (time-based recovery)
```

After repeated failures the circuit opens to prevent cascade; it
closes again after the timeout elapses. Internal/reserved addresses
are additionally guarded by `resolveAndCheckIP` (SSRF gate).

---

## Integration

Network integrates with sandbox: when the sandbox denies `canNetwork`,
per-call fetches are refused (system-initiated calls can opt out with
`system: true`). Domain restrictions are enforced inside network.js on
every request plus an IP-resolution SSRF gate:

```javascript
network.setAllowedDomains(['api.github.com']);

await network.fetch('https://evil.com');
// refused by the domain whitelist
```

See [Security](/vant/security/) for details.

---

## Related

- [Sandbox](/vant/security/sandbox) - Execution isolation
- [Server](/vant/runtime/server) - HTTP server
- [Security](/vant/security/) - VAF and encryption