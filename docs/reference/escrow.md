---
version: 0.8.6
permalink: /reference/escrow
layout: default
title: Escrow API
nav_order: 124
description: Vant's escrow layer - per-agent budgets, holds, approvals, quotas, circuit breakers, and the execute middleware that gates operations before they run. Plus the market integration and the multibrain stack status calls.
---

# Escrow API

> Escrow is Vant's **accountability layer**: every spend of authority -
> budget, quota, a hold on shared state - is recorded, checkable, and
> reversible. It is claims-not-cash: auditability between agents, not
> money movement.

Escrow is one of the middleware layers in the brain's chain
(sandbox, vaf, qos, escrow). It answers one question before an
operation runs: **may this agent afford this operation?** - where
"afford" covers budget, rate, and circuit state, and the answer is
recorded as events either way.

## The mental model

| Concept | What it is | Key calls |
|---------|-----------|-----------|
| **Budget** | Per-agent spend ledger (`spent`, `limit`, `available`) | `canSpend`, `recordSpend`, `refund`, `setBudgetLimit` |
| **Hold** | A named reservation with a timeout (default 5 min) | `hold`, `release`, `checkHold` |
| **Approval** | Gate for sensitive operations (`delete`, `admin`, `write:critical`) | `requestApproval`, `approve`, `checkApproval` |
| **Quota** | Per-agent, per-operation counters in a rolling window (default 1000/hour) | `checkQuota`, `incrementQuota`, `getQuota` |
| **Circuit** | Per-service breaker (threshold 5, exponential backoff) | `isOpen`, `recordFailure`, `recordSuccess` |

The default cost table: `read` 1, `write` 5, `delete` 10, `admin` 50.
Costs are adjustable per operation with `setCost(op, cost)`.

## A hold is a reservation, not a debit

This is the detail most callers get wrong:

> `escrow.hold(id, condition)` records a condition entry with a
> timeout. **It does not move budget.** The budget only moves when
> `recordSpend` runs.

The market integration relies on exactly this split
(`lib/market.js`): `canSpend` compares `available >= amount` before a
trade, the hold records the reservation, and the debit happens
separately through `recordSpend`. If you need a true "reserve funds"
semantic, do it the market's way: check, hold, then spend on success
(or `refund` on failure).

## The execute middleware

The integration point used by callers that want one gate:

```javascript
const escrow = require('vant/lib/escrow');

// BEFORE: check every gate at once
const gate = await escrow.beforeExecute({
    agentId: 'my-agent',
    operation: 'write:critical',
    service: 'storage',
    cost: 5
});
// gate.allowed - false if ANY of: budget exceeded, quota exhausted,
// circuit open, legal gate blocked
// gate.results - the individual verdicts: { budget, quota, circuit, legal }

if (gate.allowed) {
    doTheWork();
    // AFTER: record spend, bump quota, feed the breaker
    escrow.afterExecute({
        agentId: 'my-agent',
        operation: 'write:critical',
        service: 'storage',
        cost: 5,
        success: true
    });
}
```

`escrow.execute(ctx)` is the strict variant used by the brain
pipeline: same checks, but a denial **throws** `Escrow denied`
(`ESCROW_DENIED`) instead of returning `allowed: false`.

Sensitive operations can require a human-style approval:

```javascript
const req = escrow.requestApproval('delete', 'wiping stale topics');
if (!req.approved) {
    // ... someone (owner-side) calls:
    escrow.approve(req.approvalId, 'owner');
}
escrow.checkApproval(req.approvalId);  // { approved: true, operation: 'delete' }
```

## CLI

| Command | Description |
|---------|-------------|
| `vant escrow status` | Show held items, budget used, budget total |
| `vant escrow hold <id>` | Put an item in escrow |
| `vant escrow release <id>` | Release from escrow |
| `vant escrow list` | List escrow items |

The companion market CLI (`vant market list | bid | trade | search |
stats | get | bids`) rides on the same budget split described above.

## Multibrain and stack status

Escrow state is queryable per brain and across the whole stack:

```javascript
escrow.getBrainEscrowStatus();
// { budget, used } - for the CURRENT brain

escrow.setBrainQuota(500);   // set the current brain's budget
escrow.getStackEscrowStatus();
// { source: 'stack', brains: [...], byBrain: { vant: {...}, cairn: {...} } }
// walks the stack via pushBrain/removeBrain; a brain that errors
// gets { error } instead of taking the report down
```

Per-brain state means each brain in a stack carries its own
accountability ledger - the same "the agent's history is its memory"
ruling that scoped sudo escalations (issue #98).

## Crash safety and horcrux

Escrow state (budgets, holds, approvals, quotas) persists to the
store on every spend and restores on construction. For airgap
transport, `gatherState()` / `restoreState(data)` serialize the
ledger into (and out of) a horcrux payload, so a restored brain
keeps its accounting history.

## Events

| Event | When |
|-------|------|
| `escrow:budget:check` | `canSpend` evaluated |
| `escrow:spend:recorded` | Spend recorded |
| `escrow:runaway:blocked` | Runaway-spend detector blocked a recordSpend |
| `escrow:execute:before` / `escrow:execute:check` / `escrow:execute:after` | The middleware gate lifecycle |
| `escrow:restored` | Persisted state loaded on construction |

## Function reference

| Function | What |
|----------|------|
| `canSpend(agentId, amount)` | Budget check; `{ allowed, reason, available }` |
| `recordSpend(agentId, amount)` | Debit; runaway detector runs first |
| `refund(agentId, amount)` | Credit back; never above limit |
| `getBudget(agentId)` | `{ spent, limit, available }`; auto-creates |
| `setBudgetLimit(agentId, limit)` | Change the limit, keep spent metrics |
| `hold(holdId, condition)` | Reservation with timeout; NOT a debit |
| `release(holdId)` / `checkHold(holdId)` | Drop / inspect (expired holds self-clean) |
| `requestApproval(op, reason)` | `{ approvalId }` for sensitive ops |
| `approve(id, by)` / `checkApproval(id)` | Owner-side grant / verify |
| `checkQuota(agentId, op)` / `incrementQuota(agentId, op)` | Rolling-window counters |
| `isOpen(service)` / `recordFailure` / `recordSuccess` | Circuit breaker per service |
| `beforeExecute(ctx)` / `afterExecute(ctx)` | The combined gate |
| `execute(ctx)` | Strict middleware variant; throws on denial |
| `getBrainEscrowStatus()` / `setBrainQuota(budget)` | Current-brain ledger |
| `getStackEscrowStatus()` | Per-brain report across the stack |
| `gatherState()` / `restoreState(data)` | Horcrux serialization |

> **Export note:** `escrow.resetBudget` was advertised on the
> module exports but called a method that never existed - any call
> threw `TypeError`. Use `setBudgetLimit(agentId, limit)` (keeps
> spent metrics) or `setBudget(agentId, budget)` (resets spent to
> zero). Fixed in pass 77; the export now delegates to `setBudget`.
