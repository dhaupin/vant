---
version: 0.8.11
permalink: /guides/server
layout: default
title: Server Guide
nav_order: 98
51
---
# Server Guide

> AI-first documentation for Vant server

## Quick Start

```bash
# Start server
vant server

# With TLS (production)
vant server --cert /path/to/cert.pem --key /path/to/key.pem

# With authentication
VANT_API_KEY=yourkey vant server
```

## Security Chain

The server implements a layered security chain:

```
Incoming Request
       ↓
    [VAF] ← Input validation
       ↓
    [QoS] ← Rate limiting + concurrency
       ↓
    [Auth] ← API key validation
       ↓
   [Escrow] ← Budget check
       ↓
   Handler
```

### Security Headers

The server adds these security headers to all responses:

- `Content-Security-Policy`: Content security policy
- `X-Content-Type-Options`: nosniff
- `X-Frame-Options`: DENY
- `X-XSS-Protection`: 1; mode=block
- `Strict-Transport-Security`: max-age=31536000
- `Referrer-Policy`: strict-origin-when-cross-origin
- `X-Request-Id`: Unique request ID
- `X-RateLimit-Limit`: Rate limit configuration

### VAF (Input Validation)

Validates all input for injection attacks:

- URL path validation
- Body content validation
- Parameter sanitization

### QoS (Quality of Service)

Unified rate limiting + circuit breaker + concurrency:

- **Rate Limiter**: Per-IP rate limiting (60/min default)
- **Circuit Breaker**: Opens after 5 failures, retries after 60s
- **Bulkhead**: Max 10 concurrent requests

### Auth (Authentication)

API key validation:

- Set `VANT_API_KEY` environment variable
- Pass via `X-API-Key` header

### Escrow (Budget)

Per-request budget tracking:

- Default cost: 10 per request
- Tracks agent spending
- Blocks when budget exceeded

## Environment Variables

| Variable | Description | Default |
|----------|------------|---------|
| `VANT_SERVER_PORT` | Server port | 3456 |
| `VANT_SERVER_BIND` | Bind address | 127.0.0.1 |
| `VANT_SERVER_CERT` | TLS certificate path | - |
| `VANT_SERVER_KEY` | TLS key path | - |
| `VANT_SERVER_INSECURE` | Allow HTTP | false |
| `VANT_SERVER_AUTH_REQUIRED` | Require auth | false |
| `VANT_API_KEY` | API key | - |

## Endpoints

### GET /tools

List available tools.

```bash
curl http://localhost:3456/tools
```

### GET /health

Server health check.

```bash
curl http://localhost:3456/health
```

### POST /call

Call a tool (JSON-RPC).

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{"method": "echo", "params": {"message": "hello"}}'
```

## Programmatic Usage

```javascript
const { Server } = require('vant/lib/server');

const server = new Server({
  port: 3456,
  host: '0.0.0.0',
  cert: '/path/to/cert.pem',
  key: '/path/to/key.pem',
  authRequired: true,
});

server.on('listening', (addr) => {
  console.log(`Server on ${addr.host}:${addr.port}`);
});

await server.listen();
```

## QoS API

```javascript
const { QoS } = require('vant/lib/qos');

const qos = new QoS();

// Check if operation allowed
await qos.check('client-id', 'read');

// Execute with circuit breaker
const result = await qos.execute(async () => {
  return await someOperation();
});

// Get all layer statuses
const status = qos.getLayerStatus();
```

## Rate Limiting

Default: 60 requests per minute per client IP.

To customize:

```javascript
const qos = new QoS({
  maxPerMinute: 120,
  windowMs: 60000
});
```

## Circuit Breaker

Opens after 5 consecutive failures.

```javascript
const qos = new QoS({
  threshold: 5,  // failures before open
  timeout: 60000   // ms before retry
});
```

## Concurrency

Max 10 concurrent requests by default.

```javascript
const qos = new QoS({
  concurrency: 10
});
```