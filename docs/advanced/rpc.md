---
version: 0.8.6
permalink: /advanced/rpc
layout: default
title: RPC
nav_order: 95
description: The wires Vant speaks - the MCP tool door, the REST layer, and the signed crew bus.
---

# RPC

Vant talks over three HTTP wires. Each has a different job, and all three
default to loopback so nothing is exposed to the network by accident.

| Wire | Lives in | Default port | Job |
|------|----------|--------------|-----|
| MCP tool door | `lib/mcp.js` | 3457 | Agents and clients execute tools: brain reads and writes, search, agent spawn, config, and the rest of the catalog |
| REST layer | `lib/api.js` on `lib/server.js` | 3456 | Embedders call brain, stream, trust, and market endpoints |
| Crew bus | `lib/crew-bus.js` | per node | Node-to-node signed envelopes for federation and agora |

---

## The MCP tool door

The primary door. One endpoint executes every registered tool, so clients
never need a new route per feature.

### Endpoints

| Method | Path | What |
|--------|------|------|
| GET | `/mcp/tools` | List registered tools with input schemas |
| POST | `/mcp/exec` | Execute one tool |

Two legacy aliases are kept on the same server for older clients:
`GET /tools` (tool list) and `GET /health` (liveness). Anything else gets a
404 that echoes the two real endpoints.

### Executing a tool

The exec body accepts both the flat shape and a JSON-RPC-style shape:

```bash
# Flat shape: { tool, args }
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "brain_load", "args": {"name": "identity"}}'

# Same call, JSON-RPC style: { method, params }
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"method": "brain_load", "params": {"name": "identity"}}'
```

Responses are plain JSON: `{"result": ...}` on success, `{"error": "..."}`
on failure. There is no JSON-RPC envelope and no `tools/call` method.

### Authentication and guards

By default the door is open on loopback (local companion posture). Four
boundaries tighten it:

1. `vant config set mcp.requireKey true` (or env `VANT_MCP_REQUIRE_KEY=true`)
   requires `x-api-key` or `Authorization: Bearer` on POSTs.
2. Habitat tokens (a `vant_` bearer token or the `x-habitat-token` header)
   are accepted wherever a shared key is, and anchor the request to its
   registry-verified RLS subject.
3. The Host header must be loopback (DNS-rebinding guard), cross-origin
   POSTs are refused, and bodies must be `application/json`.
4. The bind is loopback by default: `VANT_MCP_BIND` widens it deliberately,
   `VANT_MCP_PORT` (default 3457) moves it.

### Operations and catalog

Running the server, stdio mode, ports, TLS, and the security chain are
covered in the [MCP Server guide](/vant/runtime/mcp). The full tool catalog
lives in [MCP Tools](/vant/reference/mcp-tools).

---

## The REST layer

`lib/server.js` is the HTTP server class: a router with static serving, a
per-minute rate limiter that sets `X-RateLimit` headers, and a TLS posture
of loopback-or-TLS. TLS is automatic when `VANT_SERVER_CERT` and
`VANT_SERVER_KEY` are set; the `vant server` CLI refuses a non-loopback
plaintext bind unless `--insecure` is passed.

On top of it, `lib/api.js` registers the REST surface for embedders:

```javascript
const api = require('vant/lib/api');

await api.startREST({ port: 3456 });  // REST routes only
await api.startAll();                 // REST + MCP together
```

Every REST route is a thin proxy to an MCP tool, so responses are the
tool's result JSON:

| Method | Path | Backs onto |
|--------|------|------------|
| GET | `/streams` | `stream_list` |
| POST | `/streams` | `stream_create` |
| GET | `/streams/:id` | `stream_info` |
| POST | `/streams/:id/enqueue` | `stream_enqueue` |
| POST | `/streams/:id/poll` | `stream_poll` |
| GET | `/brain` | `brain_state` |
| GET | `/brain/ls` | `brain_list` |
| GET | `/brain/:name` | `brain_load` |
| POST | `/brain/:name` | `brain_save` |
| GET | `/trust/score/:entity` | `trust_getScore` |
| POST | `/trust/record` | `trust_record` |
| GET | `/trust/leaderboard` | `trust_leaderboard` |
| GET | `/market/listings` | `market_search` |
| POST | `/market/list` | `market_list` |
| POST | `/market/bid` | `market_bid` |
| POST | `/market/trade` | `market_trade` |
| GET | `/market/stats` | `market_stats` |
| GET | `/market/listing/:id` | `market_get` |

Three built-ins sit on every `lib/server.js` instance before any route:
`GET /tools` (tool catalog), `GET /health` (liveness), and `POST /call`,
which executes any tool and honors both the JSON-RPC 2.0 `tools/call`
envelope and flat `{ tool, args }` bodies.

The full request and response reference is the
[REST API Reference](/vant/reference/rest-api). The `vant api` utility CLI
(status, routes, call, docs) introspects the same surface.

---

## The crew bus

Cross-node transport for the multi-agent crew and agora (`lib/crew-bus.js`).
Crew messages travel as HMAC-signed webhook envelopes between node
processes. There is no shared process and no shared protocol state, only
signed post between peers that registered each other.

Envelope shape (JSON body):

```json
{
  "event": "crew.vote",
  "from": "node-a",
  "type": "vote",
  "payload": { "topic": "use-gold-theme", "choice": "aye" },
  "ts": 1730000000000,
  "nonce": "9f2c1b"
}
```

Contract:

- Signing: HMAC-SHA256 over the envelope, sent in the `X-Signature-256`
  header. Receivers verify timing-safe and reject unsigned or missigned
  POSTs with 401.
- Envelope version: `{ major: 1, minor: 0 }` stamped on every envelope. A
  major version the receiver does not know is refused loudly, never
  silently misread; minor bumps are additive. The stamp lets a receiver
  refuse what it cannot parse, never widen what it accepts (gates always
  run receiver-side).
- Node names share the brain and topic charset `[A-Za-z0-9_-]` and become
  webhook route segments.
- Outbound delivery rides `lib/network.fetch` with `system:true`, so the
  SSRF domain allowlist still applies: nodes allowlist their crew peers
  with `network.setAllowedDomains([...])`.
- A verified delivery emits `webhook:crew.<type>` into the event system and
  dispatches to the node's registered handler for that type.

Setup sketch:

```javascript
const crewBus = require('./lib/crew-bus');

crewBus.configure({ name: 'node-a', port: 4001, secret });
crewBus.registerNode({ name: 'node-b', url: 'http://127.0.0.1:4002', secret });
crewBus.onDispatch('vote', (env) => tally(env.payload));
await crewBus.listen(4001);

await crewBus.send('node-b', 'vote', { topic: 'use-gold-theme' });
```

Bootstrap between fresh nodes is the `genesis.hello` / `genesis.ack`
handshake (`lib/genesis.js`). Operating verbs that ride this wire (remote
votes, ledger sync, settlement) are in
[Agora operations](/vant/operations/agora) and
[Federation playbooks](/vant/operations/federation-playbooks); the webhook
transport underneath is in [Webhooks](/vant/operations/webhooks).

---

## Agent chains

Delegation is shipped and real, but it is tool calls and work items, not a
wire protocol:

- In-process crew: `agents.spawn`, `agents.delegate`, `agents.pollWork`,
  `agents.completeWork`, `agents.approve`, `agents.escalate` and friends
  (`lib/agents.js`).
- Over MCP, external agents use the same door: `agent_spawn`, `agent_list`,
  `agent_kill`, `agent_proto_list`, `agent_proto_load`.
- Channels: `msg.send(channel, message)` for in-node broadcast
  (`lib/msg.js`); the crew bus carries the cross-node leg.
- Skill templates: `skill_proto_list` and `skill_proto_load` over MCP;
  recipes in [Agent skills](/vant/integrations/agent-skills).

The guide for the whole crew surface is
[Multi-Agent Crew](/vant/multi-agent/agents).

---

## The `_theme` extension

Status: helpers shipped, server adoption pending. The honest one-liner:
`lib/theme.js` ships the spec'd helpers and CLI output uses them today
(health, help, lock, config), but the MCP server returns plain JSON and
does not decorate responses with `_theme` yet.

The design, so a client can be ready early:

- Shape: an optional `_theme` object carried on a result
- `status`: `success`, `error`, `warning`, `loading`, or `info`
- `icon`: a single glyph, for example `✓` for success and `✗` for error
- `format`: `text`, `markdown`, or `html`
- `color`: hex, for example `#22C55E` for success
- `priority`: optional sort hint for list displays

Clients MUST ignore unknown `_theme` fields (forward compatibility), and
servers can adopt incrementally. The design RFC is `labs/rfc-mcp-theme.md`
in the repo; `lib/theme.js` exports `STATUS_ICONS`, `applyToMCP`, and the
`mcp.success`, `mcp.error`, `mcp.warn`, `mcp.loading`, and `mcp.info`
response builders.

---

## Related

- [MCP Server](/vant/runtime/mcp) - running and securing the tool door
- [MCP Tools](/vant/reference/mcp-tools) - the tool catalog
- [REST API Reference](/vant/reference/rest-api) - the REST surface in full
- [Agora operations](/vant/operations/agora) - cross-node verbs over the crew bus
- [Webhooks](/vant/operations/webhooks) - the transport crew envelopes ride
- [Multi-Agent Crew](/vant/multi-agent/agents) - spawn and delegate guide
