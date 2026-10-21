---
version: 0.8.6
permalink: /reference/rest-api
layout: default
title: Headless Server & REST API
nav_order: 115
description: The headless server - booting, security chain, and every built-in plus registered route, all verified against lib/server.js.
---

# Headless Server & REST API

The headless server is the embedder door: plain HTTP routes on
`lib/server.js`, registered by `lib/api.js`. It is how CI, containers, and
any non-Node client drive Vant. Every registered route is a thin proxy to
an MCP tool, so a response is simply that tool's result JSON - the MCP door
(port 3457) stays the tool catalog; the REST sidecar's own `/tools` is
retired (`410 Gone`, issue #187).

For the protocol view of all Vant wires (MCP tool door, REST, crew bus),
see [RPC](/vant/advanced/rpc).

## Booting it

```bash
# Start the server (CLI)
vant server

# With TLS (production)
vant server --cert /path/to/cert.pem --key /path/to/key.pem
```

Or programmatically:

```javascript
const api = require('vant/lib/api');

// REST routes only (default port 3456)
await api.startREST({ port: 3456 });

// REST + MCP together (REST 3456, MCP 3457)
await api.startAll();
```

The `lib/server.js` class is also directly constructable:

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

## Environment variables

| Variable | Description | Default |
|----------|------------|---------|
| `VANT_SERVER_PORT` | REST port | 3456 |
| `VANT_MCP_PORT` | MCP door port | 3457 |
| `VANT_SERVER_BIND` | Bind address | 127.0.0.1 |
| `VANT_SERVER_CERT` | TLS certificate path | unset |
| `VANT_SERVER_KEY` | TLS key path | unset |
| `VANT_SERVER_INSECURE` | Set to `1` to allow plain HTTP | unset |
| `VANT_SERVER_AUTH_REQUIRED` | Set to `1` to require auth | unset |
| `VANT_AUTH_KEY` | The API key callers must present | unset |

TLS turns on automatically when `VANT_SERVER_CERT` and `VANT_SERVER_KEY`
are both set; `VANT_SERVER_BIND` widens the bind off loopback deliberately.

## Request pipeline

Every request passes the server's security chain before a route runs:

1. **VAF** - input validation on the URL and the body (path traversal,
   injection, size guards)
2. **QoS** - rate limiting plus concurrency: per-client rate limit
   (60/min default), a circuit breaker that opens after 5 consecutive
   failures and retries after 60s, and a bulkhead capping concurrent
   requests at 10. Responses carry `X-RateLimit-Limit` and
   `X-RateLimit-Remaining` headers (remaining is a static placeholder
   today)
3. **API key check** - when `VANT_SERVER_AUTH_REQUIRED=1` (or the
   `server.authRequired` config), the `x-api-key` header must carry a
   valid key. `VANT_AUTH_KEY` is the canonical source;
   `VANT_API_KEY` still works as a deprecated alias (warn-once)
4. **Escrow** - per-request budget tracking; each request costs 10 and
   is blocked when the budget is exhausted
5. Every response carries an `X-Request-Id` header for tracing, plus
   the security headers

Security headers on every response: `Content-Security-Policy: default-src
'self'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`X-XSS-Protection: 1; mode=block`, `Strict-Transport-Security` (on TLS),
`Referrer-Policy: strict-origin-when-cross-origin`.

The QoS knobs are administrable in-process:

```javascript
const { QoS } = require('vant/lib/qos');

const qos = new QoS({
  maxPerMinute: 120,   // rate limit
  threshold: 5,        // circuit breaker: failures before open
  timeout: 60000,      // ms before the breaker retries
  concurrency: 10,     // bulkhead max concurrent
});

await qos.check('client-id', 'read');
await qos.execute(async () => someOperation());
qos.getLayerStatus();
```

---

## Built-in endpoints

Every `lib/server.js` instance serves three built-ins before any registered
route runs:

| Method | Path | What |
|--------|------|------|
| GET | `/tools` | RETIRED (issue #187): `410 Gone` with a pointer to the MCP door's `/tools` - no dashboard-owned parallel tool catalog survives (the MCP door is the API) |
| GET | `/health` | Liveness ping: `{ "status": "ok", "uptime": ... }` |
| POST | `/call` | Execute any tool; accepts the JSON-RPC 2.0 `tools/call` envelope or flat `{ "tool", "args" }` |

```bash
curl http://localhost:3456/health

curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_get_memory",
      "arguments": { "category": "learnings", "filename": "lessons" }
    },
    "id": 1
  }'
```

With the JSON-RPC envelope the response wraps as
`{ "jsonrpc": "2.0", "id": 1, "result": ... }` (or carries `error`);
flat shapes return the tool result directly.

---

## Endpoints

### Brain

| Method | Path | Backs onto | What |
|--------|------|------------|------|
| GET | `/brain` | `brain_state` | Current brain state |
| GET | `/brain/ls` | `brain_list` | List brain files |
| GET | `/brain/:name` | `brain_load` | Load a brain file |
| POST | `/brain/:name` | `brain_save` | Save a brain file |

```bash
curl http://localhost:3456/brain/identity
curl -X POST http://localhost:3456/brain/identity \
  -H "Content-Type: application/json" \
  -d '{"content": "# NAME: Nova"}'
```

A brain load returns `{ id, name, content }` (content truncated at 500
characters); a save returns `{ saved: true, name: "..." }`.

### Streams (work items)

| Method | Path | Backs onto | What |
|--------|------|------------|------|
| GET | `/streams` | `stream_list` | List streams |
| POST | `/streams` | `stream_create` | Create a stream |
| GET | `/streams/:id` | `stream_info` | Stream info |
| POST | `/streams/:id/enqueue` | `stream_enqueue` | Enqueue work |
| POST | `/streams/:id/poll` | `stream_poll` | Poll for work |

### Trust

| Method | Path | Backs onto | What |
|--------|------|------------|------|
| GET | `/trust/score/:entity` | `trust_getScore` | Score for an entity |
| POST | `/trust/record` | `trust_record` | Record a trust event |
| GET | `/trust/leaderboard` | `trust_leaderboard` | Trust leaderboard |

### Market

| Method | Path | Backs onto | What |
|--------|------|------------|------|
| GET | `/market/listings` | `market_search` | Search listings (query params) |
| POST | `/market/list` | `market_list` | List listings |
| POST | `/market/bid` | `market_bid` | Place a bid |
| POST | `/market/trade` | `market_trade` | Execute a trade |
| GET | `/market/stats` | `market_stats` | Market stats |
| GET | `/market/listing/:id` | `market_get` | One listing by id |

---

## Related

- [RPC](/vant/advanced/rpc) - the wire map: MCP door, REST, crew bus
- [MCP Server](/vant/runtime/mcp) - running and securing the tool door
- [CLI Reference](/vant/reference/cli) - the `vant api` utility CLI
- [Docker](/vant/integrations/docker) - containerized deployment of the server
