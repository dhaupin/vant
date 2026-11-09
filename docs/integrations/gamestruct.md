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

| Verb | Signature | Meaning |
|------|-----------|---------|
| `observe` | `() -> Snapshot` | Where am I, what is around me, what can I do now |
| `act` | `(id, args) -> Result` | Do one thing by a **stable handle** (`world:<id>`, `ui:<path>`, or a verb) |
| `waitFor` | `(predicate, timeoutMs) -> Result` | Block until a condition holds, or an honest timeout |
| `events` | `(sinceFrame) -> Array` | What happened while you were not looking |

The door also answers the MCP binding (`tools/list`, `tools/call`), so an agent auto-wires without hand-written glue. `tools()` and `call()` expose that side.

## Driving a door

```js
const connectors = require('./lib/connectors');
const world = connectors.gamestruct({ door: 'http://127.0.0.1:8791' });

const snap = await world.observe();          // { ok, scene, actions: [...] }
await world.act('world:wolf_7', { n: 1 });   // a refusal is a first-class { ok:false, reason }
await world.waitFor({ hp_lt: 30 }, 5000);    // honest timeout, never a hang
const seen = await world.events(0);          // the ring since frame 0
```

An agent never guesses a handle: the world tells it what it can do now, by stable id.

## Play: leisure over the lane

The brain keeps a want-list (see [Leisure](/vant/memory/leisure)). When idle capacity appears, `play()` pursues one want *through the same lane* - no second protocol:

```js
const played = await world.play('hunt');     // observe -> act one safe affordance
// { ok:true, acted:true, handle:'world:wolf_7', action:'attack', outcome:'done', learned:'played: attack at world:wolf_7' }
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
