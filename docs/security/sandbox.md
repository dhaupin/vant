---
version: 0.8.6
permalink: /security/sandbox
layout: default
title: Sandbox
nav_order: 67
---

# Sandbox

Execution isolation layer for Vant agents. The sandbox controls what operations an agent can perform.

## What

The sandbox is Vant's "keeper" layer. It provides:

- Read/write/network separation
- Quotas (rate limits)
- Budget enforcement
- Network domain restrictions
- Capability gating

## Quick Start

Create a sandboxed agent:

```javascript
const sandbox = require('./lib/sandbox');   // also: require('vant').sandbox (real getter)

const s = sandbox.create({
    agentId: 'agent-1',
    maxConcurrent: 3,
    readQuota: 100,      // reads per minute
    writeQuota: 20,      // writes per minute
    budget: 10000,      // max operations
    allowedDomains: ['api.github.com'],
    capabilities: {
        canRead: true,
        canWrite: false,
        canNetwork: true,
        canSpawn: false
    }
});
```

## Capabilities

What an agent can do. The defaults below are the EXPLICIT-CONFIG
defaults in `DEFAULT_CAPABILITIES` (lib/sandbox.js:304): the moment you
pass a `capabilities` option, everything not granted is denied. An
UNTOUCHED sandbox instead allows (with a one-time warning) so CLI
commands work out of the box:

| Capability | Explicit default | What |
|------------|-----------------|------|
| read / load / list / exists / search | true | Brain reads, corpus load, search |
| write | **false** | Brain writes, commits |
| canRead | true | File reads |
| canWrite | **false** | File writes |
| canNetwork | **false** | External API calls |
| canExec | **false** | Shell execution |
| canSpawn | **false** | Sub-agents |
| canCommit | **false** | Git commits |
| canCreateBranch | **false** | Git branches |
| canDelete | **false** | Deletions |
| canAdmin | **false** | Admin operations |
| canTrade | **false** | Knowledge-market trades |

### Read Operations

Read operations go through the read quota:

```javascript
// Check a capability
s.can('canRead');    // true | false (canRead/canWrite also exist in the
                     // gate chain - see lib/sandbox.js)

// Execute read operation
await s.read(() => brain.get('learnings', 'lesson-1'));
```

### Write Operations

Write operations go through write quota + optional lock:

```javascript
// Check a capability
s.can('canWrite');

// Execute write operation
await s.write(() => brain.write('lessons', 'new', 'content'));
```

Wrapper methods on the class: `read`, `write`, `network`, `spawn`,
`commit` (each with its own escrow cost), plus raw `execute(op, ctx)`.

## Network Restrictions

Restrict which domains an agent can call (empty allowlist = no domain
filtering is applied by the sandbox itself; network.js enforces what is
set):

```javascript
const s = sandbox.create({
    allowedDomains: ['api.github.com', 'api.openai.com']
});
```

Call an unallowed domain:

```javascript
const allowed = s.isDomainAllowed('https://evil.com');
console.log(allowed); // false
```

## Quotas

The sandbox enforces quotas:

| Quota | Default | What |
|-------|---------|------|
| maxConcurrent | 3 | Simultaneous operations |
| readQuota | 100/min | Read rate limit |
| writeQuota | 20/min | Write rate limit |
| maxMemory | 100MB | Memory ceiling |

Query current usage:

```javascript
const stats = s.getStatus();
console.log(stats.reads);      // reads this session
console.log(stats.writes);     // writes this session
console.log(stats.active);     // active operations
console.log(s.getBudgetStatus());  // escrow budget
```

### Rate Limited Operations

Operations above quota THROW (coded errors, not {error} returns):

```javascript
try {
    await s.read(() => someOperation());
} catch (e) {
    console.log(e.code);  // e.g. SANDBOX_* codes; retryable flag attached
}
```

## Budget

Track operation costs:

```javascript
const s = sandbox.create({
    agentId: 'agent-1',
    budget: 10000
});

// Budget delegates to the escrow system
console.log(s.getBudgetStatus());

// Operations deduct from the agent's escrow budget
await s.write(() => doWork());
```

Budget exceeding throws `SANDBOX_BUDGET_EXCEEDED`. See
[Escrow](/vant/security/escrow) for the spending API.

## Multi-Agent

Isolate agents from each other:

```javascript
// Agent A - can read but not write
const agentA = sandbox.create({
    agentId: 'agent-a',
    capabilities: { canWrite: false }
});

// Agent B - full access
const agentB = sandbox.create({
    agentId: 'agent-b',
    capabilities: { canRead: true, canWrite: true }
});

// Each has separate budget
agentA.write(() => doWork());
agentB.write(() => doWork());

console.log(agentA.getBudget()); // separate
console.log(agentB.getBudget()); // separate
```

## Lock Requirement

Require lock for write operations:

```javascript
const s = sandbox.create({
    agentId: 'agent-1',
    requireLock: true  // must acquire lock before write
});

// Without lock
const result = await s.write(() => doWork());
if (result.error) {
    console.log(result.code); // "LOCK_REQUIRED"
}
```

## Status

Get sandbox status:

```javascript
const status = s.getStatus();
// { active, reads, writes, uptime } - operation counters

console.log(s.getErrors());          // recent errors
console.log(s.getCapabilities());    // capability snapshot
console.log(s.getOperationHistory()); // what ran
```

## Advanced

### Custom Capabilities

Extend capabilities:

```javascript
const s = sandbox.create({
    capabilities: {
        ...sandbox.DEFAULT_CAPABILITIES,
        canTrade: true   // real extra capability in the model (deny-by-default)
    }
});
```

There are no `canExecuteCode`/`canUseFilesystem` capabilities in the
model - the declared set is what the gate checks (see
DEFAULT_CAPABILITIES above).

### Custom Scopes

Limit which operation scopes are allowed:

```javascript
const s = sandbox.create({
    scopes: ['read', 'write', 'network']
});
```

### Timeout

Set operation timeout:

```javascript
const s = sandbox.create({
    timeout: 30000  // 30 seconds
});
```

---
## Related
- [Security](/vant/security/) - VAF and encryption
- [Runtime](/vant/runtime/runtime) - Programmatic API
- [Multi-Agent](/vant/multi-agent/agents) - Branch and lock system