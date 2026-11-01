# Vant Web — Provider Mode: brain.creadev.org as the Community Face — Product Requirements Document

**Version:** 0.1 (planning draft — defined, NOT built; §10 names every truth-state)
**Branch:** axolotl  **Date:** 2026-11-01  **Status:** Draft for owner ruling. This spec DEFINES
the provider-mode rung; nothing in it is built on any branch yet. **Parent PRDs:**
[prd-web.md](prd-web.md) (§3.5 session binding, §3.7 origin env) and [prd-relay.md](prd-relay.md)
(the relay chain, the sovereign scope, the ride machinery this mode rides).

---

## 0. The direction log (owner rulings, recorded this session)

1. *"brain.creadev.org is operating as a 'service' to the community, as a relay, but also so folks
   can explore their own vant install."* — the mission statement. The dashboard's default posture
   (one env-configured pod behind it) is the WRONG default for the multi-owner service face.
2. *"We have 2 choices... Allow users to set their own pod url, or encode pod url into vguest.
   I think it's easier to encode url into vguest? Maybe not lol."* — the two named options,
   weighed in §2. The owner's "? Maybe not lol" instinct is honored: the encoded-URL option is
   REFUSED, with receipts.
3. *"Either way there should be like an env or something that can be set to explicitly allow this,
   like provider mode or something."* — the gate law: provider behavior is an OPERATOR'S env fact,
   never a on-by-default shape change.
4. *(session conclusion, owner-approved)* The third path wins: **the pod dials out; the browser
   rides** — provider mode = a pairing-code REGISTRATION gate that opens per-guest property slots,
   reusing the already-built pairing + ride machinery. No user-typed pod URL ever reaches the edge.

---

## 1. The problem this closes (real, live-diagnosed 2026-11-01)

Today a visitor pasting a `vguest_` token at brain.creadev.org cannot reach anything:

| Live fact (probed) | Consequence |
|--------------------|-------------|
| `podOriginFor()` reads only `VANT_PROPERTY_<P>_ORIGIN` (web/dashboard/functions/lib/bridge.ts:17) | a pasted token is forwarded to the OPERATOR'S pod, whose guests ledger never saw it — the token is valid somewhere else and dies here |
| brain.creadev.org answers `503 VANT_PROPERTY_LOCAL_ORIGIN is not configured` on `/api/mcp/exec` + `/api/mcp/tools` | today no pasted token can work there at all — even a token minted on the intended pod |
| `GET /api/auth/session` answers `503 E_STORE_UNCONFIGURED (BOLETE_KV)` | no accounts, no email OTP, no server-side token binding — the primary AuthGate lane is inert |
| Guest ledgers are per-install and never sync (`lib/guests.js`, by design) | "bring a token minted on YOUR pod" can only mean: the dashboard must reach the pod the token belongs to |

Underneath all four sits one structural reason: **property ids name ENV-CONFIGURED origins** (the
single-tenant posture). Provider mode inverts it for the community face: **a paired guest IS its
own property**, and reach comes through the pod's outbound relay posture — the machinery
prd-relay.md already built for exactly this topology.

## 2. The refused option, recorded with receipts (URL-in-token)

Encoding the pod's URL inside the `vguest_` token was considered and REFUSED:

1. **Two concerns, two lifecycles, one string.** A token is a credential (rotate/revoke/expire —
   the denylist-backed #185 seam). A locator changes on every tunnel restart and port shuffle.
   One string fails silently: a stale URL inside a still-valid token is indistinguishable from a
   lying dashboard, and both sides rot in different directions.
2. **NAT reality beats the convenience.** The community user's pod runs on a laptop or a home box.
   `http://192.168.1.34:3467` is unreachable by a Cloudflare Pages edge no matter where the URL is
   written. The public-HTTPS-pod minority is served TODAY by the direct lane; the majority needs
   outbound dialing — which is what the relay face already is.
3. **Shape churn across every parser.** `vguest_<id>_<secret>` is pinned in `lib/auth.js`
   (`/^vguest_([a-f0-9]{6,32})_/`), `lib/guests.js`, the dashboard edge intake (512-cap +
   `startsWith("vguest_")`), the OS packs (`vant-brain` pins the exact regex in a test), `DEPLOY.md`
   and the docs. A third segment versions the wire across pod, edge, relay and packs at once —
   for a feature the pairing flow gives for free.
4. **Self-declared origin is an abuse surface.** A token that carries an origin turns every guest
   into a source of edge-forwarded requests to arbitrary hosts. The lane it unlocks is refused
   anyway (below).

Recorded so six waves from now nobody re-proposes it.

## 3. The chosen mechanic: provider property slots from a pairing voucher

### 3.1 The gate (operator side, one env fact)

- `VANT_PROVIDER_MODE = 1` — the ONLY env key. Absent → today's dashboard, byte-identical:
  env-only properties, no registration UI. Set (on the dashboard-relay flavor ONLY) → the
  registration surfaces exist and the edge accepts provider property ids.
- It is named in the public capabilities shape (`GET /api/r/capabilities`) as
  `"provider": "offering"` — clients adapt from caps, never from a guess. OFF posture omits the key
  entirely (the honesty law prd-relay.md §4 lives by: an OFF posture has NO surface).
- The gate is NOT a bank vault: provider mode opens REGISTRATION, never arbitrary forwarding.
  The edge's bridge stays env-origin-only (`VANT_PROPERTY_*`); the ONE-WAY credential law stands.

### 3.2 The member flow (user side, four steps, no public URL typed anywhere)

1. **Request a voucher.** The dashboard's provider panel (visible only under the gate) mints a
   single-use pairing code — `vhpair-` family, hash-persisted, 24h expiry (the existing
   `offerPairing`/`pair` law: "a voucher, not a standing credential").
2. **Redeem on YOUR pod.** `vant guest pair --code vhpair-...` (the shipped CLI verb) — redemption
   is single-use, timing-safe, marks the pod's pairing spent, and (relay posture armed) the SAME
   reply carries the e2e channel key for the profile — shown once, beside the token, never again
   through any door or caps surface (the P3/H6 reply contract already built in lib/mcp.js).
3. **The pod dials out (Mode A).** The pod's webhook transport opens its outbound lane to the relay;
   the edge HOLDS NOTHING sensitive — the e2e channel key rides inside the user's sovereign profile
   export path as designed (prd-relay.md §2.2).
4. **A provider property slot opens.** Property id derived, minted by the redeem, not chosen by the
   user: `p = g<guest id hex>` — kebab-charset-safe by construction (`g` + `[a-f0-9]{6,32}`, honors
   the existing ROUTE_RE and readPropertyFromUrl charset). Collision-free without a signup
   database; a pod re-pairing after revocation mints a fresh id honestly.

### 3.3 The lanes under provider mode, named in lastRoute

| Lane | Who forwards | Truth |
|------|--------------|-------|
| `sealed-ride-e2e` | the pod itself (outbound session) | PRIMARY: works for NAT'd pods; the edge relays ciphertext; the inner bearer inside the envelope is the door authority (prd-relay.md §5 law, already pinned) |
| `direct` (public-HTTPS pods) | the browser | the ONE edge-free lane; signing exists because the pod's own door aliveness answers |
| `own-edge-bridge` | the edge, env origin | UNCHANGED: the operator's own default property (`local`), the operator's tokens, the env martini mode — provider changes nothing here |

A brand NEW edge-forwarded lane ("edge dials a user-named origin") is **defined as refused** —
the §2 ruling applied at the forwarding layer. If the community shows a real need for edge-forwarded
reach to publicly-HTTPS member pods, it comes back as its own gated spec with an origin allowlist
and a bind-time token-possession handshake. Nothing in this PRD builds a bridge toward arbitrary
networks.

### 3.4 Where pod tokens live under provider mode (scope-split honest)

Unchanged from prd-relay.md §2.2: **memory/crypto-held, client-side** — never in relay KV, never in
logs, never inside cookie values on the relay face. The pairing voucher and the minted property id
are the only provider-state the edge needs; both are row-shaped and PII-free by construction
(prd-web.md's ledger: "append PII-free"). Side note honored by any build wave: provider mode does NOT change the account lane's
deployment needs — the KV-backed flows stay the operator's optional layer (the honest
`E_STORE_UNCONFIGURED` 503 keeps answering wherever `BOLETE_KV` is unset); provider slots do NOT
depend on it (the voucher grants the property, not a profile).

---

## 4. Risks + rails (each: threat, rail, where the rail already exists)

| Threat | Rail |
|--------|-------|
| Voucher replay after expiry/refusal | single-use, timing-safe, 24h expiry rejected plainly (the existing pair() law) |
| Property-slot squatting on ids | ids are MINTED from guest ids at redeem, not user-chosen; a guest forfeiture/rotation mints a fresh slot honestly |
| Relay-side credential capture | scope split: the e2e key rides INSIDE the sovereign profile; the voucher is consumed at the pod, not held at the edge |
| Hammering the relay via member pods | the existing rate gate (`VANT_EDGE_RATE_PER_MIN`) and the per-property breaker (already in bridge.ts) apply VENUE-WIDE to provider slots — a bad actor's pod gets its own breaker trip |
| A revoked guest's slot going stale | revocation is denylist-backed (auth.revokeToken → guests.revoke); a revoked slot answers the door's raw 401 with an honest reason, never a silent ghost |
| UI promising a lane that doesn't answer | the /chain badge + state.lastRoute name the ACTUAL lane; the refusal surface (Refusal.tsx) already renders honest reasons for dead tokens |

## 5. UI surfaces (dashboard only; relay face stays minimal-always)

- A provider panel in Settings (rendering only when caps read `provider: offering`): the voucher
  mint button + the four-step member copy (paste-level, no jargon), state: minted/copied/consumed.
- The AuthGate: unchanged primary flows. A member who paired simply finds `g<hex>` in the property
  switcher — no property typing, no URL field, NO new paste mode.
- The posture card: unchanged read-only honesty — provider ON/OFF is the operator's env fact
  (6.1's two-sided law holds verbatim).

## 6. Migration (feature-shaped, honest)

- brain.creadev.org can turn provider mode on with the gate alone (no schema bump, no wire
  versioning). Vouchers ride the existing ledger mechanics; slots ride the existing property
  plumbing. OFF → ON is additive; ON → OFF hides the panel and orphans slots (they answer honestly
  unreachable — documented everywhere the panel prints).
- DEPLOY.md gains §12.x (dashboard-relay provider posture): the one env key, the
  BOLETE_KV-if-accounts note, the caps-read self-check.

## 7. Non-goals (this spec)

- NO new edge-side forwarding lane to user-named origins (§3.3, recorded).
- NO account requirement for a provider slot (the voucher grants the property; accounts are the
  operator's optional layer — the scope split holds).
- NO pod-side changes beyond what Mode A already requires. The protected invariant stands: the
  pod's DOOR AUTH POSTURE does not change to make provider mode work.
- NO global directory of member pods (mesh discovery stays opt-in-and-later, prd-relay.md §9 gating).

## 8. Open questions for the owner (before build waves resume)

1. Slot cap per deploy: how many live member slots before the gate trips? Proposal: env-defined
   (`VANT_PROVIDER_SLOTS`, default 32) with the breaker honoring it dishonesty-proof (typed refusal).
2. Do provider slots ride the sovereign-profile IMPORT on a second device (they would — the profile
   transport already carries chain + keys + tokens... a slot id's presence should ride along anyway)?
3. Name check: `VANT_PROVIDER_MODE` — or does the owner want it under the relay family
   (`VANT_RELAY_PROVIDER`) since it extends the relay face? (This spec assumes the former;
   the rename is a one-line surface change).

## 9. The definition ledger (defined / built — nothing else named)

| Element | Truth-state |
|---------|-------------|
| Provider gate (env fact, capabilities line `provider: offering | absent`) | DEFINED (this spec) |
| Voucher-issued provider property slots (`p = g<guest id hex>`) | DEFINED |
| Voucher→pod dial→edge acceptance→slot mints (the 4-step member flow) | DEFINED |
| Sealed-ride as the member's primary lane; owning-edge unchanged | BUILT (prd-relay.md; provider re-rides it, adds nothing) |
| Edge-forwarded lane to user-named origins | REFUSED (this spec §2, recorded with receipts) |
| Provider panel + property-switcher behavior | DEFINED (UI rung) |
| Tier-2 risk rails (slot cap env, breaker span, revocation UX) | DEFINED (§4/§8) |

## 10. Acceptance criteria per rung

- **PM1 — gate + caps.** With the gate absent, the dashboard is byte-identical to today
  (snapshots prove it); caps omit the provider key. With the gate set, caps answer
  `provider: offering` and the panel exists. Nothing else changes on either posture.
- **PM2 — voucher → slot.** Mint a voucher under the gate; redeem on a real second pod with relay
  armed; the redeem reply carries the e2e key ONCE; the dashboard's property switcher names
  `g<hex>`; the pod's outbound dial answers the caps probe; a `sealed-ride-e2e` door call reaches
  THIS pod's ledger (a mint-on-your-pod token works bounce-for-bounce — the fail that opened this
  investigation cannot recur through the provider path).
- **PM3 — refusal honesty.** An expired/misused voucher refuses typed; a revoked guest's slot
  answers 401; a gated-off deploy answers 404 (no provider surface); the /chain badge names the
  lane that actually answered.
- **PM4 — two devices.** The sovereign profile export/import carries a provider slot: same member
  pod reached from a second dashboard hop without re-pairing; the edge held nothing new between them.

## 11. Verify it (after build waves, from anywhere)

```bash
node test/relay.test.js                # the ride face this mode rides (38 pins, untouched)
node test/relay-parity.test.js         # r/2 contract + pins (40); provider adds NOTHING to the wire
node web/dashboard/scripts/…           # provider panel lint (lands with PM1)
```

Operational face: docs/operations/relay-playbook.md and this spec; config face: §8's env keys.
