---
version: 0.8.6
permalink: /integrations/gamestruct
layout: default
title: gamestruct Lane
nav_order: 82
description: Driving a game world from your brain over the gamestruct lane - observe, act, wait_for, and events through one door.
---

# gamestruct Lane

> Your brain can play, over the same four verbs any game exposes.

[gamestruct](https://github.com/dhaupin/gamestruct) is the game-agent lane bridge: one small contract that any game implements as a *door* and any brain drives as a *client*. synmergia is the first world; vant is the first brain. Neither owns the contract.

`lib/adapters/gamestruct.js` is vant's half. It is a pure client (no service of its own), so it sits with the adapters beside memstruct and registers as `connectors.gamestruct()`.

## The four primitives

gamestruct SPEC v0.1.0 fixes the signatures (section 3). Every door exposes exactly these; a client that uses only these can operate the surface.

| Verb | Signature | Meaning |
|------|-----------|---------|
| `observe` | `() -> Snapshot` | The current state for this seat: `{ ok, nodes, focus, summary }` |
| `act` | `(handle, verb, value) -> Result` | Do one thing by a **stable handle** (never by pixel or index) |
| `waitFor` | `(predicate, timeoutMs) -> Outcome` | Resolve when a condition holds, or time out honestly (`reason:'timeout'`) |
| `events` | `(sinceFrame) -> { frame, events[] }` | An honest cursor: the same cursor returns the same events; the frame is monotonic |

A refusal is a value (`{ ok:false, reason }`), never a throw (N21). The HTTP binding carries it as `409` (a refused act) or `408` (an honest timeout) with that JSON body - the adapter reads the body, so the refusal arrives as data.

The door also answers the MCP binding (section 7.2): `catalog()` is `tools/list` (each tool carries a real `inputSchema`, so an agent auto-wires with no bespoke code) and `call(name, args)` is `tools/call`, dispatched onto the same `act`.

## Driving a door

```js
const connectors = require('./lib/connectors');
const world = connectors.gamestruct({ door: 'http://127.0.0.1:8791' });

const snap = await world.observe();               // { ok, nodes, focus, summary }
const wolf = await world.find({ name: 'wolf' });  // locate a handle without hardcoding ids
await world.act(wolf.id, 'activate');             // a refusal is a first-class { ok:false, reason }
await world.waitFor({ hp_lt: 30 }, 5000);         // honest timeout, never a hang
const { frame, events } = await world.events(0);  // the ring since frame 0
const { tools } = await world.catalog();          // the MCP tool list
await world.call(tools[0].name, { verb: 'activate' });
```

An agent never guesses a handle: the door tells it what it can do now, by stable id.

## Play: leisure over the lane

The brain keeps a want-list (see [Leisure](/vant/memory/leisure)). When idle capacity appears, `play()` pursues one want *through the same lane* - no second protocol:

```js
const played = await world.play('hunt');     // observe -> act one safe affordance
// { ok:true, acted:true, handle:'world:wolf_7', name:'Attack wolf',
//   action:'activate', outcome:'done', learned:'played: activate at world:wolf_7' }
```

A refused act comes back as `outcome: 'refused'` with a named reason, never a throw.

## Security posture

The door is a real remote surface, and the client fails closed:

- **Loopback by default.** A door is `http://127.0.0.1:<port>` unless an operator names another address. A literal loopback host skips the domain wall (there is no DNS to rebind).
- **Remote doors ride the wall.** Any non-loopback door goes through `lib/network.fetch` - the SSRF IP wall, the DNS-rebinding refusal, and the circuit breaker - exactly like the relay hop and the crew bus.
- **Token, never logged.** When a token is configured it rides every request as `Authorization: Bearer` (or `x-api-key`). The client attaches what it holds; the door is the authority that refuses a missing or wrong token.
- **No credentials in the URL.** A door URL carrying `user:pass@` refuses typed, so a leaked userinfo can never become a leaked secret.

## Related

- [Leisure](/vant/memory/leisure) - the want-list the brain pursues over the lane
- [MCP](/vant/runtime/mcp) - vant's own MCP door, the same wire from the other side
- [memstruct Interchange](/vant/memory/memstruct) - the record grammar sibling
