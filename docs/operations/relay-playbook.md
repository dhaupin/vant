---
version: 0.8.6
permalink: /operations/relay-playbook
layout: default
title: The Relay Playbook
nav_order: 69
description: Serve a relay from the pod, piggyback the dashboard, host the pure solo relay, use relays from the user side - verified recipes for the r/2 webhook-native chain.
---

# The Relay Playbook

> The relay is a connection layer of vant, not an app
> ([prd-relay.md](https://github.com/dhaupin/vant/blob/axolotl/labs/prd-relay.md)):
> encrypted pipes connecting installs - and each other - gated so not just
> anyone flows. This page is the DO-IT recipes; the mechanism lives in
> [relay.md](/vant/operations/relay). Everything below is the **r/2
> webhook-native** face (pass 236 ruling: no `lib/relay` module - the
> face composes the webhook/door transports).

The two-sided rule first (prd-relay.md 6.1): **serving** a relay is the operator's posture (env/config, fail-closed); **using** relays is the user's choice in dashboard Settings. They never blur.

## Recipe 1 - serve a relay from the pod (headless flavor)

```bash
vant config set relay.enabled true    # persisted to the CURRENT brain
vant relay gate                       # the HMAC secret (shown ONCE) - the GATE
vant relay channel                    # the e2e channel key (shown ONCE)
vant server                           # (or all / headless) - the boot mounts the face
```

Verify - all three must hold:

```bash
# 1. posture truth from the CLI (liveness counters are per-process)
vant relay status
#   expect: mounted: true, route: POST /relay (webhook transport, HMAC-gated)

# 2. the gate rings: an UNSIGNED post refuses 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3467/relay \
  -H 'content-type: application/json' \
  -d '{"event":"relay.hop","from":"probe","ts":1,"nonce":"n","payload":{"ct":"0"},"v":{"major":2}}'
#   expect: 401 (Missing X-Signature-256)

# 3. a mis-signed post refuses 401 too; replay of the SAME signed bytes: 409
```

How to sign (node, the same rule anywhere - WebCrypto on the edge):

```javascript
const Encrypt = require('./vant/lib/encrypt').default; // HMAC-SHA256 canon
const raw = JSON.stringify({
    event: 'relay.hop', from: 'me', ts: Date.now(),
    nonce: require('crypto').randomBytes(16).toString('hex'),
    payload: { origin, path, ct },
    v: { major: 2 }
});
// POST raw to http://relay:3467/relay with
//   X-Signature-256: Encrypt.hmacSign(raw, gateKey)
// The ack carries reply (the upstream's verbatim answer for a hop).
```

WAN note: the webhook listener binds loopback by default like every listener (DEPLOY.md section 4). A relay that serves others widens deliberately - TLS edge or `VANT_WEBHOOK_BIND` - the relay layer requires no exposure the pod does not already choose.

## Recipe 2 - piggyback the dashboard (dashboard-relay flavor)

Same r/2 contract, vendored kit, no separate Pages project:

1. Mint a gate secret once: `vant relay gate` (a SECRET - treat it like an API key; shown once). Signers of the dashboard's intake carry it.
2. Pages project - Settings - Environment variables (both Production and Preview):

   ```text
   VANT_RELAY_ENABLED=1
   VANT_RELAY_GATE_KEY=<the minted hex>
   ```

3. Redeploy; then verify from the browser:

   - `GET https://<your-dashboard>.pages.dev/api/r/capabilities` answers the caps shape (`"flavor":"dashboard-relay"`, wire r/2). - Settings - **Run a relay (piggyback)** shows the same truth (re-read posture button included - the card never stale-caches). - The edge intake is `POST /api/r/relay`, the same wire as the pod: HMAC-signed crew envelope, ack with reply.

## Recipe 3 - host the PURE relay (solo flavor, web/relay)

A standalone relay lives in `web/relay/` on its OWN Pages project (root directory `web/relay`, Vite preset, `dist/` output; the functions under `web/relay/functions/` deploy automatically with it - no wrangler config anywhere). Same two env keys as the piggyback, read at request time:

```text
VANT_RELAY_ENABLED=1
VANT_RELAY_GATE_KEY=<256-bit hex>       # mint once: vant relay gate
```

Solo posture, stated on the relay's own page (the authless public / end): flavor `solo-relay` with a NO-default-profile-pin guarantee, the r/2 hop intake (`POST /api/r/relay`, HMAC-gated, ack-with-reply), and the SSE stream-through (`GET /api/r/events?origin=...&path=...&ts=...`, `X-Signature-256` over the query bytes, byte-verbatim). No KV, no accounts, no chain editor of its own - by construction, not by omission.

**The fallback share:** this arm exists so a dark PRIMARY relay is survivable: any other r/2 relay like it takes the slot, and the CLIENT owns the chain order - the relay itself holds nothing to migrate (no logins, no users, no instance info; every hop body arrives as an AES-256-GCM envelope - encrypted by the client BEFORE it touches the host - and the relay forwards byte-verbatim with no key to open it).

## Recipe 4 - use relays (the user's side)

Dashboard - Settings - **Use relays (your reach):**

- **on** = reach this pod through relay hops when available (persisted to your profile, non-sensitive pref).
- **off** = direct Mode A/B (the default, always first-class).

Honest-by-construction: while the chain editor and the pairing-time e2e key binding are not yet wired to the exec path, ON is SAVED INTENT and the page says so in plain text - nothing fake-routes. What makes it live: the chain editor (next rung) + the e2e channel keys bound at pairing.

**Run WITH a relay:** Settings - **Run with a relay (web/relay endpoint)** takes the relay's ORIGIN, and the card verifies it LIVE against that relay's public caps page (cross-origin readable by contract). The saved endpoint is a non-sensitive pref (`bolete-relay-endpoint`). The card states the today-truth: verified and remembered now; execution through it routes with the e2e rung - nothing fake-routes.

## Verify the whole pipe (the pins already prove it)

```bash
node test/relay.test.js             # 26 pins: the r/2 face, REAL-socket
                                    # loops (hop + ride), gate ladder,
                                    # replays, typed refusals, no-body-leak
node test/relay-parity.test.js      # 16 pins: face <-> kit <-> vendored
                                    # parity, shape agreement, retired-wire
                                    # lies caught
node test/no-legacy-bloat.test.js   # 13 pins: lib/relay.js STAYS deleted
node test/mcp.test.js               # 17 pins: the door incl. relay_status
node scripts/vendor-relay-kit.js --check   # the checksummed contract
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `404` on `/relay` (pod) or the edge intake | posture off on that deploy | set the env keys (Recipe 2) / `relay.enabled` (Recipe 1), then restart the boot |
| the boot says "relay posture is ON but dialled off" | enabled but no gate secret | `vant relay gate` (Recipe 1) / `VANT_RELAY_GATE_KEY` (Recipe 2) |
| `401` on the intake | missing signature (add `X-Signature-256`), wrong secret, or stale `ts` | sign the RAW body bytes with the relay's gate secret; fresh `ts` |
| `409` on the intake | identical signed bytes replayed | compose a fresh envelope (new `ts`/`nonce`) and re-sign |
| `413` | body over 1 MiB | the doors' shared cap; split the payload |
| reply `E_RIDE_OFFLINE` | rides before posture + channel key | `vant relay channel` + enabled posture, then restart |
| reply `E_RIDE_DECODE` | wrong/stale channel key (or bent inner payload) | re-envelope with the CURRENT pairing key; rotate if needed |
| reply `E_RIDE_REPLAY` | same inner nonce inside the TTL window | a fresh nonce per ride (rung 2) |
| reply `E_RELAY_NEEDS_ENVELOPE` | plaintext `ct` | the pipe is encrypted-only: encrypt with the pairing-time key (`relay.envelope(payload, key)`) |
| reply `E_RELAY_BAD_ORIGIN` | private/loopback/metadata target, or http scheme | explicit public https origins only (the lab escape `relay.allowPrivateOrigins` widens scheme + IP wall together) |
| reply `E_RELAY_UPST` | hop target unreachable | check the origin is live and public |
| settings card says the deploy is not a relay | this deploy has no relay surface (correct for OFF) | Recipe 2 to piggyback, or leave OFF (first-class posture) |
| verify fails `not contract r/2` | caps non-contract (old deploy) | the dashboard speaks r/2 only; redeploy that relay from this repo |

---

## Related

- [Relay](/vant/operations/relay) - concepts and architecture
- [Security Sandbox](/vant/security/sandbox) - what relay-CG exposes
- [Best Practices](/vant/security/best-practices) - door hygiene for public relays
