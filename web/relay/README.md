# vant-relay — the SOLO flavor (R1, prd-relay.md 4.0)

A **PURE relay**: anyone hosts it SOLO on its own Pages project. Chain hops only — no admin surfaces, no accounts, no KV, no default profile pin. The endpoint the headless runtime (pod CLI / MCP / lib) and the dashboard (Settings → **Run with a relay**) execute through.

## Deploy

Cloudflare Pages → connect this repo → project root directory:

| Setting | Value |
|---------|-------|
| Framework preset | Vite |
| Root directory | `web/relay` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 20+ |

The Mode R functions under `functions/` deploy automatically with the project (no wrangler config anywhere — prd-web.md 3.7). Then set the two Pages env keys (Production **and** Preview):

```text
VANT_RELAY_ENABLED=1
VANT_RELAY_GATE_KEY=<256-bit hex>      # mint once: vant relay gate
```

Off = no `/api/r` surface at all (404, parity with the pod). On without a key = serves nothing (fail-closed 503).

## Surfaces

| Route | Gate | What |
|-------|------|------|
| `GET /api/r/capabilities` | public, cross-origin readable | the posture proof: flavor `solo-relay`, caps `r/1`, what the relay does NOT have |
| `POST /api/r/exec` | `x-relay-gate` + AES-256-GCM envelope | the encrypted hop, five-guard ladder, byte-verbatim forward |
| `GET /api/r/events?origin=…&path=…` | `x-relay-gate` + origin/path query | R1 SSE stream-through: gated, blind, bytes ride untouched |

## The fallback arm (pass 234)

Why this small app matters: when any primary relay goes dark (a shared host, an edge outage), ANY other `web/relay` deploy speaking r/1 can take the slot — **the client owns the chain and its order**, never the relay. And a takeover costs nothing because there is nothing to carry over:

- the functions/lib holds ONLY the checksummed kit contract (no account store, no KV, no ledger — source-pinned);
- zero credential identifiers (`session`/`cookie`/`Bearer`/ `channelKey`/`apiKey`) exist anywhere in the relay's runtime path — pinned (parity block 12b): the relay cannot learn logins even if compromised;
- no module-scope caches, no store bindings (12c): stateless hop to hop;
- every hop body arrives as an AES-256-GCM envelope, encrypted by the client BEFORE it touches this host — the relay forwards byte-verbatim and holds no key (12d's law, stated on the page);
- every route answers `x-content-type-options: nosniff` + `referrer-policy: no-referrer` (12e).

Pins: `test/relay-parity.test.js` block 12 (12a–12e).

## The contract

The kit contract lives ONCE (`web/kit/contracts/relay-contract.js`); this app vendors a byte-identical, `.sha256`-pinned copy (run `node scripts/vendor-relay-kit.js` after any kit change — the parity pins fail closed on drift). The relay holds **no channel keys and no instance profile by construction**: it verifies envelope SHAPE and forwards; the e2e channel key belongs to the pairing-time end-to-end rung (prd-relay.md §5).

## Verify

```bash
node test/relay-parity.test.js        # the R1 block + both vendored flavors
node scripts/vendor-relay-kit.js --check
cd web/relay && bun x tsc -b --noEmit # the app + functions typecheck
```
