# Vant Security Model PRD

> **Defense-in-Depth Security Architecture** — deny-by-default, capability-based access, time-bounded sudo escalation with audit trail

---

## 1. Overview

### Purpose
This document specifies the security model for Vant's axolotl branch (v0.8.6+). The architecture implements **defense-in-depth** through five sequential security layers, a time-bounded sudo escalation system, and comprehensive audit logging.

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Deny-by-default** | Only `read` allowed without explicit escalation |
| **Least privilege** | Capabilities granted per-task, time-bounded |
| **Explicit escalation** | All dangerous operations require sudo with whitelist |
| **Audit everything** | Every security decision logged with context |
| **No silent failures** | Security checks throw on denial, never silently allow |

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Remote Code Execution | No dynamic `require()`, schema validation on all inputs |
| Path Traversal | `vaf.validateSafePath()` at all file operations |
| Prototype Pollution | `Object.create(null)`, `sanitizeObject()`, deep freeze |
| Symlink Escape | `O_NOFOLLOW \| O_EXCL` in atomic writes |
| SSRF | `network.isDomainAllowed()` blocks private IPs |
| Auth Bypass | Full security chain on all agent operations |
| TOCTOU | Direct read + ENOENT catch, no `fs.access` → read |

---

## 2. Security Layers (Execution Order)

```
Request → Sandbox → VAF → QoS → Escrow → RLS → Operation
```

### 2.1 Sandbox (Capability Gates)
**File:** `lib/sandbox.js`

The sandbox is the **first and primary gate**. All capability checks route through `sandbox.can(capability)`.

#### Default Capabilities (Deny-by-Default)
```javascript
const DEFAULT_CAPABILITIES = {
    // Brain operations
    read: false,
    write: false,
    load: false,
    list: false,
    exists: false,
    search: false,
    // System operations
    canRead: false,
    canWrite: false,
    canNetwork: false,
    canExec: false,
    canSpawn: false,
    canCommit: false,
    canCreateBranch: false,
    canDelete: false,
    canAdmin: false,
    // Brain files
    identity: false,
    start: false,
    goals: false,
    learnings: false
};
```

**Only `canRead` is `true` by default** in `sandbox.create({})`.

#### Capability Mapping
| Capability | Sudo Scope | Description |
|------------|------------|-------------|
| `canRead` | `read` | Read files/brain |
| `canWrite` | `write` | Write files/brain |
| `canNetwork` | `network` | Outbound HTTP/git |
| `canExec` | `exec` | Execute shell commands |
| `canSpawn` | `spawn` | Spawn child processes |
| `canCommit` | `commit` | Git commit |
| `canCreateBranch` | `createBranch` | Git branch operations |
| `canDelete` | `delete` | Delete files |
| `canAdmin` | `admin` | Full administrative access |

#### API
```javascript
// Check capability (checks sudo first, then static caps)
sandbox.can('canWrite')  // → boolean

// Create sandbox with explicit capabilities
const sb = sandbox.create({ canWrite: true, canNetwork: true });

// Register brain handlers (for brain.js integration)
sandbox.registerBrainHandler('read', async (name) => { ... });
sandbox.registerBrainHandler('write', async (name, content) => { ... });
sandbox.registerBrainHandler('exists', async (name) => { ... });
sandbox.registerBrainHandler('list', async () => { ... });
```

### 2.2 VAF (Input Validation)
**File:** `lib/vaf.js`

Validates ALL external input before it reaches business logic.

#### Protections
| Attack Vector | Mitigation |
|---------------|------------|
| Path traversal | `validateSafePath()` - blocks `../`, absolute paths, encoded traversal |
| Script injection | Iterative URL decode, blocks `<script>`, `{{constructor}}`, etc. |
| Unicode attacks | NFC normalization, HTML entity decoding, control char removal |
| Prototype pollution | `sanitizeObject()` - strips `__proto__`, `constructor`, `prototype` |
| Oversized input | `checkInputSize()` - 1MB default limit |

#### API
```javascript
// Validate and sanitize
vaf.check(input, schema);
vaf.validateSafePath(userPath);
vaf.sanitizeObject(userObject);  // Returns Object.create(null) + deep freeze

// Content validation
vaf.checkContent(input, { maxLength: 10000, allowHTML: false });
```

### 2.3 QoS (Quality of Service)
**File:** `lib/qos.js`

Protects against resource exhaustion and cascade failures.

#### Components
| Component | Purpose |
|-----------|---------|
| `RateLimiter` | Sliding window per-client + global limit |
| `CircuitBreaker` | Fail-fast on repeated failures (full mode with persistence) |
| `Bulkhead` | Concurrency isolation (max concurrent operations) |
| `Throttler` | Function call rate limiting |
| `Debouncer` | Function call debouncing |

#### API
```javascript
const qos = new QoS({ maxPerMinute: 60, concurrency: 10 });

await qos.check(clientId, 'read');  // Throws if rate limited
await qos.execute(async () => { ... });  // Runs through bulkhead + circuit breaker
```

### 2.4 Escrow (Operation Approval)
**File:** `lib/escrow.js`

Budget-based approval for expensive operations.

#### API
```javascript
// Check if operation can proceed
escrow.canSpend('sync', 10);  // → boolean

// Spend budget
escrow.spend('sync', 10);

// Refund on failure
escrow.refund('sync', 10);
```

### 2.5 RLS (Row-Level Security)
**File:** `lib/rls.js`

Per-resource access control with user context.

#### API
```javascript
// Check access for specific resource
rls.checkRead(userCtx, 'brain:identity');
rls.checkWrite(userCtx, '_sync:provider:github');

// In modules
_checkRead(userCtx, 'resource');
_checkWrite(userCtx, 'resource');
```

---

## 3. Sudo System (Time-Based Escalation)

**File:** `lib/sudo.js`

The sudo system provides **time-bounded privilege escalation** governed by a whitelist.

### 3.1 Core Concepts

| Concept | Description |
|---------|-------------|
| **Task** | Unit of work with associated scopes |
| **Scope** | Permission category (read, write, network, etc.) |
| **Whitelist** | Service-specific allowed scopes |
| **TTL** | Time-to-live for escalation (default 5 min) |
| **Revalidation** | Background loop extends active escalations |
| **Audit** | Every escalation logged with context |

### 3.2 ESCALATION_WHITELIST

```javascript
const ESCALATION_WHITELIST = {
    boot: {
        allowedScopes: ['write', 'network', 'spawn', 'exec', 'compute:eval'],
        maxTTL: 300000,
        autoApprove: ['write', 'network', 'spawn', 'exec', 'compute:eval'],
        requiresCallback: [],
        revalidate: true
    },
    network: {
        allowedScopes: ['network'],
        maxTTL: 180000,
        autoApprove: ['network'],
        requiresCallback: [],
        revalidate: true
    },
    storage: {
        allowedScopes: ['write', 'delete'],
        maxTTL: 300000,
        autoApprove: ['write'],
        requiresCallback: ['delete'],
        revalidate: true
    },
    mcp: {
        allowedScopes: ['read', 'write', 'network', 'exec', 'compute:eval', 'admin'],
        maxTTL: 180000,
        autoApprove: ['read'],
        requiresCallback: ['write', 'network', 'exec', 'compute:eval', 'admin'],
        revalidate: false
    },
    agents: {
        allowedScopes: ['spawn', 'write'],
        maxTTL: 300000,
        autoApprove: [],
        requiresCallback: ['spawn', 'write'],
        revalidate: false
    },
    sync: {
        allowedScopes: ['write', 'network', 'commit', 'createBranch'],
        maxTTL: 300000,
        autoApprove: ['write', 'network'],
        requiresCallback: ['commit', 'createBranch'],
        revalidate: true
    },
    default: {
        allowedScopes: ['admin'],
        maxTTL: 600000,
        autoApprove: [],
        requiresCallback: ['admin'],
        revalidate: true
    }
};
```

### 3.3 API

```javascript
// Request escalation
await sudo.escalate(taskId, 'write', { 
    service: 'storage', 
    ttl: 300000,
    autoRevalidate: true,
    reason: 'Need to write brain file'
});

// Check if task has scope (checks sudo first)
sudo.can(taskId, 'write');  // → boolean

// Manual revocation
sudo.revoke(taskId, 'write');

// Revalidate specific escalation
sudo.revalidateEscalation(taskId, 2000);

// Background revalidation loop (30s default)
sudo.startRevalidationLoop(30000);
sudo.stopRevalidationLoop();

// Cleanup task
sudo.deleteTask(taskId);

// Get task state
sudo.getTask(taskId);

// Audit log via events
event.on('sudo:escalation_requested', (data) => { ... });
event.on('sudo:escalation_granted', (data) => { ... });
event.on('sudo:escalation_denied', (data) => { ... });
event.on('sudo:escalation_revalidated', (data) => { ... });
event.on('sudo:escalation_expired', (data) => { ... });
```

### 3.4 Sandbox Integration

The sandbox's `can()` method checks sudo **first**:

```javascript
// In sandbox.js
function can(capability) {
    // 1. Check sudo escalation for current task
    const taskId = _getCurrentTaskId();
    if (taskId && sudo && sudo.can(taskId, _capToScope(capability))) {
        return true;
    }
    
    // 2. Fall back to static capabilities
    return DEFAULT_CAPABILITIES[capability] === true;
}
```

**Capability → Scope Mapping:**
```javascript
_capToScope: {
    canWrite: 'write',
    canNetwork: 'network',
    canExec: 'exec',
    canSpawn: 'spawn',
    canCommit: 'commit',
    canCreateBranch: 'createBranch',
    canDelete: 'delete',
    canAdmin: 'admin'
}
```

---

## 4. Boot Integration

**File:** `lib/boot.js`

Boot auto-escalates privileges at startup for out-of-box functionality.

### 4.1 Startup Escalation
```javascript
// In boot.init()
const taskId = sudo.createTask('boot-' + Date.now(), ['read']);
await sudo.escalate(taskId, 'write',   { service: 'boot', autoGrant: true });
await sudo.escalate(taskId, 'network', { service: 'boot', autoGrant: true });
await sudo.escalate(taskId, 'spawn',   { service: 'boot', autoGrant: true });
await sudo.escalate(taskId, 'exec',    { service: 'boot', autoGrant: true });

// Start revalidation loop
sudo.startRevalidationLoop(30000);
```

### 4.2 Revalidation Loop
- Runs every 30s
- Checks all escalated scopes with `autoRevalidate: true`
- Extends expiration to policy `maxTTL` if still needed
- Revokes expired non-revalidated scopes

---

## 5. Fixed Vulnerabilities (P0-P2 Audit)

### P0 - Critical (10 Fixed)
| # | Vulnerability | Fix |
|---|---------------|-----|
| 1 | `islands.save()` undefined `getBrain()` | Use `Storage.get('island')` |
| 2 | `islands.hydrate()` missing `await` | Added async/await |
| 3 | `sync.js` missing `userCtx` | Pass `SYSTEM_USER_CTX` |
| 4 | `sync.js` undefined `audit` | Import `audit` module |
| 5 | `remote.js` missing `errors` import | Import `error` module |
| 6 | `mcp.js` arbitrary `require()` RCE | Registered tools only |
| 7 | `storage.js` `ConfigStorage` `require()` RCE | `fs.readFileSync` + `JSON.parse` |
| 8 | `transform.js` path traversal | `vaf.validateSafePath()` |
| 9 | `sandbox.js` allow-by-default | Deny-by-default for all caps |
| 10 | `brain.js` 14 TOCTOU races | Direct read + ENOENT catch |

### P1 - High (10 Fixed)
| # | Vulnerability | Fix |
|---|---------------|-----|
| 11 | Path containment missing | `vaf.validateSafePath()` everywhere |
| 12 | Prototype pollution (10 paths) | `vaf.sanitizeObject()` + `Object.create(null)` |
| 13 | `agents.delegateAsync` no security | Full security chain + Map fix |
| 14 | MCP schema not enforced | `vaf.validateSchema()` at dispatch |
| 15 | VAF encoding/Unicode gaps | Iterative decode, NFC, HTML entities |
| 16 | `atomicWrite` symlink escape | `O_NOFOLLOW \| O_EXCL` |
| 17 | `readRaw`/`writeRaw` bypass | REMOVED entirely |
| 18 | Format transformer corruption | Preserve raw, store parsed separately |
| 19 | Backup undefined password | Async with secret fallback |
| 20 | Sync guard not released | try/finally on all functions |

### P2 - Architecture (10 Fixed)
| # | Fix |
|---|-----|
| 21 | Brain mode consolidation (5→1) |
| 22 | Islands manifest cache invalidation |
| 23 | Sync actual pull + brain data |
| 24 | Sync 3-way merge with conflicts |
| 25 | 30s provider timeouts |
| 26 | Per-agent AgentContext isolation |
| 27 | Atomic writes shared utility |
| 28 | Backup SHA256 per file + manifest |
| 29 | VAF prototype pollution fix |
| 30 | Agents split into 6 modules |

---

## 6. Sandbox API Reference

### Module-Level Functions
```javascript
// Create sandbox instance
const sb = sandbox.create({ canRead: true, canWrite: true });

// Capability checks (checks sudo first)
sb.can('canWrite');      // → boolean
sb.can('canNetwork');    // → boolean
sb.can('canExec');       // → boolean
// ... all capabilities

// Brain handlers
sandbox.registerBrainHandler('read', handler);
sandbox.registerBrainHandler('write', handler);
sandbox.registerBrainHandler('exists', handler);
sandbox.registerBrainHandler('list', handler);

// Legacy (deprecated - use sb.can())
sandbox.canRead();
sandbox.canWrite();
sandbox.canNetwork();
sandbox.canExec();
sandbox.canSpawn();
```

### Static Access (for CLI/bin scripts)
```javascript
// Module-level checks (use _currentTaskId for sudo context)
global._currentTaskId = 'my-task';
sandbox.can('canWrite');  // Checks sudo for _currentTaskId
```

---

## 7. Audit Trail

All security events emitted via event system:

```javascript
const event = require('./lib/event');

// Sudo events
event.on('sudo:escalation_requested', (data) => { ... });
event.on('sudo:escalation_granted', (data) => { ... });
event.on('sudo:escalation_denied', (data) => { ... });
event.on('sudo:escalation_revalidated', (data) => { ... });
event.on('sudo:escalation_expired', (data) => { ... });

// Sandbox events
event.on('sandbox:capability_checked', (data) => { ... });
event.on('sandbox:capability_denied', (data) => { ... });

// VAF events
event.on('vaf:path_traversal_blocked', (data) => { ... });
event.on('vaf:script_injection_blocked', (data) => { ... });
event.on('vaf:prototype_pollution_blocked', (data) => { ... });

// QoS events
event.on('qos:rate-limit', (data) => { ... });
event.on('qos:circuit-open', (data) => { ... });
```

### Audit Module (`lib/audit.js`)
```javascript
audit.info('[Security] Escalation granted', { taskId, scope, service });
audit.warn('[Security] Rate limit exceeded', { clientId });
audit.error('[Security] Path traversal attempt', { path, userId });
```

---

## 8. Migration Guide (Allow-by-Default → Deny-by-Default)

### Before (v0.8.5)
```javascript
// Capabilities allowed by default
const sb = sandbox.create();  // canRead, canWrite, canNetwork all true
if (sb.canWrite()) { ... }  // Works without setup
```

### After (v0.8.6+)
```javascript
// Capabilities denied by default
const sb = sandbox.create();  // Only canRead true

// Option 1: Explicit capabilities
const sb = sandbox.create({ 
    canRead: true, 
    canWrite: true, 
    canNetwork: true 
});

// Option 2: Sudo escalation (preferred for runtime)
await sudo.escalate(taskId, 'write', { service: 'storage', autoGrant: true });
sb.can('canWrite');  // → true (checks sudo)

// Option 3: Service integration (auto)
await storage.write('brain', 'name', data);  // Handles escalation internally
```

### Migration Checklist
- [x] Audit all `sandbox.canX()` calls → migrate to `sandbox.can('capability')` — DONE (axolotl `8dcff83`): module-level canX() now route through can(cap), all 56 call sites inherit sudo verdicts
- [x] Add `service` parameter to operations needing escalation — DONE (axolotl `fc2b314`): both MCP escalate handlers tagged; storage.js + vant_storage_* were already tagged
- [x] Update tests to configure sandbox or mock sudo — DONE (axolotl `3dca7a2` + existing suites): orgflow/security-hardening already use setScopes+setCapabilities; CLI gates verified both postures
- [x] Verify CLI scripts use `_checkWrite()` pattern with sudo — DONE (axolotl `3dca7a2`): clean/snapshot/compress/succession/bump gates wired; 12 dead-helper CLIs noted for cleanup
- [x] Update documentation/examples — DONE (axolotl `73778c1`): docs/essential/sudo.md (policy table, grant UX, audit events)

---

## 9. Configuration

### config.ini
```ini
[security]
# Sandbox
sandbox.default_read = true
sandbox.default_write = false
sandbox.default_network = false
sandbox.default_exec = false
sandbox.default_spawn = false
sandbox.default_commit = false
sandbox.default_create_branch = false
sandbox.default_delete = false
sandbox.default_admin = false

# Sudo
sudo.revalidation_interval = 30000
sudo.default_ttl = 300000
sudo.max_ttl = 600000

# VAF
vaf.max_input_size = 1048576
vaf.strict_unicode = true

# QoS
qos.max_per_minute = 60
qos.max_concurrent = 10
qos.circuit_threshold = 5
qos.circuit_timeout = 60000

# Escrow
escrow.sync_budget = 100
escrow.network_budget = 50
```

---

## 10. Summary

| Layer | File | Key Feature |
|-------|------|-------------|
| Sandbox | `lib/sandbox.js` | Deny-by-default, sudo integration |
| VAF | `lib/vaf.js` | Path traversal, injection, pollution protection |
| QoS | `lib/qos.js` | Rate limit, circuit breaker, bulkhead |
| Escrow | `lib/escrow.js` | Operation budget |
| RLS | `lib/rls.js` | Per-resource access |
| Sudo | `lib/sudo.js` | Time-bounded escalation, whitelist, audit |
| Boot | `lib/boot.js` | Auto-escalation, revalidation loop |

**All vulnerabilities from P0-P2 audit addressed. Production-ready with defense-in-depth.**