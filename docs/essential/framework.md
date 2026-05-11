---
title: 4-Layer Framework
layout: docs
slug: framework
description: VAF → Sandbox → QoS → Security at same global scope
---

# Vant 4-Layer Framework

> The 4-layer operational stack at the same global scope

## Architecture

```
┌───────────────────────────────────────────────────────┐
│           GLOBAL OPERATIONAL LAYERS                 │
├───────────────────────────────────────────────────────┤
│  VAF      →  Input validation firewall            │
│  Sandbox →  Execution isolation                   │
│  QoS      →  Rate limits, circuit breakers          │
│  Security → Auth, encryption, posture             │
│  API      →  Unified interface (CLI/MCP/headless) │
│  Escrow   →  Budget tracking, holds (placeholder)  │
└───────────────────────────────────────────────────────┘
```

All 6 layers run at the **same global scope** - no nested boxes, just layered defenses.

## Layer Details

### Layer 1: VAF (lib/vaf.js)
- Input validation firewall
- Validates what comes IN
- Content filtering, path traversal protection
- Rate limiting per IP
- Functions: `check()`, `sanitize()`, `isBlocked()`

### Layer 2: Sandbox (lib/sandbox.js)  
- Execution isolation
- Controls WHERE operations run
- **Read operations** (picking up): 100/min quota, 3 concurrent
- **Write operations** (doing): 20/min quota, serialized, optional lock
- Network domain restrictions
- Functions: `read()`, `write()`, `execute()`

### Layer 3: QoS (lib/protection.js)
- Quality of Service
- Controls HOW FAST/FAIR
- Circuit breakers
- Concurrency limits
- Timeouts
- Functions: `withTimeout()`, `canProceed()`, `isCircuitOpen()`

#### Circuit Breakers

Vant uses file-based circuit breakers that persist across restarts:

| File | Purpose | Module |
|------|---------|--------|
| `.circuit-sync.json` | Sync operation state | `lib/sync.js` |
| `.circuit-network.json` | Network connectivity | `lib/network.js` |
| `.circuit-escrow.json` | Budget/escrow state | `lib/escrow.js` |
| `.circuit-vaf.json` | VAF blocked IPs | `lib/vaf.js` |
| `.circuit-auth.json` | Auth lockouts | `lib/auth.js` |

**Naming Convention**: `.circuit-<name>.json`

All circuit files are ignored via `.circuit*.json` in `.gitignore`.

#### Lock System

Vant uses file-based locks for multi-agent coordination:

| Pattern | Purpose | Module |
|---------|---------|--------|
| `.lock-brain.json` | Brain acquisition lock | `lib/lock.js` |
| `.lock-<id>.json` | Storage locks | `lib/storage.js` |
| `.brain-lock-token` | Legacy brain token (unused) | - |

**Naming Convention**: `.lock-<name>.json`

Locks directory `.locks/` is ignored in `.gitignore`.

### Layer 4: Security (lib/security.js)
- Security posture
- Controls IS IT ALLOWED
- API key validation
- Encryption
- Lock token validation
- Functions: `validateApiKey()`, `encrypt()`, `validateLock()`

### Layer 5: API (NEW - lib/api.js)
- Unified interface
- Controls HOW TO CALL (CLI/MCP/headless)
- Pre/post execution hooks
- Mode detection
- Functions: `execute()`, `read()`, `write()`, `onBeforeExecute()`, `onAfterExecute()`, `onError()`

### Layer 6: Escrow (NEW - lib/escrow.js - Placeholder)
- Budget tracking and holds
- Controls WHEN/HOW MUCH
- Placeholder - handler NOT implemented yet
- Functions: `canSpend()`, `hold()`, `release()`, `checkHold()`

## Unified Interface (lib/framework.js)

### Quick Start

```javascript
const framework = require('./lib/framework');

// Initialize all 4 layers
await framework.init();

// Read (picking up)
const data = await framework.read(() => brain.get('learnings', 'lesson-1'));

// Write (doing)  
const result = await framework.write(() => brain.write('lessons', 'new', 'content'));

// Check before execution
const check = framework.canExecute('read');
// {allowed: true, results: {vaf: {...}, sandbox: {...}, qos: {...}, security: {...}}}

// Full status
console.log(framework.getStatus());
```

### Available Functions

| Function | Description |
|----------|------------|
| `init()` | Initialize all layers |
| `execute(fn, ctx)` | Execute with context |
| `read(fn)` | Execute read operation |
| `write(fn)` | Execute write operation |
| `canExecute(type)` | Dry-run check |
| `getStatus()` | Full framework status |

## Per-Layer Status

Each layer exposes:

- **`isOperationAllowed(type)`** - Returns `{allowed: boolean, reason?: string, layer: string}`
- **`getLayerStatus()`** - Returns detailed status object

### Example

```javascript
const vaf = require('./lib/vaf');
const sandbox = require('./lib/sandbox');
const qos = require('./lib/protection');
const security = require('./lib/security');

// Check each layer individually
console.log(vaf.isOperationAllowed('read'));
console.log(sandbox.isOperationAllowed('write'));
console.log(qos.isOperationAllowed('write'));
console.log(security.isOperationAllowed('write'));

// Get full status
console.log(vaf.getLayerStatus());
console.log(sandbox.getLayerStatus());
console.log(qos.getLayerStatus());
console.log(security.getLayerStatus());
```

## Custom Configuration

### VAF Instance

```javascript
const vaf = require('./lib/vaf');

// Create with custom config
const customVaf = vaf.create({
    maxStringLength: 5000,
    maxRequestsPerMinute: 30
});
```

### Sandbox Instance

```javascript
const sandbox = require('./lib/sandbox');

const customSandbox = sandbox.create({
    maxConcurrent: 5,
    readQuota: {perMinute: 200},
    writeQuota: {perMinute: 50},
    allowedDomains: ['github.com', 'api.github.com'],
    requireLock: true
});
```

### Security Instance

```javascript
const security = require('./lib/security');

const customSecurity = security.create({
    requireApiKey: true,
    requireLock: true
});
```

## Default Quotas

| Operation | Concurrent | Time | Quota |
|----------|-----------|------|-------|
| Read | 3 | 30s | 100/min |
| Write | 1 | 30s | 20/min |

## Migration

Existing code continues to work - no breaking changes. New framework functions are additive.

### Before (Direct)
```javascript
const vaf = require('./lib/vaf');
vaf.check(input);
```

### After (Framework)
```javascript
const framework = require('./lib/framework');
await framework.init();
await framework.read(() => process(input));
```

Both work! Framework adds layers of defense and better isolation.

---

*See [`CHANGELOG.md`](CHANGELOG.md) for version history*