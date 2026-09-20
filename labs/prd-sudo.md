# Vant Sudo System — Product Requirements Document

**Version:** 1.0  
**Branch:** axolotl  
**Date:** 2026-09-19  
**Status:** Implemented (v0.8.6+)

---

## 1. Overview

The Vant Sudo system provides **time-based, whitelist-governed privilege escalation** for a deny-by-default sandbox architecture. It acts as a defense-in-depth layer between services (boot, network, storage, mcp, agents) and the capability sandbox, enabling controlled, auditable, time-bounded elevation of privileges.

### Design Principles
- **Deny-by-default**: All dangerous capabilities disabled at sandbox level
- **Least privilege**: Services request only what they need
- **Time-bounded**: All escalations expire (TTL per service)
- **Revalidation**: Auto-extend if service still needs it, auto-revoke if not
- **Whitelist governance**: Per-service policies define what's allowed
- **Auditability**: Full event trail for every escalation
- **Isolation**: Sudo separate from sandbox, sandbox delegates to sudo

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        SERVICES                               │
│  boot │ network │ storage │ mcp │ agents │ sync │ shell      │
└─────────────────────┬───────────────────────────────────────┘
                      │ sudo.escalate(taskId, scope, {service})
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      SUDO LAYER                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Whitelist   │  │ Escalation  │  │ Revalidation Loop   │  │
│  │ (per service)│  │ Engine      │  │ (30s interval)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │ sudo.can(taskId, scope)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      SANDBOX LAYER                            │
│  can(cap) → sudo.can() → static capabilities                 │
│  Deny-by-default: only read allowed by default               │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Whitelist Policies (ESCALATION_WHITELIST)

Defined in `lib/sudo.js:54-97`. Each service has a policy:

```javascript
const ESCALATION_WHITELIST = {
    boot: {
        allowedScopes: ['write', 'network', 'spawn', 'exec'],
        maxTTL: 300000,           // 5 minutes
        autoApprove: ['write', 'network'],
        requiresCallback: ['exec', 'spawn'],
        revalidate: true
    },
    network: {
        allowedScopes: ['network'],
        maxTTL: 600000,           // 10 minutes
        autoApprove: ['network'],
        requiresCallback: [],
        revalidate: true
    },
    storage: {
        allowedScopes: ['write'],
        maxTTL: 300000,           // 5 minutes
        autoApprove: ['write'],
        requiresCallback: [],
        revalidate: true
    },
    mcp: {
        allowedScopes: ['read', 'write', 'network', 'exec'],
        maxTTL: 180000,           // 3 minutes
        autoApprove: ['read'],
        requiresCallback: ['write', 'network', 'exec'],
        revalidate: false
    },
    agents: {
        allowedScopes: ['spawn', 'write'],
        maxTTL: 300000,           // 5 minutes
        autoApprove: [],
        requiresCallback: ['spawn', 'write'],
        revalidate: false
    },
    default: {
        allowedScopes: [],
        maxTTL: 60000,            // 1 minute
        autoApprove: [],
        requiresCallback: [],
        revalidate: false
    }
};
```

### Policy Fields
| Field | Type | Description |
|-------|------|-------------|
| `allowedScopes` | string[] | Scopes this service may request |
| `maxTTL` | number (ms) | Maximum time-to-live for escalations |
| `autoApprove` | string[] | Scopes granted immediately without callback |
| `requiresCallback` | string[] | Scopes requiring user callback approval |
| `revalidate` | boolean | Whether to auto-extend on expiry if still needed |

---

## 4. Escalation API

### `sudo.escalate(taskId, scope, options)`

```javascript
await sudo.escalate(taskId, 'write', {
    service: 'storage',           // Required: matches whitelist
    reason: 'writing brain file', // Audit trail
    ttl: 300000,                  // Optional: override default TTL
    autoRevalidate: true,         // Optional: override revalidation
    autoGrant: false,             // Optional: force grant (admin only)
    callback: (esc, approve) => {} // Required if scope in requiresCallback
});
```

### Response
```javascript
// Success (auto-approved)
{ granted: 'write', expiresAt: 1234567890, auto: true }

// Success (callback approved)
{ granted: 'write', expiresAt: 1234567890 }

// Pending (callback queued)
{ pending: 'write', expiresAt: 1234567890 }

// Denied
{ denied: 'write', reason: 'not_in_whitelist' | 'callback_required' | 'callback_denied' }
```

### Other Functions
| Function | Description |
|----------|-------------|
| `revalidateEscalation(taskId, escalation)` | Manual revalidation check |
| `startRevalidationLoop(intervalMs=30000)` | Background checker (30s default) |
| `stopRevalidationLoop()` | Stop background loop |
| `sudo.can(taskId, scope)` | Check if task has scope (used by sandbox) |
| `sudo.grant/revoke(taskId, scope)` | Direct grant/revoke (admin) |

---

## 5. Escalation Lifecycle

```
REQUEST
  │
  ├─► Check whitelist (service.allowedScopes)
  │     │
  │     ├─ NOT IN WHITELIST → DENY (audit: denied)
  │     │
  │     └─ IN WHITELIST
  │           │
  │           ├─ AUTO-APPROVE → GRANT immediately
  │           │     ├─ Set expiresAt = now + TTL
  │           │     ├─ Emit 'sudo:escalation_granted' (auto: true)
  │           │     └─ Return { granted, expiresAt, auto: true }
  │           │
  │           ├─ REQUIRES CALLBACK
  │           │     ├─ Has callback? → CALLBACK
  │           │     │     ├─ APPROVED → GRANT
  │           │     │     └─ DENIED → DENY (audit: callback_denied)
  │           │     └─ No callback → DENY (audit: callback_required)
  │           │
  │           └─ NEITHER → PENDING (queue for later)
  │
  ├─ EXPIRES (revalidation loop, 30s interval)
  │     │
  │     ├─ autoRevalidate=true → REVALIDATE
  │     │     ├─ Extend expiresAt by TTL
  │     │     └─ Emit 'sudo:escalation_revalidated'
  │     │
  │     └─ autoRevalidate=false → REVOKE
  │           ├─ Remove scope from task
  │           └─ Emit 'sudo:escalation_expired'
  │
  └─ REVOKE (manual or auto)
        └─ Remove scope from task.scopes
```

---

## 6. Audit Events

All escalation actions emit structured events:

| Event | Payload |
|-------|---------|
| `sudo:escalation_requested` | `{ taskId, scope, service, ttl, policy }` |
| `sudo:escalation_granted` | `{ taskId, scope, service, ttl, auto, expiresAt }` |
| `sudo:escalation_denied` | `{ taskId, scope, service, reason }` |
| `sudo:escalation_expired` | `{ taskId, scope, service }` |
| `sudo:escalation_revalidated` | `{ taskId, scope, service, newExpiresAt, revalidationCount }` |
| `sudo:escalation_revoked` | `{ taskId, scope, service, reason }` |

---

## 6. Service Integration Points

### Current Integrations (Implemented)
| Service | Integration | Scopes | Auto-Approve |
|---------|-------------|--------|--------------|
| **boot** | `boot.js:77-86` | write, network, spawn, exec | write, network |
| **sandbox** | `sandbox.js:655-665` | All via `can()` | N/A (delegates to sudo) |

### Required Integrations (From Sudo Integration Report - Full List)
| Service / Module | Required Scopes | Current Check Pattern | Recommended Fix |
|------------------|----------------|----------------------|-----------------|
| **network.js** | network | `sb.can('canNetwork')` line 345 | `await sudo.escalate(taskId, 'network', {service: 'network'})` before fetch |
| **storage.js** | write | `sb.can('canWrite')` lines 529, 107 | `await sudo.escalate(taskId, 'write', {service: 'storage'})` before writes |
| **shell.js** | exec | `sudo.can(taskId, 'exec')` + `sb.can('canExec')` | Add whitelist check; already uses sudo |
| **mcp.js** | write, network, exec | `sudo.can(taskId, 'compute:eval')` line 987 | Add `compute:eval` to whitelist; use security chain |
| **agents.js** / **agent-lifecycle.js** | spawn, write | `sb.can('canSpawn')` line 35; `sudo.can(agentId, 'spawn')` line 39 | `await sudo.escalate(taskId, 'spawn', {service: 'agents'})` before spawn/delegate |
| **sync.js** | write, network, commit, createBranch | `_checkNetwork()`, `_checkWrite()` lines 90, 134 | Add `canCommit`/`canCreateBranch` checks + sudo escalation |
| **brain.js** | write | `sandbox.can('canWrite')` line 225 | `await sudo.escalate(taskId, 'write', {service: 'storage'})` before writes |

### Additional Modules Requiring Sudo Integration (Direct Capability Checks)
These modules call `sb.can()` or `sandbox.canX()` directly and should delegate to `sandbox.can()` which checks sudo first:

| Module | Capability Checks | Lines | Fix |
|--------|-------------------|-------|-----|
| **tmp.js** | `canWrite`, `canRead`, `canDelete` | 87-89 | Use `sandbox.can('canWrite')` etc. |
| **agent-lifecycle.js** | `canSpawn` | 35 | Use `sandbox.can('canSpawn')` |
| **msg.js** | `canWrite` | 49, 149 | Use `sandbox.can('canWrite')` |
| **agent-internal.js** | `canWrite`, `canExecute`, `canSpawn` | 117-118, 163 | Already maps to sudo scopes |
| **shell.js** | `canExec` | 182, 288 | Already uses sudo for 'exec' |
| **storage.js** | `canRead`, `canWrite` | 497, 529 | Use `sandbox.can('canRead')` |
| **stream.js** | dynamic caps | 108 | Use `sandbox.can(cap)` |
| **brain.js** | `canRead`, `canWrite` | 210, 225, 359, 364, 369 | Use `sandbox.can()` |
| **prune.js** | `canWrite`, `canRead` | 46-61 | Use `sandbox.can('canWrite')` |
| **vaf.js** | `canRead`, `canWrite` | 63-76 | Use `sandbox.can()` |
| **webhooks.js** | `canNetwork` | 41-43 | Use `sandbox.can('canNetwork')` |
| **config.js** | `canRead` | 53-57 | Use `sandbox.can('canRead')` |
| **security.js** | `canRead`, `canWrite` | 54-67 | Use `sandbox.can()` |
| **resolution.js** | `canRead`, `canWrite` | 97-112 | Use `sandbox.can()` |
| **lineage.js** | `canWrite`, `canRead` | 36, 48 | Use `sandbox.can()` |
| **succession.js** | `canRead`, `canWrite` | 50-63 | Use `sandbox.can()` |
| **context.js** | `canRead`, `canWrite` | 101, 108 | Use `sandbox.can()` |
| **audit.js** | `canRead`, `canWrite` | 38-51 | Use `sandbox.can()` |
| **stego.js** | `canRead`, `canWrite` | 42-55 | Use `sandbox.can()` |
| **islands.js** | `canRead` | 49 | Use `sandbox.can('canRead')` |
| **forum.js** | `canWrite` | 538-540 | Use `sandbox.can('canWrite')` |
| **memory.js** | `canWrite`, `canRead` | 60, 70 | Use `sandbox.can()` |
| **schema.js** | `canRead` | 40-42 | Use `sandbox.can('canRead')` |
| **citations.js** | `canRead`, `canWrite` | 39-52 | Use `sandbox.can()` |
| **lock.js** | `canWrite` | 151 | Use `sandbox.can('canWrite')` |
| **teams.js** | dynamic caps | 123-124 | Use `sandbox.can()` |

### Modules with `_checkWrite()` / `_checkNetwork()` / `_checkExec()` Functions
These should escalate via sudo before operation:

| Module | Functions | Scopes Needed |
|--------|-----------|---------------|
| **citations.js** | `_checkWrite()` | write |
| **lineage.js** | `_checkWrite(userCtx, resource)` | write |
| **vaf.js** | `_checkWrite()` | write |
| **webhooks.js** | `_checkNetwork()` | network |
| **brain.js** | `_checkWrite(userCtx, resource)` | write |
| **resolution.js** | `_checkWrite()` (10 locations) | write |
| **cache.js** | `_checkWrite(userCtx, resource)` | write |
| **succession.js** | `_checkWrite()` | write |
| **audit.js** | `_checkWrite()` | write |
| **stego.js** | `_checkWrite()` | write |
| **sync.js** | `_checkWrite()`, `_checkNetwork()` | write, network |
| **vibe.js** | `_checkWrite()` | write |
| **lock.js** | `_checkWrite()` | write |
| **server.js** | `_checkNetwork()`, `_checkWrite()` | network, write |
| **storage.js** | `_checkWrite()`, `_checkWriteSafe()` | write |
| **geometry/quasicrystal.js** | `_checkWrite(userCtx, resource)` | write |
| **memory.js** | `_checkWrite(resource)` (6 locations) | write |
| **prune.js** | `_checkWrite()` | write |
| **security.js** | `_checkWrite()` | write |

### Missing Whitelist Scopes
The `ESCALATION_WHITELIST` needs these additional scopes:

| Missing Scope | Needed By | Current Capability |
|---------------|-----------|-------------------|
| `commit` | sync.js, remote.js, sandbox.js | `canCommit` (default: false) |
| `createBranch` | sync.js, remote.js, sandbox.js | `canCreateBranch` (default: false) |
| `compute:eval` | mcp.js (line 987) | Custom check, not in whitelist |
| `delete` | storage.js, brain.js | `canDelete` (default: false) |
| `admin` | Various | `canAdmin` (default: false) |

---

## 7. Capability Mapping

Sandbox capabilities → Sudo scopes (via `sandbox._capToScope()`):

| Sandbox Capability | Sudo Scope |
|-------------------|------------|
| `canRead` | `read` |
| `canWrite` | `write` |
| `canNetwork` | `network` |
| `canExec` | `exec` |
| `canSpawn` | `spawn` |
| `canCommit` | `commit` |
| `canCreateBranch` | `createBranch` |
| `canDelete` | `delete` |
| `canAdmin` | `admin` |

---

## 8. Default Deny-by-Default Posture

| Capability | Default | Notes |
|------------|---------|-------|
| `read` | ✅ true | Brain reads, searches |
| `load` | ✅ true | Brain loads |
| `list` | ✅ true | Brain lists |
| `exists` | ✅ true | Brain exists |
| `search` | ✅ true | Search operations |
| `canRead` | ✅ true | File reads |
| **`canWrite`** | ❌ false | Requires sudo escalation |
| **`canNetwork`** | ❌ false | Requires sudo escalation |
| **`canExec`** | ❌ false | Requires sudo escalation |
| **`canSpawn`** | ❌ false | Requires sudo escalation |
| **`canCommit`** | ❌ false | Requires sudo escalation |
| **`canCreateBranch`** | ❌ false | Requires sudo escalation |
| **`canDelete`** | ❌ false | Requires sudo escalation |
| **`canAdmin`** | ❌ false | Requires sudo escalation |

**DEFAULT_SCOPES:** `['read']` only

---

## 9. Revalidation Loop

```javascript
// Started by boot.js on init
sudo.startRevalidationLoop(30000); // 30 second interval

// Stopped on shutdown/reset
sudo.stopRevalidationLoop();

// Loop logic (every 30s):
for (each task) {
    for (each escalation) {
        if (now >= escalation.expiresAt) {
            revalidateEscalation(taskId, escalation);
        }
    }
}
```

---

## 10. Multi-Brain Support

Each brain can have sudo config:
```javascript
sudo.setBrainSudoConfig({ timeout: 300000 }); // per-brain TTL override
```

Retrieved via `sudo.getBrainSudoConfig()`.

---

## 11. Testing

```bash
# Run sudo tests
node test/sudo.test.js

# Run sandbox tests (verifies sudo integration)
node test/test-sandbox.js

# Run boot tests (verifies sudo escalation on init)
node test/boot.test.js
```

---

## 12. Future Enhancements (P3+)

- [ ] Persistent escalation audit log to disk
- [ ] Per-escalation rate limiting
- [ ] Escalation templates for common workflows
- [ ] Web UI for escalation management
- [ ] Integration with external auth (OAuth, LDAP)
- [ ] Escalation policies as code (version controlled)
- [ ] Automated revalidation with service health checks
- [ ] Metrics: escalation frequency, denial rates, TTL usage

---

## 13. References

- Implementation: `lib/sudo.js`
- Sandbox integration: `lib/sandbox.js:655-665`
- Boot integration: `lib/boot.js:77-86`
- Whitelist: `lib/sudo.js:54-97`
- Revalidation: `lib/sudo.js:357-417`
- Sudo Design Doc: `SUDO_DESIGN.md`
- Audit Findings: `AUDIT_FINDINGS.md`