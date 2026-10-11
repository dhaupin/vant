---
version: 0.8.6
permalink: /labs-prototype-marketplace
layout: default
title: Prototype — Credentialed Marketplace (Wave U6, research frontier)
nav_order: 150
description: Skill/tool listing schema, reputation over the trust feed, escrow hold→deliver→release delivery contract, and the failure modes that shape it.
---

# Prototype: Credentialed Marketplace

> **Research frontier, prototype grade.** This wave (PRD U6.1–U6.4)
> ships this design note + a CONFIG-GATED prototype surface in
> `lib/market.js`. Nothing here is a product promise: the gate
> (`market.skillsEnabled`) is **OFF by default**, and productizing or
> demo-archiving is an owner decision (U6.5).

## What "credentialed" means here

A skill/tool listing is priced digital labor. Buyers pay BEFORE seeing
the payload — that is the fraud surface — so the whole contract is:
**escrow holds the money, delivery must be verifiable, trust punishes
mis-delivery.** No new primitives: escrow (budgets/holds), trust
(reputation feed), market (listings/settlement), the arch-A store.

## 1. Listing schema (`type: 'skill'`)

Rides the EXISTING listing shape (`market.list('skill', data)`) with
prototype-required fields the skill ops validate:

```
type: 'skill'
title:            'nsc9-fingerprint-verify'        (human-readable key)
description:      what the skill does, inputs/outputs
payloadKind:      'text' | 'code' | 'launch'       (prototype: text|code)
                  'launch' = credentialed EXECUTION, deferred (below)
payload:          the deliverable bytes (validated at delivery, never blessed at listing)
price:            credits (default 1 — same normalization as trades)
seller:           registry hostname (set from context.agentId)
attestation:      OPTIONAL seller claim: { kind: 'tested'|'peer-reviewed', ref }
capabilityTag:    OPTIONAL what running it needs ('memory.read', ...)
revoked:          false                             (seller can revoke unsold supply)
```

Honest non-goal in this prototype: **'launch' payloads are not
implemented.** Credentialed *execution* of bought code would need a
nerve-splice surface (sandboxed eval with a bought-context) and its own
threat model. `payloadKind: 'launch'` listings are REJECTED at
listSkill (typed) rather than accepted-and-ignored — a documented
boundary, not a bug.

## 2. Reputation source (trust.js feed)

Settle outcomes write REAL cooperation records via `trust.record` (the
same door pass-193's agent registry uses), so the marketplace sits on
the existing reputation chain:

| Outcome | Record | Effect |
|---------|--------|--------|
| buyer confirms delivery | `trust.record(seller, 'market_skill_delivery', { positive: true, value: min(0.2, price/50) })` | seller reputation up, scaled by deal size |
| buyer refutes (payload undeliverable/wrong) | `{ positive: false, note: 'skill_delivery_refuted', tradeId }` | seller reputation down |
| settle never happens (timeout) | nothing (the hold expires; no penalty without evidence) | honest default |

`scoresFor(agentId)` (existing) is the buyer's pre-trade reputation
check: shown in `skillStatus` so reputation is visible BEFORE paying.
Deliberately NOT added in this prototype: weighted vote-by-seller or
shill-resistant aggregation — that is productization math (U6.5).

## 3. Delivery contract (escrow hold→deliver→release)

```
listSkill   → listing persisted (type 'skill'), supply counted
buySkill    → escrow canSpend check + hold (NOT a debit yet) →
              trade row 'skill_pending_delivery' scoped to (buyer, listing)
deliverSkill(seller)→ payload validated against payloadKind:
              text: nonempty string ≤64KB; code: nonempty string ≤64KB
              (bytes stored with the trade; delivery marks trade.delivered)
              → payloadHash = sha256 (lib/hash.js, one hash source)
confirmSkill(buyer) → buyer names the trade; payloadHash returned so the
              buyer can verify bytes; escrow recordSpend (DEBIT — the
              pass-48/198 insight again: holds are bookkeeping, debits
              are money); trust feed positive; trade 'settled'
refuteSkill(buyer)  → no verify possible → hold released, NO debit,
              trade 'refuted', trust feed negative
```

Key invariant (pinned): **delivery never blesses an unverified
payload.** Delivery records bytes + hash; only the BUYER's
confirm/refute releases or refunds — the seller cannot settle their own
sale, and the buyer cannot settle twice.

## 4. Failure modes (each maps to a state or a typed refusal)

| Failure | Contract answer |
|---|---|
| seller never delivers | hold stays; buyer refutes → refund, trust hit; no timeout-automated penalty (no evidence) |
| double settlement | second `confirm`/`refute` on a settled ref → typed `E_SKILL_ALREADY_SETTLED` |
| buyer tries to settle (seller-side op) | `deliverSkill` checks caller IS the seller (typed `E_SKILL_NOT_SELLER`) |
| wrong-person delivery | same as above; delivery is seller-scoped by construction |
| payload declared 'launch' | `listSkill` refuses at listing time (documented boundary) |
| empty/oversized payload | `deliverSkill` refuses typed before any state change |
| trade on revoked listing | refused (revoked unsold supply cannot sell) |
| market gate off | every skill op returns typed `E_SKILLS_DISABLED` — the surface is INERT, not absent (discoverability without behavior change) |
| destroyed/truncated state | arch-A store hydrate semantics apply (denied ≠ absent) — no special case here |

## 5. Disposition (U6.5 input for the owner)

- Prototype grade: no MCP tools (CLI-less), memory+store persistence
  rides the market's own WAL, no export CLI, no cross-brain sync of
  trades.
- The classic `list/bid/trade` surface stays the PRODUCT surface;
  `skillsEnabled` gates a parallel, stricter, delivery-confirmed flow.
- Productize = (a) wire skill ops into MCP + a `vant market skill`
  CLI, (b) timeout automation with evidence rules, (c) shill-resistant
  reputation aggregation, (d) decide about 'launch' payloads. All
  follow-ups are additive to this schema.
- Demo-archive = keep the gate OFF, keep the pins (they document the
  contract), stop.
