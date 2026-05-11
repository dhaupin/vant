---
title: Sandbox Architecture Review
nav_order: 55
layout: docs
slug: sandbox-review
description: Deep dive on Vant's sandboxing capabilities and gaps
---

# VANT SANDBOX ARCHITECTURE REVIEW

> **Date**: 2026-05-07  
> **Reviewer**: OpenHands Agent  
> **Purpose**: Deep code review + sandboxing analysis + security assessment

---

## EXECUTIVE SUMMARY

This document provides a comprehensive technical review of Vant's sandboxing architecture, identifying what's already working well and where improvements can be made for "specific-specific and weird setup" isolation scenarios.

**KEY FINDING**: Vant has a multi-layered defense system, but lacks true sandbox isolation between read ("picking up") and write ("doing") operations. The current architecture separates concerns via git branches, locks, and circuit breakers—but NOT via process-level sandboxing.

---

## CORE SYSTEMS ANALYSIS

### 1. PROTECTION LAYER (lib/protection.js)

**What It Does**:
- MAX_CONCURRENT: 3 simultaneous requests (prevents fork bombs)
- TIMEOUT: 30s default for all async operations  
- MAX_INPUT_SIZE: 1MB per write operation
- CIRCUIT_BREAKER: Opens after 5 failures, 60s recovery window

**Rating**: 🟡 Acceptable

**Issues**:
- No per-operation-type sandboxing (read vs write)
- Circuit breaker uses simplefailure count, not exponential backoff timing
- No memory quota enforcement

---

### 2. VAF (lib/vaf.js) - Input Validation Firewall

**What It Does**:
- Input type validation (string, object, path, file)
- Content filtering (command injection, path traversal)
- Rate limiting per IP (60/min, 1000/hour)
- Word stacking detection (prevents "van van van..." attacks)
- Path traversal protection
- Dangerous pattern blocking (eval, exec, shell exec, etc.)

**Rating**: 🟢 Good taste

**Strengths**:
- Defense in depth: multiple layers of validation
- Comprehensive dangerous pattern list
- AllowContent bypass for memory content legitimately containing special chars
- Audit logging for security events

**Issues**:
- CONFIG loads at module init time—potential for circular dependency
- Blocked extensions list is incomplete (missing .py, .rs, .go)
- Rate limit uses in-memory Map—not shared across process restarts

---

### 3. LOCK MANAGER (lib/lock.js)

**What It Does**:
- Token-based distributed locking using atomic file operations
- Exponential backoff (50ms base, 1s cap, 5 attempts)
- Token cache in memory for secure release validation
- Rate limiting (10 acquires/minute per agent)

**Rating**: 🟢 Good taste

**Strengths**:
- Atomic rename for lock acquisition—prevents race conditions
- Token validation before release—secure against unauthorized release
- Timeout prevents stuck locks (1 hour default)

**Issues**:
- Lock files stored in .agent-locks/ in workspace—not externalized
- No lock delegation (can't transfer ownership)
- Stale lock detection relies on timestamp, not health checks

---

### 4. ENTROPY SYSTEM (lib/entropy.js)

**What It Does**:
- Shannon entropy calculation for data analysis
- Generates .vpatch files (latent transport format)
- Splits data into "stable" (low-entropy) and "spike" (high-entropy) regions
- AdaptiveEntropy class with auto-calibration

**Rating**: 🟡 Acceptable

**Strengths**:
- MAX_BUFFER_SIZE: 10MB limit prevents memory exhaustion
- Window size validation (1-1024)
- Threshold validation (0-1)

**Issues**:
- No streaming support for large files
- AdaptiveEntropy sensitivity is not persisted
- No integrity verification (checksum/hash)

---

### 5. STEGANOGRAPHY (lib/stego.js)

**What It Does**:
- LSB encoding in PNG images
- AES-256-GCM encryption with PBKDF2 key derivation (100k iterations)
- Brain encoding across multiple image chunks
- In-memory encode/decode buffer operations

**Rating**: 🟢 Good taste

**Strengths**:
- proper cryptographic implementation
- No password in logs (uses key derivation)
- Chunked encoding for large brain data
- Compression option before encoding

**Issues**:
- No verification step after encoding
- CRC for PNG is naive (zlib.crc32)
- No support for other image formats (JPEG, WebP)

---

### 6. BRAIN SYSTEM (lib/brain.js)

**What It Does**:
- Category-based memory: identity, learnings, memories, decisions, todos
- Version-based brain folders (models/vX.X.X/)
- JSON/YAML/MD file support
- Compress/decompress with zlib
- Config embedding for stego boot
- Path validation and control character blocking

**Rating**: 🟢 Good taste

**Strengths**:
- Clear separation of concerns (categories)
- Version-based brain management
- Security validation on writes (path-unsafe chars blocked)
- Config embedding for bootstrap scenarios

**Issues**:
- No per-category quotas
- No encryption at rest (relies on filesystem permissions)
- Embedded config only stores safe keys (GITHUB_REPO, not tokens)

---

### 7. SYNC SYSTEM (lib/sync.js)

**What It Does**:
- Multi-provider RAID 1 + Broadcast (GitHub, GitLab, etc.)
- Per-provider circuit breakers
- Exponential backoff for recovery
- Auto-failover on provider failure

**Rating**: 🟡 Acceptable

**Strengths**:
- Broadcast write, any-read failover
- Circuit breaker per provider
- Proper backoff calculation

**Issues**:
- No conflict resolution (last-write-wins)
- No partial sync support
- Rebase assumes linear history

---

### 8. MCP SERVER (bin/mcp.js)

**What It Does**:
- 21 tools exposed as JSON-RPC
- All tools wrapped with protection (concurrency, timeout)
- API key authentication (optional)
- CORS enabled

**Rating**: 🟡 Acceptable

**Strengths**:
- Protection wrapper on EVERY tool
- Explicit tool definitions with input schemas
- Health endpoint for monitoring

**Issues**:
- CORS uses wildcard '*'—should be configurable
- No request ID validation (allows replay)
- No per-tool rate limiting

---

## SANDBOX GAP ANALYSIS

### Current Capabilities:

| Sandbox Feature | Implemented | Implementation |
|----------------|-------------|----------------|
| Concurrent request limit | ✅ | protection.js (MAX_CONCURRENT=3) |
| Input size limit | ✅ | protection.js (MAX_INPUT_SIZE=1MB) |
| Timeout enforcement | ✅ | protection.js (withTimeout) |
| Circuit breaker | ✅ | protection.js, sync.js |
| Token-based locking | ✅ | lock.js |
| Input validation | ✅ | vaf.js |
| Path traversal protection | ✅ | vaf.js |
| Content filtering | ✅ | vaf.js (dangerous patterns) |
| Rate limiting | ✅ | vaf.js (per IP), lock.js (per agent) |

### Missing Capabilities:

| Sandbox Feature | Priority | Implementation Strategy |
|----------------|----------|------------------------|
| **Read/Write separation** | HIGH | Separate sandboxes for picking up vs doing |
| Process-level isolation | HIGH | VM/container sandbox |
| Per-category quotas | MEDIUM | Add to brain.js config |
| Network restrictions | MEDIUM | Configurable allowed domains |
| Memory quota per request | MEDIUM | Add in protection.js |
| File system isolation | MEDIUM | Chroot or dedicated dirs |
| Code execution sandbox | LOW | VM2 or isolated-vm |

---

## RECOMMENDATIONS FOR SPECIFIC-SPECIFIC SETUP

### What You're Picking Up (READ Operations):
- vant_get_memory: Read brain state
- vant_list_branches: List available branches  
- vant_get_islands: List lazy-loadable components
- vant_search: Search brain

### What You're Doing (WRITE Operations):
- vant_set_memory: Write to brain
- vant_create_branch: Create new branch
- vant_commit: Commit changes
- vant_sync: Push changes

### Recommended Sandbox Separation:

```javascript
// READ-ONLY SANDBOX (for "picking up")
const READ_CONFIG = {
  MAX_CONCURRENT: 5,      // More concurrent reads OK
  MAX_INPUT_SIZE: 5MB,   // Larger reads OK  
  TIMEOUT: 60000,        // 60s for complex searches
  CIRCUIT_BREAK_THRESHOLD: 10  // More tolerant
};

// WRITE SANDBOX (for "doing")
const WRITE_CONFIG = {
  MAX_CONCURRENT: 1,     // Serialized writes
  MAX_INPUT_SIZE: 1MB,   // Constrained
  TIMEOUT: 30000,        // 30s default
  CIRCUIT_BREAK_THRESHOLD: 3,  // Sensitive
  REQUIRE_LOCK: true    // Always acquire lock first
};
```

---

## RISK ASSESSMENT

| Component | Risk Level | Key Concerns |
|-----------|------------|--------------|
| protection.js | 🟢 LOW | Well-bounded, configurable |
| vaf.js | 🟢 LOW | Comprehensive, defense in depth |
| lock.js | 🟢 LOW | Atomic operations, token validation |
| entropy.js | 🟢 LOW | Size limits, validated inputs |
| stego.js | 🟢 LOW | Proper crypto implementation |
| brain.js | 🟡 MEDIUM | No encryption at rest |
| sync.js | 🟡 MEDIUM | No conflict resolution |
| mcp.js | 🟡 MEDIUM | Wildcard CORS, no replay protection |

**Overall Risk**: 🟡 MEDIUM - Core mechanisms sound, but missing true sandbox isolation

---

## HEALING RECOMMENDATIONS

### For Vant to "Make Sandbox Better":

1. **Add operation-type separation**:
   - Create distinct MCP tool sets for read vs write
   - Apply different protection configs per type

2. **Add memory quotas**:
   - Per-category size limits in brain.js
   - Automatic pruning when exceeded

3. **Add network isolation**:
   - Configurable allowed domains for sync
   - Default: no external calls without explicit opt-in

4. **Add process isolation** (if needed):
   - Use VM2 or isolated-vm for untrusted code
   - Currently not needed—Vant doesn't execute user code

5. **Add audit improvements**:
   - Structured audit log format (JSON)
   - Log retention policy
   - Alerting on security events

---

## KEY INSIGHT:

Vant's defense model is **"defense in depth through composition"** rather than "single sandbox boundary." This is appropriate for Vant's threat model—a collaborative AI agent system, NOT an untrusted code execution environment.

The most significant gap is **no operation-type sandboxing** (read vs write separation). For your "specific-specific and weird setup," this is the highest-priority improvement.

---

# APPENDIX: GLOBAL STACK MAPPING

> Updated with user's architectural framing

## THE FOUR LAYERS AT SAME GLOBAL SCOPE:

```
┌─────────────────────────────────────────────┐
│           GLOBAL OPERATIONAL LAYERS           │
├─────────────────────────────────────────────┤
│  VAF      →  Input validation firewall    │
│  Sandbox →  Execution isolation          │
│  QoS      →  Rate limits, circuit breakers│
│  Security → Auth, encryption, posture     │
└─────────────────────────────────────────────┘
```

### Current Vant Component Mapping:

| Global Layer | Vant Component | What It Does |
|--------------|---------------|-------------|
| **VAF** | lib/vaf.js | Input validation, content filtering, path traversal protection |
| **Sandbox** | lib/protection.js (partial) | Concurrent limits, timeouts - but MIXED with QoS |
| **QoS** | lib/protection.js + lib/sync.js + vaf rate limiting | Rate limits, circuit breakers, prioritization |
| **Security** | lib/stego.js + lock.js + mcp.js auth | Encryption, tokens, API keys, lock validation |

### The Gap:

**Sandbox is NOT a dedicated layer** - it's interleaved with QoS in protection.js:
- VAF has clear identity as "input firewall"
- Sandbox and QoS are mixed together
- No dedicated "run in sandbox" abstraction

### Recommendation:

Add `lib/sandbox.js` as a **dedicated layer** at the same scope level as VAF:

```javascript
// lib/sandbox.js - NEW dedicated layer
class Sandbox {
  constructor(config) {
    this.maxConcurrent = config.maxConcurrent || 3;
    this.maxMemory = config.maxMemory || '100MB';
    this.allowedDomains = config.allowedDomains || [];
    this.quota = config.quota || { reads: '10MB/min', writes: '1MB/min' };
  }
  
  async read(operation) {
    // Read-specific sandbox config
    return this.execute(operation, { type: 'read', allowConcurrent: 5 });
  }
  
  async write(operation) {
    // Write-specific sandbox config (require lock)
    return this.execute(operation, { type: 'write', allowConcurrent: 1, requireLock: true });
  }
  
  execute(operation, context) {
    // Core sandbox execution
  }
}
```

This creates the four-layer stack the user is envisioning:
- **VAF** → "what comes IN" (validated)
- **Sandbox** → "where it runs" (isolated)  
- **QoS** → "how fast/fair" (limited)
- **Security** → "is it allowed" (authenticated)

---

*End of Review*