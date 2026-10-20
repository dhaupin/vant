# PRD — The Carrier Share / Lane UI (front + back, one spec)

> What landed (P5a, this tree): door verbs §2 (`carrier_lane_list`,
> `carrier_encode`, `carrier_decode`, `traveler_list`, + the standing
> `traveler_stamp`/`traveler_fetch` faces), kit member 3.1
> (`web/kit/components/carrier-share.tsx`, vendored byte-identical into
> `web/dashboard/src/frame/CarrierShare.tsx` with a hash pin by
> `scripts/vendor-relay-kit.js`), and module 3.2 `carriers` (`/carriers`,
> registered in frame/registry) + module 3.2 `chain` (`/chain`, P5b: the
> per-property hop read over the real `/api/r/capabilities` routes — own
> deploy + the saved `/web/relay` hop, ACTIVE-hop named on the direct
> pod bridge, honest core-rung badges, probe rides the door via
> `relay.lost`; settings stays the EDITOR per prd-relay 6.1).
> Spec family: extends [prd-web.md](prd-web.md) §4.2 (the covert-carrier
> abstraction, owner directive 2026-10-16) and [prd-relay.md](prd-relay.md).
> Every surface named here is a REAL existing surface (verified against the
> tree 2026-10-19): `lib/carriers.js` lanes `nsc9|stone|svg|json|qr` +
> `plateDefine/plateList/carry/replay/setPointerFetch`, `lib/traveler.js`
> `mint→advance→verify→persist` + append-only ledger, door verbs
> `traveler_open|hop|carry|status|fetch|stamp|audit|replay` and
> `carrier_plate_define`, kit `web/kit/contracts/relay-contract.js`
> (`ROUTES/EVENTS/FLAVORS/envelopeShape/capsShape`), dashboard functions
> `api/r/capabilities.ts` + `api/r/relay.ts`.

## 1. The one idea

ANY payload a dashboard surface needs to hand across a non-API boundary
(air gap, printed page, camera scan, chat paste) renders through ONE
carrier-neutral component, and the pod exposes ONE typed verb family so
agents get the same power. The **caller names the carrier**; the component
and the verb family never pick a format by payload sniffing, and every
rendered artifact STATES what a recipient needs to decode it.

Law (inherits §4.2 verbatim, owner-set): hash-verified payloads, never
capability-smuggling, honest typed refusals per lane. A decoded voucher
still redeems through `guests.pair()`; a decoded chain seed still probes
through the public caps route. Nothing here widens any wall.

## 2. Backend (the pod side — lands FIRST so front and back agree)

New read-class door verbs beside the existing `traveler_*` family
(same gate pattern as `traveler_status`: keyed access, sandbox read
gate, typed refusals through the door):

| Verb | Class | Wraps | Returns |
|------|-------|-------|---------|
| `carrier_lane_list` | read | `carriers.list()` + `plateList()` | `{ lanes: [{id, kind: 'builtin'|\u200b'plate', carries, capacity?}], plates: [...] }` — the roster a UI renders verbatim, never invents |
| `carrier_encode` | read* | `carriers.encode(packet, lane, opts)` | `{ carrier, artifact: string, address }` — `*` encodes EXISTING packets only; it mints nothing. An absent/conflicting packet refuses typed `E_CARRIER_SHAPE` |
| `carrier_decode` | read (verify-only) | `carriers.decode(lane, artifact, opts)` | the resolved packet or the honest unresolved record (`{resolved:false, reason}`) — decode NEVER writes; pointer resolution rides the existing append-only store + `setPointerFetch` hook contract |
| `traveler_list` | read | ledger directory scan | `{ ids: [64hex...], cursor? }` — the browse face; per-id truth stays in `traveler_status` (one law: list names, status verifies) |

Schema rules: every verb mirrors the existing `inputSchema` block style;
errors use the existing `errors.CODES` (`E_CARRIER_SHAPE/CARRIER/TAMPER`,
`STORAGE_NOT_FOUND` for an absent re-verify), never raw throws.
`carrier_encode` on a lane whose payload exceeds lane capacity (e.g.
`QR_CAP`) refuses typed pointing at the stone lane — the lib's own
refusal, re-typed, not a UI truncation.

CLASSIFICATION (landed verdict, pass-267 law, corrections the smoke
caught): `carrier_lane_list` and `traveler_list` are read-class (the
`list` tail); **`carrier_encode` and `carrier_decode` are
WRITE-class** — a verb that wraps the packet gate (`encode`) or may
ride the node's `setPointerFetch` wire hook (`decode`) is never
observer read-safe, even though both mutate nothing. The read-suffix
regex already classifies them correctly; this line records WHY, so a
future regex loosening cannot silently flip them.

## 3. Frontend (the kit + the dashboard)

### 3.1 `web/kit/components/carrier-share` (NEW kit member)

A pure renderer (no door calls, no asserts, no fetches — the kit holds
contracts + pure views by existing kit law):

- Input: `{ packet | pointer: 'VANT:1:<64hex>', lane, artifact?, caps }`.
  The CALLER fetches the packet (via `traveler_fetch`) and calls
  `carrier_encode` (or passes a pre-made artifact); the component renders.
- Caps input (`{scan?, airgap?, print?, paste?}`) comes from
  `carrier_lane_list`, so lane choice is a USER pick per need — the
  component decides nothing (§4.2 rung 2, verbatim).
- Renders per lane: QR → raster + human line; stego → SVG viewbox +
  download; nsc9 → the 12-digit doorway + the full 64-hex address (the
  spec's own "doorway vs lattice" correction honored); json → fenced
  text; custom plate → the frame prefix/suffix honesty line.
- ALWAYS renders: the decode sentence (" recipient needs: X lane +
  Y decoder"), the content address, and a hash pin line. Nothing
  auto-downloads, nothing opens a door.

Vendoring: this component is a KIT SIDE member, not a contract copy —
it rides the relay/dashboard via the SAME vendor script pattern
(`.cjs`-honest where the bundler demands it); parity stays a CI pin as
today (`scripts/vendor-relay-kit.js --check`).

### 3.2 Dashboard modules (registered in `frame/registry.ts`, the same manifest law; new folders, frame untouched)

**`carriers` — route `/carriers`, tiers O A S, phase-first (this spec):**

- **Letter ledger**: `traveler_list` → id chips; click → `traveler_status`
  drawer (stations, ops, seq) + `traveler_audit` verbatim tab; `replay`
  renders the certified-walk verdict card.
- **Stamp gallery**: pointer stamps consumed from live SSE
  (`relay.events` / `traveler` wire events) or minted on click via
  `traveler_stamp` (`{found, kind, frame, png, moduleCount}`).
- **Share panel**: the kit `CarrierShare`, caller pre-fetches a packet by
  address, user names the lane, decode sentence rendered.
- **Plates roster**: `carrier_lane_list` rows; `carrier_plate_define`
  stays THE write (door-gated, the ops authoring face from pass 270).

**`chain` — module #20, route `/chain`, tiers ALL, from prd-relay.md 3.3:**

- Per-property hop list from the relay caps route
  (`/api/r/capabilities` — already deployed on this Pages project);
  the ACTIVE hop named, e2e/plain badge per hop (stated as honest
  "core rung" status until P6b lands — no greenwashed badge).
- Probe verdict card: a probe rides the door, never a UI-side fetch
  beyond the public caps route §the contract defines.
- Settings' "Use relays / Run with a relay" cards remain the EDITOR;
  `/chain` is the READ (editor/reader separation already in the PRD).

### 3.3 The relay app (solo flavor)

No new module (minimal-by-ruling stands): the solo relay only gains the
vendored `CarrierShare` IF a real endpoint needs it; otherwise vendor
--check pins stay 2/2 and the solo bundle does not grow. DELIBERATE.

## 4. Invariants (nothing new, restated so tests can pin them)

1. Hash-verified everywhere: every artifact carries the .sha256-style pin
   line; a tampered decode refuses typed (the lib law, not a UI rule).
2. No capability smuggling: a rendered voucher/stamp decodes to data that
   still rides real walls (`guests.pair()`, caps route, packet wall).
3. UI never flips env/config: writes stay `carrier_plate_define` + the
   existing CLI/door lines (prd-web 6.1 law).
4. One-way boundary holds: frontends import the vendored kit + talk to
   the door; they never require the pod's lib graph.
5. Honest states: unresolved pointer = `{resolved:false}` record card,
   never an error, never a fabricated body (the pass-265 ruling).

## 5. Test pins this spec owes (new suites)

- `mcp.test.js` blocks: 5 new verbs happy-path + typed refusals (absent
  packet, nonexistent lane, oversized QR, pointer w/o body).
- Kit: `CarrierShare` renders the decode sentence + address for every
  lane; refuses UNKNOWN lane typed; nsc9 renders the 12-digit doorway AND
  the 64-hex address.
- Dashboard: `carriers` module fetch-row honest states (ledger miss,
  stream-down, claim-not-minted); `chain` module renders caps verdicts
  plus the not-yet-e2e badge honestly.
- Parity: vendor --check 8/8 stays green (kit unchanged by this spec
  unless 3.1 lands a side member — then the pin grows by the new member,
  never by hand-editing a copy).

## 6. Phasing (soft, per §4.3 style)

- **P5a (this spec, first rung)**: pod verbs §2 + kit component §3.1 +
  dashboard `carriers` module §3.2. Front/back land in ONE pass so
  consistency is by construction, not by contract memo.
- **P5b (landed)**: `chain` module + settings editor split (already
  specced in prd-relay 6.1 — this spec only wires it to the caps route).
  Landed: modules/chain over the REAL caps routes (`/api/r/capabilities`
  on this deploy + the saved relay origin, cross-origin-readable by
  contract); 404 = "not a relay" honest record; plain-pipe caps refuse
  loudly; the not-yet-e2e badge is the core-rung status line, never a
  greenwash; the probe rides the door (`relay.lost` through the intake);
  the only UI-side fetch is the contract-defined public caps route.
- **P6**: the relay piggyback story per prd-relay v0.2 (nothing here
  changes the P6a/P6b split).
