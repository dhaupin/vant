---
version: 0.8.6
permalink: /operations/relay
layout: default
title: The Relay - the r/2 webhook-native face
description: The relay - Mode R, the gated webhook-native hop surface, and its operation postures.
nav_order: 67
---

# The Relay - the r/2 webhook-native face

The relay is a connection layer of vant, not an app
([prd-relay.md](https://github.com/dhaupin/vant/blob/axolotl/labs/prd-relay.md)):
encrypted pipes connecting installs - and each other - gated so not just
anyone flows.

**The pass-236 ruling (owner):** there is NO `lib/relay` module. The relay
face is COMPOSED out of the existing webhook/door transports:

| Relay duty | The existing system it rides |
|------------|------------------------------|
| intake (hops + rides) | `lib/webhooks.js` - ONE registered route (`POST /relay`), HMAC-gated, replay-refused, 1 MiB-capped |
| the gate | the route's HMAC secret (`relay.gateKey`) - `X-Signature-256` over the raw body bytes |
| outbound forwarding | `lib/network.fetch` - SSRF wall, DNS-rebinding refusal, circuit breaker (all the transport's own; the relay does none of it itself) |
| envelope law | `lib/encrypt.js` - AES-256-GCM + HMAC, zero new crypto (the crew-bus precedent) |
| ride dispatch | the pod's OWN MCP door (loopback `POST /mcp/exec`) - the door's full auth chain stays the single authority |
| the api face | `lib/api.js` relay - mount/status handlers, `relaySend` client seam |
| boot wiring | `vant.startFull`/`startHeadless` mount the face when the posture is ON |

The guard is mechanical: `test/no-legacy-bloat.test.js` FAILS the moment
`lib/relay.js` reappears.

## The wire (r/2)

One registered POST route. The envelope shape is the crew-bus one:

```text
POST <relay>:3467/relay
  X-Signature-256: HMAC-SHA256 hex over the RAW body bytes
  { event: 'relay.hop' | 'relay.ride', from, ts, nonce, payload,
    v: { major: 2 } }

relay.hop  payload = { origin, path, ct }   this pod IS the relay: it
            forwards { ct } to origin+path via network.fetch and the
            upstream's answer rides the SAME post's ack back
            (ack.reply.raw verbatim).
relay.ride payload = { ct }                 this pod is the ENDPOINT: the
            envelope opens with the pod's channel key, the inner call
            { nonce, bearer?, body } dispatches to the pod's own MCP door
            (bearer INSIDE the envelope - the pod-realm credential
            tunnel), and the door's answer re-envelopes into ack.reply.ct.
```

Transport refusals ride HTTP statuses (the webhook transport's own):
401 unsigned/missigned/stale, 409 replay (identical signed bytes),
404 route missing (posture OFF is route-missing), 413 over 1 MiB.
Application refusals ride typed replies INSIDE the 200 ack:

| Reply code | Meaning |
|------------|---------|
| `E_RELAY_UNKNOWN_EVENT` | not `relay.hop` / `relay.ride` |
| `E_RELAY_BAD_ORIGIN` | the origin fails the posture's scheme/scope rule |
| `E_RELAY_BAD_PATH` | unrooted/unsane path |
| `E_RELAY_NEEDS_ENVELOPE` | `ct` is not an AES-256-GCM envelope |
| `E_RELAY_UPST` | upstream unreachable |
| `E_RIDE_OFFLINE` | ride dispatch before posture + channel key |
| `E_RIDE_DECODE` | wrong/stale channel key, bent inner payload |
| `E_RIDE_REPLAY` | inner nonce already spent (TTL window) |
| `E_RIDE_DISPATCH` | the door could not be reached |

## The kit: one contract, checksummed copies

The contract lives ONCE, in `web/kit/contracts/relay-contract.js` (+ `.d.ts`
twin) at version **r/2**: the wire, the signature header, typed reply
codes, the envelope rule, flavors, and the honest caps shape. Renderers
hold their own checksummed copies - vendored by
`scripts/vendor-relay-kit.js`, pinned by `.sha256` sidecars, and the
parity pins (`test/relay-parity.test.js`) FAIL on any drift from kit head:

| Renderer | Their copy | Verified by |
|----------|------------|-------------|
| pod face (`lib/api.js` relay) | its own plain-copy constants (pod never requires `web/` - the one-way boundary) | constant pins vs kit |
| dashboard-relay flavor (`web/dashboard/functions/api/r/relay.ts`) | `functions/lib/relay-contract.js` vendored + pinned | byte-identity + `vendor --check` |
| solo-relay flavor (`web/relay/functions/api/r/*`) | same vendoring | same |

Change the kit, then re-run the vendoring - the pins fail closed.

## The origin policy (pass 270)

One resolver (`lib/api.js _relayOriginPolicy`) answers every hop origin;
the postures widen in this order:

| Posture | Config | Plain-http hop origins | Outbound fetch dial |
|---------|--------|------------------------|---------------------|
| PUBLIC (default) | - | none (https only) | the standing SSRF wall (private IPs, DNS rebinding, cloud metadata all refused) |
| INTRANET (LAN-scope) | `relay.intranetOrigins true` | ONLY private-LAN scopes: loopback (127/8, ::1), RFC1918 (10/8, 172.16/12, 192.168/16), IPv6 ULA (fc::/7) | `network.fetch internalPolicy: 'privateLan'` - LAN carve-out, but link-local (169.254 cloud metadata!), multicast and 0.0.0.0 STILL refused |
| LAB ESCAPE | `relay.allowPrivateOrigins true` | any scheme anywhere | `skipDomainCheck` (the pre-270 escape, unchanged) |

The intranet posture is the mesh-on-a-LAN default recommendation: pods
relay to their neighbors without becoming LAN probers, and the
metadata-hostile wall survives every posture. Pilot pinned:
`scripts/pilot-two-relays.js` runs the WHOLE lane under the intranet
posture (no lab escape armed) and the H6 pin holds the posture line on
real sockets.

## Bring-up (the pod IS the relay + the endpoint)

```bash
vant config set relay.enabled true   # persisted to the current brain
vant relay gate                      # mint the HMAC secret (shown ONCE)
vant relay channel                   # mint the e2e channel key (shown ONCE)
vant server                          # (or all / headless) - the boot mounts the face
vant relay status                    # posture truth
```

The boot mounts the face onto the webhook transport (its own port, 3467
default, loopback-bound like every listener; widen deliberately with
`VANT_WEBHOOK_*`). OFF is first-class: no register, no server, no route.
ON without a gate secret binds NOTHING (fail-closed).

## The client seam

```javascript
const relay = require('./lib/api').relay;
const r = await relay.send(
    'http://your-relay.example.com:3467',
    '<the relay gate secret>',
    { origin: 'https://your-pod.example.com', path: '/mcp/exec',
      ct: relay.envelope(payload, channelKey) },
    { event: 'relay.hop' }
);
// r.reply.raw = the upstream's verbatim answer
```

`relaySend` composes the crew envelope, HMAC-signs the raw bytes, posts
to `/relay`, and returns the merged ack. The same wire the dashboard edge
speaks (secondary consumer, owner ruling).

## Why the riding transports make this stronger

- The SSRF posture is NOT new code: `network.fetch` already refused
  loopback/RFC1918/link-local/IP literals and DNS-rebinding before r/2
  existed - hop forwards simply inherit it. The lab escape
  (`relay.allowPrivateOrigins`) widens BOTH dials together (the scheme
  rule + network's private-IP wall); public posture keeps the full wall.
- Replay is NOT new code: the webhook transport's `_replayCheck` refuses
  byte-identical signed envelopes (409) and stale envelopes (401) for
  every route; the ride adds the inner-nonce TTL cache (rung 2) on top.
- The door stays the door: rides dispatch through the pod's own MCP door
  over loopback - its full auth chain executes; the relay layer margins
  nothing around auth.
- The relay stays BLIND: the gate secret is spent at verification, the
  channel key is never held, and every body it carries is ciphertext.

## Pins, rebuilt fresh

`test/relay.test.js` walks the FULL loops over real sockets: signed gate
(401/200/409 ladder), the hop round trip (forward + verbatim answer +
no-body-leak + secret-never-rides), the ride loop (envelope -> open ->
nonce -> door -> re-envelope, bearer inside), typed ride refusals through
the pipe, the OFF posture, the body cap, the counters, and the sender
seam. `test/relay-parity.test.js` pins face-to-kit constants, vendored
byte-identity, shape agreement, and the retired-wire lies.

---

## Related

- [Relay Playbook](/vant/operations/relay-playbook) - operating knowledge for walkers on the relay
- [Untrusted Remote](/vant/advanced/nsc9-spec) - the remote transport this relay powers
- [Remote Push/Pull](/vant/operations/sync) - the push/pull API the sender seam wraps
