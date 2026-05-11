---
version: 0.8.11
permalink: /escrow.md/escrow
layout: default
title: Escrow
nav_order: 51
18
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

Get cost for an operation:

```javascript
console.log(escrow.getCost('write')); // 5
```

## Holds

Hold execution until conditions are met.

Create a hold:

```javascript
const holdId = escrow.hold('task-1', {
    until: 'user_confirmation',
    timeout: 60000  // 60 seconds
});
```

Check if on hold:

```javascript
const canProceed = escrow.canProceed('task-1');
console.log(canProceed); // false
```

Release hold:

```javascript
escrow.release('task-1');
```

### Hold Options

| Option | Default | What |
|--------|---------|------|
| until | required | Release condition |
| timeout | 300000 | Max wait time (ms) |

## Approvals

Require approval for sensitive operations.

Request approval:

```javascript
const approval = escrow.requestApproval('delete', 'Delete all user data', {
    approver: 'admin',
    timeout: 30000
});

console.log(approval.id);      // approval ID
console.log(approval.state);  // "pending"
```

### Approve

Approve an operation:

```javascript
escrow.approve(approval.id, 'admin');
```

### Reject

Reject an operation:

```javascript
escrow.reject(approval.id, 'Not approved');
```

### Default Required

Operations that require approval by default:

```javascript
// Default: ['delete', 'admin', 'write:critical']
console.log(escrow.options.approvalRequired);
```

## Circuit Breaker

Integrate with service circuit breakers.

Check service:

```javascript
const isOpen = escrow.isOpen('payment-svc');
console.log(isOpen); // false (closed = OK)
```

Open circuit on repeated failures:

```javascript
// After 5 failures, circuit opens
for (let i = 0; i < 5; i++) {
    escrow.recordFailure('payment-svc');
}

console.log(escrow.isOpen('payment-svc')); // true
```

Reset circuit:

```javascript
escrow.resetCircuit('payment-svc');
```

## Before Execute

Validate operation before execution:

```javascript
const result = escrow.beforeExecute({
    agentId: 'agent-1',
    operation: 'read',
    cost: 5,
    service: 'db'
});

console.log(result.allowed); // true | false
console.log(result.reason); // "budget_available" | "budget_exceeded" | "hold" | "approval_required"
```

This is the main entry point - all sandbox operations go through this.

## Quotas

Track quota usage per service.

Set quota:

```javascript
escrow.setQuota('api', {
    limit: 1000,
    window: 3600000  // 1 hour
});
```

Check quota:

```javascript
const { allowed, remaining } = escrow.checkQuota('api');
```

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

See [Sandbox]/security/sandbox for details.

---

## See Also

- [Sandbox]/security/sandbox - Execution isolation
- [QoS]/operations/qos - Rate limiting and circuit breaking
- [Security]/tutorials/security - VAF and encryption