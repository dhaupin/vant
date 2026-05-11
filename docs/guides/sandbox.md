---
version: 0.8.11
permalink: /guides/sandbox
layout: default
title: Sandbox
nav_order: 12
46
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
const sandbox = require('./lib/sandbox');

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

What an agent can do:

| Capability | Default | What |
|------------|---------|------|
| canRead | true | Read from brain, search |
| canWrite | true | Write to brain, commit |
| canNetwork | true | Call external APIs |
| canSpawn | false | Create sub-agents |
| canCommit | true | Commit to git |
| canCreateBranch | false | Create git branches |
| canDelete | false | Delete files/branches |
| canAdmin | false | Admin operations |

### Read Operations

Read operations go through the read quota:

```javascript
// Check if read is allowed
s.canRead(); // true | false

// Execute read operation
await s.read(() => brain.get('learnings', 'lesson-1'));
```

### Write Operations

Write operations go through write quota + lock:

```javascript
// Check if write is allowed
s.canWrite(); // true | false

// Execute write operation
await s.write(() => brain.write('lessons', 'new', 'content'));
```

## Network Restrictions

Restrict which domains an agent can call:

```javascript
const s = sandbox.create({
    allowedDomains: ['api.github.com', 'api.openai.com'],
    blockExternal: true  // block everything else
});
```

Attempting to call an unallowed domain:

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
| maxMemory | 100MB | Memory limit |

Query current usage:

```javascript
const stats = s.getStats();
console.log(stats.reads);     // reads this minute
console.log(stats.writes);    // writes this minute
console.log(stats.concurrent); // active operations
console.log(stats.budget);    // remaining budget
```

### Rate Limited Operations

Operations above quota are rejected:

```javascript
const result = await s.read(() => someOperation());
if (result.error) {
    console.log(result.code); // "RATE_LIMITED"
}
```

## Budget

Track operation costs:

```javascript
const s = sandbox.create({
    agentId: 'agent-1',
    budget: 10000
});

console.log(s.getBudget()); // 10000

// Operations deduct from budget
await s.write(() => doWork());
console.log(s.getBudget()); // 9999
```

Budget tracking uses the escrow system. See [Security](security) for details.

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
console.log(status.agentId);    // "agent-1"
console.log(status.capabilities); // { canRead: true, ... }
console.log(status.quota);     // { reads: 10, writes: 2 }
console.log(status.errors);  // recent errors
```

## Advanced

### Custom Capabilities

Extend capabilities:

```javascript
const s = sandbox.create({
    capabilities: {
        ...sandbox.DEFAULT_CAPABILITIES,
        canExecuteCode: true,
        canUseFilesystem: false
    }
});
```

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

## See Also

- [Security](security) - VAF and encryption
- [Runtime](runtime) - Programmatic API
- [Multi-Agent](multi-agent) - Branch and lock system