# Sudo Escalation Mechanism Design — Axolotl Branch

## Current State Analysis

### What Exists
- **Task-based scopes** (`createTask`, `can`, `grant`, `revoke`)
- **Escalation flow** (`escalate` with callback for user prompts)
- **Auto-scaling** (`grant` called on usage via `used()`)
- **Suggestion engine** (`suggest` based on history)
- **Locking** (`lock`/`unlock`/`isLocked`)
- **History tracking** (100 entries per task)
- **Multibrain configs** (per-brain sudo config with timeout)

### Critical Gaps
| Gap | Impact |
|-----|--------|
| **No time-based escalation TTL** | Escalations permanent until explicit revoke |
| **No revalidation** | No automatic re-check after escalation expires |
| **No whitelist per service** | Any task can request any scope |
| **No integration with sandbox** | Sandbox checks `can()` but no sudo→sandbox sync |
| **No boot/network/storage integration** | Services can't request escalation |
| **No audit trail persistence** | History lost on reset, no structured audit events |
| **No escalation policies** | No config for max TTL, allowed services, auto-approve rules |

---

## Proposed Design: Time-Based Escalation with Whitelists

### 1. Escalation with TTL & Auto-Revalidation

```javascript
// New escalation structure with TTL
async function escalate(taskId, scope, options = {}) {
    // options: { ttl: 300000, reason, autoRevalidate: true, service: 'boot' }
}
```

**Fields added to escalation record:**
- `ttl` (ms) - time-to-live for escalation
- `expiresAt` - absolute timestamp
- `autoRevalidate` - whether to re-check before expiry
- `service` - requesting service ('boot', 'network', 'storage', 'mcp', 'agents')
- `policy` - reference to whitelist policy that allowed it

### 2. Whitelist Configuration (per service)

```javascript
const ESCALATION_WHITELIST = {
    boot: {
        allowedScopes: ['write', 'network', 'spawn', 'exec'],
        maxTTL: 300000,           // 5 min
        autoApprove: ['write', 'network'],  // auto-grant these
        requiresCallback: ['exec', 'spawn'], // need explicit approval
        revalidate: true
    },
    network: {
        allowedScopes: ['network'],
        maxTTL: 600000,           // 10 min
        autoApprove: ['network'],
        revalidate: true
    },
    storage: {
        allowedScopes: ['write'],
        maxTTL: 300000,
        autoApprove: ['write'],
        revalidate: true
    },
    mcp: {
        allowedScopes: ['read', 'write', 'network', 'exec'],
        maxTTL: 180000,
        autoApprove: ['read'],
        requiresCallback: ['write', 'network', 'exec']
    },
    agents: {
        allowedScopes: ['spawn', 'write'],
        maxTTL: 300000,
        autoApprove: [],
        requiresCallback: ['spawn', 'write']
    },
    default: {
        allowedScopes: [],
        maxTTL: 60000,
        autoApprove: [],
        requiresCallback: []
    }
};
```

### 3. Revalidation Loop (Background)

```javascript
// New background checker - runs every 30s
function startRevalidationLoop(intervalMs = 30000) {
    return setInterval(() => {
        for (const [taskId, task] of _tasks) {
            for (const esc of task.escalated) {
                if (esc.expiresAt && Date.now() >= esc.expiresAt) {
                    // Expired - revoke unless auto-revalidate
                    if (esc.autoRevalidate) {
                        revalidateEscalation(taskId, esc);
                    } else {
                        revoke(taskId, esc.scope);
                        _emit('sudo:expired', { taskId, scope: esc.scope });
                    }
                }
            }
        }
    }, intervalMs);
}
```

### 4. Sandbox Integration

```javascript
// In sandbox.js - sync capabilities from sudo at check time
function can(cap) {
    const taskId = getCurrentTaskId();
    if (taskId && sudo.can(taskId, cap)) {
        return true;  // sudo override
    }
    return this.capabilities[cap] === true;
}
```

### 5. Service Integration Points

| Service | Integration | Escalation Trigger |
|---------|-------------|-------------------|
| **boot.js** | On init, request write/network/spawn/exec | `sudo.escalate(taskId, 'write', { service: 'boot' })` |
| **network.js** | Before fetch, if `!canNetwork()` | `sudo.escalate(taskId, 'network', { service: 'network' })` |
| **storage.js** | Before write, if `!canWrite()` | `sudo.escalate(taskId, 'write', { service: 'storage' })` |
| **mcp.js** | In `_runSecurityChain` for write tools | `sudo.escalate(taskId, scope, { service: 'mcp' })` |
| **agents.js** | Before `spawn()`, `delegate()` | `sudo.escalate(taskId, 'spawn', { service: 'agents' })` |

### 6. Audit Events

```javascript
// New audit events
'sudo:escalation_requested'  // { taskId, scope, service, ttl, policy }
'sudo:escalation_granted'    // { taskId, scope, service, ttl, auto }
'sudo:escalation_denied'     // { taskId, scope, service, reason }
'sudo:escalation_expired'    // { taskId, scope }
'sudo:escalation_revalidated' // { taskId, scope, newTTL }
'sudo:escalation_revoked'    // { taskId, scope, reason }
```

---

## Implementation Plan

### Phase 1: Core Escalation with TTL (lib/sudo.js)
- Add `ttl`, `expiresAt`, `autoRevalidate`, `service` to escalation records
- Add `ESCALATION_WHITELIST` config
- Modify `escalate()` to enforce whitelist, set TTL
- Add `revalidateEscalation()` function
- Add `startRevalidationLoop()` / `stopRevalidationLoop()`

### Phase 2: Sandbox Integration (lib/sandbox.js)
- Add `getCurrentTaskId()` helper
- Modify `can()` to check sudo before capabilities
- Add `syncFromSudo(taskId)` to sync capabilities from sudo grants

### Phase 3: Service Integration (lib/boot.js, lib/network.js, lib/storage.js, lib/mcp.js, lib/agents.js)
- Each service calls `sudo.escalate()` before operations that need elevated scopes
- Pass `service` identifier for whitelist matching

### Phase 4: Background Revalidation
- Add `startRevalidationLoop()` called at boot
- Add `stopRevalidationLoop()` for cleanup

### Phase 5: Audit & Persistence
- Emit structured audit events
- Add `getAuditLog()` for escalation history
- Persist escalations to disk (optional)

---

## Security Properties

| Property | Implementation |
|----------|----------------|
| **Least privilege** | Default scopes = `['read']`, escalation required for all else |
| **Time-bounded** | All escalations have TTL (default 5 min, configurable per service) |
| **Revalidation** | Auto-revalidate if service still needs it, else auto-revoke |
| **Whitelist enforcement** | Only allowed scopes per service can be escalated |
| **Isolation** | Sudo separate from sandbox, sandbox delegates to sudo |
| **Auditability** | All escalations logged with service, TTL, policy, outcome |
| **Revocability** | Any escalation can be revoked at any time |

---

## Integration Example: Boot with Full Privileges

```javascript
// lib/boot.js - init() gets full privileges via sudo
async function init(options = {}) {
    const { taskId = 'default', scopes = ['read'], debug = false } = options;
    
    // Create task with minimal scopes
    sudo.createTask(taskId, scopes);
    
    // Request escalation for boot operations
    const bootPrivileges = ['write', 'network', 'spawn', 'exec'];
    for (const scope of bootPrivileges) {
        await sudo.escalate(taskId, scope, {
            service: 'boot',
            reason: 'Boot initialization requires full privileges',
            autoGrant: true  // boot is whitelisted for auto-approve
        });
    }
    
    // ... rest of boot
}
```

This gives boot the privileges it needs while maintaining deny-by-default for everything else, with time-bounded, auditable, revalidated escalations.