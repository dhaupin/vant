---
version: 0.8.6
permalink: /security/escrow
layout: default
title: Escrow
nav_order: 69
---

# Escrow

Budget tracking, condition holds, approvals, and circuit breakers for Vant.

## What

Escrow is Vant's "final validation gate" before execution:

- Budget tracking - Monitor spending per agent
- Condition holds - Wait for conditions before proceeding
- Approval gates - Require approval for sensitive operations
- Circuit breakers - Fail fast on failing services

## Quick Start

Import escrow:

```javascript
const { Escrow } = require('./lib/escrow');
const escrow = new Escrow();
```

## Budget

Track agent spending.

Set budget for an agent:

```javascript
escrow.setBudget('agent-1', 10000);
console.log(escrow.getBudget('agent-1'));
// { limit: 10000, spent: 0, available: 10000 }
```

### Check Spending

Check if operation is allowed:

```javascript
const { allowed, reason, available } = escrow.canSpend('agent-1', 100);
console.log(allowed);   // true
console.log(reason);    // "budget_available"
```

### Record Spending

Record a transaction:

```javascript
escrow.recordSpend('agent-1', 50);
console.log(escrow.getBudget('agent-1').spent); // 50
```

### Refund

Refund a transaction:

```javascript
escrow.refund('agent-1', 25);
console.log(escrow.getBudget('agent-1').spent); // 25
```

## Cost Configuration

Configure operation costs:

```javascript
escrow.setCost('read', 1);
escrow.setCost('write', 5);
escrow.setCost('delete', 10);
escrow.setCost('admin', 50);
```

Get cost for an operation (falls back to `_costs.default`):

```javascript
console.log(escrow.getCost('write')); // 5
```

Budget methods: `setBudget(agentId, budget)` / `setBudgetLimit(agentId,
limit)` / `canSpend` / `recordSpend` / `refund` / `getBudget`.

## Holds

Hold execution until conditions are met.

Create a hold:

```javascript
const r = escrow.hold('task-1', 'user_confirmation');
// { held: true, holdId } - or { held: false, reason: 'max_holds_exceeded' }
```

The hold carries the CONDITION (a string tag) and expires after
`options.holdTimeout` (default 300000 ms) - there is no per-hold timeout
option.

Check a hold:

```javascript
escrow.checkHold('task-1');
```

Release hold:

```javascript
escrow.release('task-1');
```

## Approvals

Require approval for sensitive operations.

Request approval (sig: `(operation, reason)`; no options object):

```javascript
const approval = escrow.requestApproval('delete', 'Delete all user data');
// auto-approved immediately when the op needs none:
//   { approved: true, reason: 'auto_approved' }
// otherwise:
//   { approvalId: '<hex>', approved: false }
```

### Approve

Approve an operation:

```javascript
escrow.approve(approval.approvalId, 'admin');
```

### Check

```javascript
escrow.checkApproval(approval.approvalId);
```

(There is no `reject` method - deny by simply not approving; the
approval stays `approved: false`.)

### Default Required

Operations that require approval by default:

```javascript
// Default: ['delete', 'admin', 'write:critical']
console.log(escrow.options.approvalRequired);
```

## Circuit Breaker

Integrate with service circuit breakers (crew-bus aware):

Check service:

```javascript
const isOpen = escrow.isOpen('payment-svc');
console.log(isOpen); // false (closed = OK)
```

Open circuit on repeated failures:

```javascript
for (let i = 0; i < 5; i++) {
    escrow.recordFailure('payment-svc');
}

console.log(escrow.isOpen('payment-svc')); // true
```

Record successes and reset:

```javascript
escrow.recordSuccess('payment-svc');
escrow.resetCircuit('payment-svc');   // via getBreaker().reset(service)
```

## Before Execute

Validate operation before execution:

```javascript
const result = await escrow.beforeExecute({
    agentId: 'agent-1',
    operation: 'read',
    cost: 5,
    service: 'db'
});

console.log(result.allowed); // true | false
console.log(result.reason);  // reason string on refusal
```

This is the main entry point - sandbox operations go through this
(async; `isOperationAllowed(op, ctx)` delegates to it).

## Quotas

Track quota usage per agent+operation pair. Quotas come from
`options.defaultQuota` + `options.quotaWindow` (defaults in the
constructor); there is no `setQuota()` method:

```javascript
// checkQuota(agentId, operation = 'default')
const { allowed, used, limit } = escrow.checkQuota('agent-1', 'api');

// record usage yourself
escrow.incrementQuota('agent-1', 'api');
```

The window resets automatically when `quotaWindow` elapses.

---
## Integration
Escrow integrates with sandbox:
```javascript
const sandbox = require('./lib/sandbox');
const s = sandbox.create({
    agentId: 'agent-1',
    budget: 10000
});
```
When sandbox runs operations:
```javascript
const result = s.write(() => doWork());
if (result.error) {
    console.log(result.code); // "BUDGET_EXCEEDED" | "APPROVAL_REQUIRED"
}
```
See [Sandbox](/vant/security/sandbox) for details.
---

## Related

- [Sandbox](/vant/security/sandbox) - Execution isolation
- [QoS](/vant/operations/qos) - Rate limiting and circuit breaking
- [Security](/vant/security/) - VAF and encryption