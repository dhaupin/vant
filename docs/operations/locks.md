---
version: 0.8.6
permalink: /operations/locks
layout: default
title: Locks
nav_order: 66
description: The two lock types (authorization lease and cross-process mutex), their roots, failure postures, and how to use each.
---

# Locks

> Two lock types, deliberately separate: the **lease** answers "who may write
> to this brain", the **mutex** answers "not at the same time". Neither
> substitutes for the other.

## The two types

| | `lib/brain-lock.js` | `lib/lock.js` |
|---|---|---|
| Concept | authorization **lease** | cross-process **mutex** |
| Question | who may write to this brain? | serialize one snapshot write |
| Lifetime | long (TTL default 1h) | short (held across one write) |
| Identity | token + agentId | none (pid-only, advisory) |
| Root | `models/private/.locks/.lock-<brain>.json` | `models/private/<brain>/.locks/<kind>[__<id>].lock` |
| Events | `brain-lock:acquired\|released\|refreshed\|force-released` | none |
| CLI | `vant lock` | (library only) |
| MCP | `vant_lock` | (library only) |

Why two roots: the lease is a **cross-brain registry** (one file per brain),
so it lives at the shared parent `models/private/.locks/`. The mutex guards a
resource **inside one brain**, so its files live at
`models/private/<brain>/.locks/`. Both `.locks` directories are infrastructure
dot-dirs: brain loading and migrations ignore them, and they are gitignored.

## The lease: `lib/brain-lock.js`

An authorization lease with a token and a TTL. Acquire it before an agent
takes exclusive write ownership of a brain; release it when done.

```bash
vant lock acquire              # prints the token, saves it to .lock-brain-token
vant lock status               # current brain + whole-stack view
vant lock release              # token-verified release (refuses a wrong token)
vant lock force                # admin: drop the lock file unconditionally
```

Programmatic use:

```js
const brainLock = require('./lib/brain-lock');

const token = await brainLock.acquireBrainLock('agent-1');
if (token) {
    try {
        // exclusive brain write ownership ...
    } finally {
        await brainLock.releaseBrainLock('agent-1', token);
    }
}
```

Behaviour worth knowing:

- **Same-agent re-acquire refreshes** the TTL in place instead of failing, and
  keeps the file token stable (outstanding references stay valid).
- **Stale takeover is a create-or-fail CAS** (`O_EXCL`): two agents that both
  read the same expired lock cannot both win; exactly one create succeeds and
  the loser backs off. A symlink planted at the lock path refuses `O_EXCL` and
  is swept.
- **Release is token-verified.** A wrong token is denied and the lock file is
  kept. `forceReleaseBrainLock` is the admin escape hatch and returns a
  boolean.
- **Rate limiting is deliberately NOT here.** The lease is acquired hot by
  internal writers (sandbox writes, shell exec, tmp spaces); a per-agent cap
  would throttle legitimate work. Rate limiting belongs to
  [QoS](/vant/operations/qos).

The lease is **not** a write serializer. It says nothing about two processes
racing to write one file; that is the mutex below.

## The mutex: `lib/lock.js`

A short-lived advisory lockfile that makes one whole-snapshot write atomic
across processes. Atomic `wx` create (O_EXCL), stale takeover for crashed
writers (default 5s), symlink guard, and release only by the owning pid (a
stale takeover never clobbers the successor's fresh lock).

```js
const lock = require('./lib/lock');

const p = lock.pathFor('teams');              // models/private/<brain>/.locks/teams.lock
const res = await lock.withLock(p, () => {
    // re-read the disk under the lock, merge, write the whole snapshot
}, { failMode: 'closed', staleMs: 10000, waitMs: 8000 });
```

Key facts:

- `acquire(path, opts)` returns `{ ok, reason }` with
  `reason` in `acquired | held | unavailable`: **held** means a live peer owns
  it (contention), **unavailable** means the filesystem is unusable. Callers
  can fail closed precisely.
- `withLock(path, fn, opts)` ALWAYS returns a Promise; the body runs
  synchronously when the lock is available. `failMode: 'closed'` (default)
  never runs `fn` without the lock and returns
  `{ ok: false, reason, aborted: true }`. `failMode: 'open'` runs `fn`
  anyway and passes its return through.
- `withLockSync(path, fn, opts)` (pass 115) is the sync twin for callers
  that must stay synchronous (teams create*/restoreState): the outcome is a
  plain value, so a fail-closed refusal is read directly instead of being
  hidden behind a promise wrapper. Read the honest outcome and surface it:
  a refused save must roll back and return an error, never a success.
- Observability (pass 117): `lock.stats()` and `brain-lock.leaseStats()`
  count acquires, contention (`held`), unusable filesystems
  (`unavailable`), stale takeovers, fail-closed refusals (`aborted`), body
  errors and hold times (in-process, delta-read), surfaced in `vant health`
  and MCP `vant_lock action="stats"`. If refusals climb, something is
  holding locks too long (check `holdMsMax`) or a lock root is broken.
- Write-debris janitor (pass 117): SIGKILL mid-`writeFileSync` can strand a
  `<file>.<uuid>` temp. `vant health` reports stranded temps (read-only);
  `vant health --sweep` removes them (age-guarded, never touches fresh
  in-flight temps, bystanders, or symlinks). The passive per-target sweep
  in `atomicWrite` still reclaims a target's temps on its next write.
- Wait posture (pass 118): a contended `acquire` SLEEPS between polls
  (5ms granularity via `Atomics.wait`) instead of busy-waiting in 25ms
  full-CPU bursts. Takeover latency is unaffected; a long `waitMs` no
  longer burns a core. The lease (`brain-lock`) already slept via
  exponential backoff with jitter.
- `mutex()` is the in-process promise-chain helper (cache, canvas, consensus
  use it). It is **not** cross-process safe.
- `pathFor(kind, id, { brain })` builds paths under the per-brain root.
- `pathForGlobal(kind, id)` builds paths under `models/.locks-global/` for
  **repo-scoped resources** that live outside any brain.

### Which path helper?

| Resource lives at | Helper | Lock root |
|---|---|---|
| Inside one brain (`<brain>/state/...`, orgchart, habitat) | `pathFor(kind, id)` | `models/private/<brain>/.locks/` |
| Repo root, shared across brains (`.circuit-auth.json`, `.circuit-vaf.json`, `models/public/insights.json`) | `pathForGlobal(kind, id)` | `models/.locks-global/` |

A per-brain lock on a repo-root file would split-brain two processes pinned
to different brains, hence the global root. Both roots are gitignored and
scanned for leaked files by `npm run lint:locks`.

## Failure postures

Every mutex call site declares its posture explicitly:

- **Fail closed** (default): if the lock cannot be taken, the write is
  refused and the caller returns/throws a clear error. Data is not written
  unlocked. Used by everything that would corrupt or lose state silently:
  state-store, teams, agents, habitat, market trades, and the guarded
  security/provenance writers (auth lockout, vaf blocklist, brain config,
  citations, mcp insights).
- **Fail open** (`failMode: 'open'`): the caller opted into unlocked
  degradation. Only for writes where a lost update is provably harmless
  (regenerable caches, self-healing status rows).

If you see `Orgchart lock unavailable` or a similar fail-closed refusal, the
system protected your data: fix the filesystem issue (or the stale peer) and
retry. `vant health` shows lock state under its Lock section.

## What is NOT a lock

Three serializers sit in the same conceptual space and are classified so
nobody mistakes them:

| Thing | What it is | Why it is not a lock |
|---|---|---|
| `lock.mutex()` | in-process promise chain | no cross-process guarantee |
| `teams._teamsSaveChain`, `agents._saveChain` | in-process write ordering | same-process only |
| `lib/recursion.js` `guard` | depth/reentrancy guard | never requires either lock module |

## Diagnostics

```bash
vant health          # Lock section: layer status + per-brain lease rows
vant lock status     # lease status for the active brain and the whole stack
npm run lint:locks   # audit: two roots, no cross-require, zero leaked lockfiles
```

Related pages: [QoS](/vant/operations/qos) for rate limiting,
[Storage](/vant/operations/storage) for the storage layer the lease rides on,
[Multi-agent crews](/vant/multi-agent/agents) for why write ownership exists.
The full invariant list lives in `labs/archives/audits/LOCKS.md` (PRD section 8).
