---
version: 0.8.6
permalink: /security/escrow
layout: default
title: Escrow
nav_order: 69
description: "Escrow in the security chain: the accountability layer that answers 'may this agent afford this operation?' before anything runs - budgets, holds, approvals, quotas, circuit breakers, and the fail-closed workspace RLS."
---

# Escrow

Escrow is Vant's **accountability layer** - the last gate in the middleware chain before anything executes (sandbox, then vaf, then qos, then escrow). It answers one security question: **may this agent afford this operation?** where "afford" covers budget, quota, and circuit state - and the verdict is recorded as events either way. It is claims-not-cash: auditable authority between agents, not money movement.

> Every spend of authority here is checkable and reversible. The API
> reference with exact signatures is
> [Escrow API](/vant/reference/escrow) - this page is the security model.

## Why an accountability layer

The rest of the chain answers *input shape* (vaf), *static capability* (sandbox), and *request rate* (qos). Escrow closes the gap those cannot: **accumulated** authority use. An agent can pass input validation and still burn the install down with a hundred budgeted writes; escrow makes that spend visible, bounded, and reversible per agent, per workspace, per brain.

## What each primitive guards

| Primitive | The question it guards | Refusal posture |
|-----------|------------------------|-----------------|
| **Budget** | Has this agent already used the authority it was given? (`canSpend` vs `limit`) | Refused with `budget_available`-class reason; recorded as an event |
| **Quota** | Is this agent beating the rolling window? (per agent+operation, default 1000/hour) | Window resets automatically; no per-window knob |
| **Hold** | Is a shared task still pending? (a reservation with a timeout, then release/check) | Holds expire at the constructor's `holdTimeout` (default 5 min) - a hold is NOT a debit; budget only moves on `recordSpend` |
| **Approval** | Is a sensitive operation (default `delete`, `admin`, `write:critical`) human-approved? | Enforced and SINGLE-USE: the brain pipeline burns a matching, unexpired `approvalId` on success - one approve authorizes exactly one execution |
| **Circuit** | Is a failing service being hammered? (breaker per service, threshold 5) | Opens on repeated failures, resets on success or manually |

Two approval nuances that trip people up:

- There is **no `reject` method** - deny by simply not approving; the request stays `approved: false`.
- An operation that needs no approval is **auto-approved immediately** (`{ approved: true, reason: 'auto_approved' }`), so callers do not branch on operation type.

## Fail-closed workspace pools

Budgets can scope to a habitat workspace: an org pool with per-member caps, so a 500-credit org cannot fund 600 of member spends no matter how many agents share it. The RLS rules are fail-closed:

- Draws scoped to a workspace the habitat has never heard of are refused (`unknown_workspace` / `E_UNKNOWN_WORKSPACE`).
- Setting a pool or member cap is an **admin act** - the habitat registry verifies the admin role for that workspace, never self-declaration; denial throws `RLS_DENIED`. A live habitat always enforces; bare library use passes unless `enforceWorkspaceRLS: false` opts out.

Market trades ride the same split (`market.trade` draws the buyer's workspace pool); plain agent budgets are unchanged when no workspace is named.

## State that survives crashes and jumps

The ledger (budgets, holds, approvals, quotas) persists to the brain store on every spend and restores on construction. Horcrux transport serializes it (`gatherState` / `restoreState`), so a restored brain keeps its accounting history - accountability does not reset between incarnations.

## Where it shows up

- [Settlement](/vant/operations/settlement) builds its cross-node billing on this guard.
- Governance [scenario crews](/vant/operations/scenario-playbook) share one escrow pool.
- [Sandbox](/vant/security/sandbox) consults the same gate on every capability-smelling operation.

## Related

- [Escrow API](/vant/reference/escrow) - signatures, the hold/debit split, workspace pools, CLI, events
- [QoS](/vant/operations/qos) - request-rate layer (the gate before escrow in the chain)
- [Sandbox](/vant/security/sandbox) - capability floor (the gate before that)

## Next

- [Settlement](/vant/operations/settlement) - what escrow's budget guard feeds downstream
