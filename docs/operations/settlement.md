---
version: 0.8.6
permalink: /operations/settlement
layout: default
title: Settlement
nav_order: 68
description: Cross-node payment - the buyer's escrow debits where the budget lives; the other side records a claim. Money is recorded, never held.
---

# Settlement

> How money crosses org boundaries without anyone holding anyone
> else's money: the buyer's escrow debits on the buyer's own node, and
> the seller's node records a claim. Local escrow guards budgets;
> settlement extends that guard across the mesh.

## On this page

- [The money model](#the-money-model)
- [Local escrow vs settlement](#local-escrow-vs-settlement)
- [The invoice](#the-invoice)
- [Refusal codes](#refusal-codes)
- [Idempotency](#idempotency)
- [Related](#related)

## The money model

Two rules, both pinned:

1. **The debit runs where the budget lives.** The buyer's escrow
   checks and spends inside one critical section before the wire leg.
   Nothing is owed TO the seller's books: the seller's node records a
   CLAIM (what was sold, at what price, by whom), never cash.
2. **The claim is only as good as the listing.** The owner verifies
   the listing exists, the price matches, the buyer matches the
   sending node's vetted principal, and scope admits the buyer - all
   owner-side, before recording.

This is credit-side accounting deferred by design: the claims ledger
is the proof of settlement, budgets stay sovereign, and no shared bank
exists anywhere in the mesh.

## Local escrow vs settlement

| | Local escrow | Cross-node settlement |
|--|--------------|----------------------|
| Books | One node | Buyer node + seller-side claims |
| Debit | `canSpend` then `recordSpend` | Debit first, then the wire leg |
| Failure mode | Refusal, no state change | Refusal, then an explicit unwind of the local debit |
| Surface | [Escrow](/vant/security/escrow) | `lib/settlement.js`, wire legs `settle.request` / `settle.record` |

Local escrow remains the budget guard for everything inside one
install; settlement is the same discipline extended across the wire.

## The invoice

```js
const settlement = require('./lib/settlement');
const inv = settlement.makeInvoice({
    listingId: 'lst_abc123',   // the listing being settled (4-64 chars)
    price: 6,                  // positive number, capped at 1,000,000
    buyer: 'beta-1',           // must match the sending node's vetted principal
    seller: 'acme-1',
    topic: 'forum-q3-call',    // optional provenance
    memo: 'minutes pack'       // optional, bounded
});
const r = await settlement.sendInvoice(crewBus, 'acme-node', inv);
// { settled: true } or { settled: false, reason, code }
```

The wire carries the invoice and the verdict; the listing itself never
moves, and the owner's gates run unchanged on the seller's side.

## Refusal codes

A refusal is explicit (never a timeout): the buyer's local debit is
unwound before anything settles.

| Code | Meaning | Usual fix |
|------|---------|-----------|
| `E_NO_LISTING` | Listing not found on the owner node | Group listings live on the steward (the node whose gates hold the scope) |
| `E_PRICE_MISMATCH` | Invoice price differs from the listing | Re-issue the invoice at the listing price |
| `E_BUYER_MISMATCH` | Invoice buyer differs from the sending node's vetted principal | Fix the registry anchor (id = principal, name = node name) |
| `E_SCOPE` | Scope does not admit this buyer | The buyer must be a member where the model lives |
| `E_BUDGET` | Buyer's escrow refused the debit | Raise the budget or lower the price |
| `E_DEBIT` | Debit failed mid-check | Inspect the buyer's escrow state |
| `E_HOLD` | A hold blocked the settlement | Release or resolve the hold first |

## Idempotency

Settlements are idempotent by `settlementId`: a replayed invoice re-acks
the SAME claim rather than double-charging. Retries are therefore safe
by construction - the ack means the claim exists, not that money moved
again.

Read the claims ledger:

```js
settlement.list();             // newest first
settlement.get(settlementId);  // one claim
```

Aggregates only on status surfaces: settlement memos and topics stay
local (the [Stewardship view](/vant/operations/agora) carries counts,
not wallets).

## Related

- [Escrow](/vant/security/escrow) - the local budget guard settlement builds on
- [Federation Playbooks](/vant/operations/federation-playbooks) - publish and settle, end to end
- [Federation](/vant/multi-agent/federation) - the authority rules behind claims-not-cash
- [Steward Runbook](/vant/operations/steward-runbook) - the group pattern in operation
