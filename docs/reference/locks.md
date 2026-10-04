---
version: 0.8.6
permalink: /reference/locks
title: Locks API
nav_order: 136
description: API reference for lib/brain-lock.js (authorization lease) and lib/lock.js (cross-process mutex), plus the vant lock CLI and vant_lock MCP tool.
---

# Locks API

> Exact signatures for both lock modules. Concepts and operations guidance:
> [Locks](/vant/operations/locks).

## lib/brain-lock.js - authorization lease

Token- and agent-scoped lease answering "who may write to this brain".
TTL default `DEFAULT_TIMEOUT_MS` (1 hour). Emits `brain-lock:*` events.

| Export | Signature | Returns |
|--------|-----------|---------|
| `acquireBrainLock` | `async (agentId?, timeout?, { brain }?)` | token string, or null if not acquired |
| `releaseBrainLock` | `async (agentId?, token?, { brain }?)` | `{ success, message }` |
| `brainLockStatus` | `({ brain }?)` | `{ agentId, token, age, valid, stale?, brain }` or null |
| `forceReleaseBrainLock` | `({ brain }?)` | boolean (true = a lock file was deleted) |
| `getAgentId` | `()` | agent id (`VANT_AGENT_ID` or `agent-<pid>`) |
| `getBrainLock` | `(brain?)` | brain-scoped internal state |
| `getLayerStatus` | `()` | `{ name, type: 'authorization_lease', enabled, trackedBrains, defaultTtlMs }` |
| `getStackLockStatus` | `({ ... }?)` | `{ source: 'stack', brains, byBrain }` |
| `listStackLocks` | `({ ... }?)` | rows: `{ brain, agentId, token, age, valid }` |
| `DEFAULT_TIMEOUT_MS` | `3600000` | the 1h TTL constant |
| `BRAIN_LOCK_CONFIG` | object | attempts, backoff and check-interval tuning |

Notes:

- Same-agent re-acquire **refreshes** the lease (TTL extended, file token kept
  stable) and emits `brain-lock:refreshed` instead of failing.
- Release verifies agent AND token; a wrong token returns
  `{ success: false, message: 'Invalid token - release denied' }` and keeps
  the lock file.
- Acquire with exponential backoff (`BRAIN_LOCK_CONFIG`), stale takeover via
  create-or-fail CAS (O_EXCL), symlink sweep on takeover.
- Stack helpers read per-brain status explicitly; they never mutate the
  process-active brain.

## lib/lock.js - cross-process mutex

Short-lived advisory lockfile serializing one whole-snapshot write across
processes. No identity, no TTL semantics; stale takeover is mtime-based.

| Export | Signature | Returns |
|--------|-----------|---------|
| `acquire` | `(lockPath, { staleMs?, waitMs? }?)` | `{ ok, reason }`, reason in `acquired \| held \| unavailable` |
| `release` | `(lockPath)` | void; only unlinks when the file's pid is this process |
| `withLock` | `(lockPath, fn, { failMode?, staleMs?, waitMs? }?)` | Promise; body result, or `{ ok: false, reason, aborted: true }` in fail-closed mode |
| `mutex` | `()` | `{ run(fn): Promise, pending: number }` in-process chain |
| `pathFor` | `(kind, id?, { brain }?)` | `models/private/<brain>/.locks/<kind>[__<id>].lock` |
| `pathForGlobal` | `(kind, id?)` | `models/.locks-global/<kind>[__<id>].lock` |
| `DEFAULT_STALE_MS` | `5000` | mtime age for stale takeover |
| `DEFAULT_WAIT_MS` | `500` | bounded wait before reporting `held` |

Notes:

- `withLock` ALWAYS returns a Promise. A synchronous `fn` runs and is
  released synchronously; an async `fn` is released on settle (the exit hook
  also covers process death between them).
- `failMode: 'closed'` (default) never runs `fn` without the lock.
  `failMode: 'open'` runs `fn(result)` anyway and passes the return through.
- `held` = a live peer owns the file; `unavailable` = the filesystem is
  unusable (for example a regular file sits at the lock root). Posture
  guidance: [Locks](/vant/operations/locks).
- Takeover retries are bounded (>100 attempts reports `held`) so a hostile
  symlink replant loop cannot spin forever.
- `mutex()` serializes within one process only (cache, canvas, consensus use
  it) and never lets a rejection poison the chain.

## CLI: `vant lock`

Drives the **lease** (`lib/brain-lock.js`). The token from `acquire` is saved
to `.lock-brain-token` for cross-process release.

| Command | Description |
|---------|-------------|
| `vant lock acquire [agentId]` | Acquire the lease; prints and saves the token |
| `vant lock release [token]` | Token-verified release; exits non-zero and keeps the token file when denied |
| `vant lock status` | Current brain + whole-stack lease status |
| `vant lock force` | Force release (admin): deletes the lock file unconditionally |

(Short forms `acq`, `rel`, `stat` work. The MCP tool has a separate
`stack` action returning the same whole-stack view `status` prints.)

## MCP tool: `vant_lock`

| Param | Type | What |
|-------|------|------|
| action | string | `acquire`, `release`, `status`, `stack`, `force` (the whole-stack view `status` also prints via CLI) |
| token | string | Release token from `acquire` |
| agentId | string | Agent identifier |

```bash
vant_lock(action="acquire")
vant_lock(action="release", token="<token>")
vant_lock(action="status")
vant_lock(action="stack")
vant_lock(action="force")
```

Returns `{ action, acquired, token }` on acquire, `{ action, success, message }`
on release, `{ action, status, stack, held }` on status/stack, and
`{ action, forceReleased }` (boolean) on force. This tool manages the lease;
the mutex is a library-level primitive and has no MCP surface.

## Where locks live on disk

| Path | Owner | Gitignored |
|------|-------|------------|
| `models/private/.locks/.lock-<brain>.json` | lease | yes (`.locks/`, `.lock-brain-token`) |
| `models/private/<brain>/.locks/<kind>[__<id>].lock` | mutex (per-brain) | yes |
| `models/.locks-global/<kind>[__<id>].lock` | mutex (repo-scoped) | yes |

Leaked lockfiles are scanned by `npm run lint:locks`
(`scripts/audit-locks.js`), which also asserts the two roots, the no
cross-require rule between the modules, and the fail-closed wiring of the
guarded writers.
