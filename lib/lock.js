/**
 * lock — shared cross-process lockfile mutex (pass 98; renamed from lib/flock.js, pass 102)
 *
 * Every module that writes a WHOLE in-memory snapshot (lib/teams.js,
 * lib/habitat.js, lib/agents/internal.js, and the state-store family:
 * consensus / market / node-registry / settlement) needs the same short
 * advisory lock: atomic `wx` create (O_EXCL), re-read-the-disk-under-lock
 * merge, stale takeover for crashed writers, symlink guard. This is that
 * ONE implementation.
 *
 * Held locks are released SYNCHRONOUSLY on process exit. `finally` cannot
 * run when a process dies mid-await (fire-and-forget saves, abrupt CLI/test
 * teardown), which used to leak a lockfile; a leak is benign (the next
 * writer's stale takeover reclaims it after staleMs) but untidy, and under
 * a scan-happy consumer (lib/migrations sweeps arbitrary files) an
 * unmanaged lockfile can be misclassified. The exit hook removes that class.
 *
 * NOT to be confused with lib/brain-lock.js (the token-verified brain lock —
 * a long-lived authorization lease, not a write serializer).
 *
 * SEPARATION OF CONCERN (pass 106, PRD §8.3):
 *   - This module = cross-process MUTEX. It answers "not at the same time".
 *   - The lease (lib/brain-lock.js) answers "who may write". Neither
 *     substitutes for the other.
 *   - lock.mutex() is IN-PROCESS only; the cross-process guarantee comes from
 *     acquire()/withLock() on a pathFor() lockfile.
 *   - ROOT: every mutex file lives at models/private/<brain>/.locks/ via
 *     pathFor(). The lease keeps a SEPARATE, cross-brain root
 *     (models/private/.locks/) — see lib/brain-lock.js for why.
 *   - NOT a lock (must never be treated as one): lib/recursion.js `guard`
 *     (a depth/reentrancy guard) and the in-process save chains in
 *     lib/teams.js / lib/agents/internal.js (write ordering only).
 *
 * Pass 103 — explicit posture:
 *   - acquire() returns { ok, reason } with reason ∈ {acquired, held,
 *     unavailable}. Callers can now TELL contention (a live peer holds it)
 *     from an unusable filesystem, so they fail closed precisely instead of
 *     treating both as a generic boolean false.
 *   - withLock(path, fn, { failMode }) — fn receives the acquire result.
 *     'closed' (DEFAULT) never calls fn without the lock; 'open' calls fn
 *     anyway and lets the caller decide. A sync fn is released synchronously.
 *   - mutex() — the in-process promise-chain helper (pass-90 poison-proof)
 *     shared by cache/canvas/consensus instead of three hand-rolled copies.
 *   - pathFor(kind, id) — ONE lock root (models/private/<brain>/.locks/) so
 *     "which lock covers resource X?" is a deterministic, greppable answer.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_STALE_MS = 5000;
const DEFAULT_WAIT_MS = 500;

// Lock paths this process currently holds. Released on exit.
const _held = new Set();
let _exitHookInstalled = false;

function _installExitHook() {
    if (_exitHookInstalled) return;
    _exitHookInstalled = true;
    // Synchronous, best-effort — never throws (exit handlers that throw are
    // ignored, but keep it clean).
    process.on('exit', () => {
        for (const p of _held) {
            try { fs.unlinkSync(p); } catch (e) { /* already gone */ }
        }
        _held.clear();
    });
}

/**
 * Acquire the lockfile at lockPath.
 * @param {string} lockPath
 * @param {object} [opts] - { staleMs, waitMs }
 * @returns {{ok: boolean, reason: 'acquired'|'held'|'unavailable'}}
 */
function acquire(lockPath, opts = {}) {
    const staleMs = Number(opts.staleMs) > 0 ? Number(opts.staleMs) : DEFAULT_STALE_MS;
    const waitMs = Number(opts.waitMs) >= 0 ? Number(opts.waitMs) : DEFAULT_WAIT_MS;
    _installExitHook();
    try {
        fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    } catch (e) {
        // A directory we cannot create means we can never write the lockfile.
        return { ok: false, reason: 'unavailable' };
    }
    const deadline = Date.now() + waitMs;
    for (;;) {
        try {
            const fd = fs.openSync(lockPath, 'wx');
            fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
            fs.closeSync(fd);
            _held.add(lockPath);
            return { ok: true, reason: 'acquired' };
        } catch (e) {
            if (e.code !== 'EEXIST') return { ok: false, reason: 'unavailable' }; // unusable dir/fs
            try {
                const st = fs.lstatSync(lockPath);
                // Stale takeover (crashed writer) or a planted symlink.
                if (st.isSymbolicLink() || (Date.now() - st.mtimeMs) > staleMs) {
                    fs.unlinkSync(lockPath);
                    continue;
                }
            } catch (e2) { continue; } // lock vanished — retry open
            if (Date.now() > deadline) return { ok: false, reason: 'held' };
            const spinEnd = Date.now() + 25; // bounded busy-wait; saves are tiny
            while (Date.now() < spinEnd) { /* spin */ }
        }
    }
}

/** Release the lockfile (best-effort; never throws). */
function release(lockPath) {
    _held.delete(lockPath);
    try { fs.unlinkSync(lockPath); } catch (e) { /* already gone */ }
}

/**
 * Run fn under the lock. fn receives the acquire result { ok, reason }.
 *
 * failMode 'closed' (DEFAULT): if the lock is not acquired, fn is NOT run and
 *   the result is { ok:false, reason, aborted:true } — the caller fails closed.
 * failMode 'open': fn is always run (even without the lock) and its return
 *   value is passed through — the caller opted into unlocked degradation.
 *
 * Accepts a sync OR async fn. A sync fn is released synchronously (no forced
 * await), which is what a synchronous reserve→commit body wants. Returns a
 * Promise in every case so callers can `await` uniformly.
 */
function withLock(lockPath, fn, opts = {}) {
    const failMode = opts.failMode === 'open' ? 'open' : 'closed';
    const res = acquire(lockPath, opts);
    if (!res.ok && failMode === 'closed') {
        return Promise.resolve({ ok: false, reason: res.reason, aborted: true });
    }
    const done = () => { if (res.ok) release(lockPath); };
    try {
        const out = fn(res);
        if (out && typeof out.then === 'function') {
            return out.then(
                (v) => { done(); return v; },
                (e) => { done(); throw e; }
            );
        }
        done();
        return Promise.resolve(out);
    } catch (e) {
        done();
        return Promise.reject(e);
    }
}

/**
 * In-process promise-chain mutex (single process). `run(fn)` serializes fn
 * behind everything already queued and NEVER lets a rejection poison the
 * chain (pass 90): the tail always advances on both settle paths.
 * @returns {{run: (fn:Function)=>Promise, readonly pending: number}}
 */
function mutex() {
    let tail = Promise.resolve();
    let pending = 0;
    return {
        run(fn) {
            pending++;
            const task = tail.then(() => fn());
            const settle = () => { pending--; };
            task.then(settle, settle);
            tail = task.then(() => {}, () => {});
            return task;
        },
        get pending() { return pending; }
    };
}

/** Active brain NAME (state-store's resolver first so locks never split-brained). */
function _brainName() {
    try {
        const ss = require('./state-store');
        if (ss && typeof ss.currentBrain === 'function') {
            const n = ss.currentBrain();
            if (typeof n === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(n)) return n;
        }
    } catch (e) { /* state-store not loadable in this context */ }
    try {
        const b = require('./brain');
        const n = b.getCurrentBrain ? b.getCurrentBrain() : null;
        if (typeof n === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(n)) return n;
    } catch (e) { /* brain not loadable */ }
    return 'vant';
}

/**
 * Deterministic lockfile path under the ONE lock root:
 *   models/private/<brain>/.locks/<kind>[__<id>].lock
 *
 * `.locks/` is a brain-root dot-dir: lib/migrations' dropfiles step only
 * sweeps `<brain>/state/`, and lib/brain treats dot-dirs as infrastructure,
 * so this root is invisible to both.
 * @param {string} kind - lock family, e.g. 'state' | 'teams' | 'agents' | 'habitat' | 'market-trade'
 * @param {string|number} [id] - resource id (optional)
 * @param {object} [opts] - { brain } to force a brain name
 */
function pathFor(kind, id, opts = {}) {
    const brain = opts.brain && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(opts.brain) ? opts.brain : _brainName();
    const raw = (id === undefined || id === null || id === '')
        ? String(kind)
        : String(kind) + '__' + String(id);
    const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.resolve('models/private', brain, '.locks', safe + '.lock');
}

module.exports = {
    acquire,
    release,
    withLock,
    mutex,
    pathFor,
    DEFAULT_STALE_MS,
    DEFAULT_WAIT_MS
};
