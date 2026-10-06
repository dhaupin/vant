---
version: 0.8.6
permalink: /reference/rest-api
layout: default
title: REST API Reference
nav_order: 115
description: The embedder HTTP surface - brain, stream, trust, and market routes over lib/server.js.
---

# REST API Reference

The REST surface is the embedder door: plain HTTP routes on `lib/server.js`,
registered by `lib/api.js`. Every route is a thin proxy to an MCP tool, so a
response is simply that tool's result JSON. The bind is loopback by default.

For the protocol view of all Vant wires (including the MCP tool door and the
crew bus), see [RPC](/vant/advanced/rpc).

## Booting it

```javascript
const api = require('vant/lib/api');

// REST routes only (default port 3456)
await api.startREST({ port: 3456 });

// REST + MCP together (REST 3456, MCP 3457)
await api.startAll();
```

Ports come from `VANT_SERVER_PORT` (default 3456) and `VANT_MCP_PORT`
(default 3457). TLS turns on automatically when `VANT_SERVER_CERT` and
`VANT_SERVER_KEY` are set; `VANT_SERVER_BIND` widens the bind off loopback
deliberately.

## Request pipeline

Every request passes the server's security chain before a route runs:

1. VAF input validation on the URL and the body
2. QoS rate limiting per client; responses carry `X-RateLimit-Limit` and
   `X-RateLimit-Remaining` headers (remaining is a static placeholder today)
3. API key check when `VANT_SERVER_AUTH_REQUIRED=1` (or the
   `server.authRequired` config): the `x-api-key` header must carry a valid
   key
4. Every response carries an `X-Request-Id` header for tracing

---

## Built-in endpoints

Every `lib/server.js` instance serves three built-ins before any registered
route runs:

| Method | Path | What |
|--------|------|------|
| GET | `/tools` | Tool catalog: the vant surface plus the full MCP tool list |
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
