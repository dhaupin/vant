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
 *
 * Pass 115 (live-fire) — withLockSync: the sync twin (see its docstring).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_STALE_MS = 5000;
const DEFAULT_WAIT_MS = 500;

// (pass 118, post-PRD target #5) Sleep-poll instead of busy-wait. The wait
// window used to spin in 25ms full-CPU bursts — teams' waitMs=8000 meant
// EIGHT SECONDS of a burning core per contended create*. Atomics.wait
// blocks the thread without spinning (Node allows it on the main thread,
// unlike browsers); fallback keeps the old spin only where Atomics.wait is
// unavailable. Poll granularity is small, so stale-takeover latency is
// unaffected (≤5ms vs ≤25ms before — strictly better).
const _waitArr = new Int32Array(new SharedArrayBuffer(4));
const WAIT_POLL_MS = 5;
function _sleepPoll(ms) {
    if (ms <= 0) return;
    try {
        Atomics.wait(_waitArr, 0, 0, ms);
    } catch (e) {
        const end = Date.now() + ms;
        while (Date.now() < end) { /* spin fallback */ }
    }
}

// Lock paths this process currently holds. Released on exit.
const _held = new Set();
let _exitHookInstalled = false;

// (pass 117, post-PRD target #2) Lock observability. Pass-116 proved the
// cost of an invisible fail-closed refusal: it existed only as a stderr
// line until a live-fire probe tripped over it. These counters make
// contention and refusals a first-class, queryable fact — surfaced through
// health.getStackHealthStatus() and MCP vant_lock stats. Deltas are the
// intended read pattern (no reset API: a resettable counter is a counter
// that can lie about the past).
const _stats = {
    acquires: 0,       // successful acquire (incl. stale takeovers)
    held: 0,           // acquire refused: a live peer owns the file
    unavailable: 0,    // acquire refused: the filesystem is unusable
    takeovers: 0,      // stale takeovers performed
    releases: 0,       // lockfiles actually removed by their owner
    bodiesRun: 0,      // bodies executed while holding the lock
    bodyErrors: 0,     // bodies that threw (withLock rethrows after release)
    aborted: 0,        // fail-closed refusals (body never ran)
    holdMsTotal: 0,    // accumulated body hold time (withLock/withLockSync)
    holdMsMax: 0       // longest single hold
};
function stats() {
    return { ..._stats, heldNow: _held.size };
}

function _installExitHook() {
    if (_exitHookInstalled) return;
    _exitHookInstalled = true;
    // Synchronous, best-effort — never throws (exit handlers that throw are
    // ignored, but keep it clean).
    process.on('exit', () => {
        for (const p of _held) {
            // (pass 108 FIX) Same ownership rule as release(): a stale takeover
            // may have replaced this file with a successor's lock — leave
            // theirs alone instead of clobbering it on our way out.
            try {
                const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                if (data && data.pid === process.pid) fs.unlinkSync(p);
            } catch (e) { /* gone or not ours */ }
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
        _stats.unavailable++;
        return { ok: false, reason: 'unavailable' };
    }
    const deadline = Date.now() + waitMs;
    // (pass 108) Bounded takeover retries: a hostile symlink/stale replanter
    // could otherwise spin this loop forever (the deadline check below only
    // runs on the fresh-file path).
    let takeovers = 0;
    for (;;) {
        try {
            const fd = fs.openSync(lockPath, 'wx');
            fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
            fs.closeSync(fd);
            _held.add(lockPath);
            _stats.acquires++;
            try { require('./event').emit('lock:acquired', { lockPath, timestamp: Date.now() }); } catch (e) { /* bus never blocks */ }
            return { ok: true, reason: 'acquired' };
        } catch (e) {
            if (e.code !== 'EEXIST') { _stats.unavailable++; return { ok: false, reason: 'unavailable' }; } // unusable dir/fs
            try {
                const st = fs.lstatSync(lockPath);
                // Stale takeover (crashed writer) or a planted symlink.
                if (st.isSymbolicLink() || (Date.now() - st.mtimeMs) > staleMs) {
                    fs.unlinkSync(lockPath);
                    _stats.takeovers++;
                    if (++takeovers > 100) return { ok: false, reason: 'held' };
                    continue;
                }
            } catch (e2) { continue; } // lock vanished — retry open
            if (Date.now() > deadline) { _stats.held++; return { ok: false, reason: 'held' }; }
            _sleepPoll(Math.min(WAIT_POLL_MS, deadline - Date.now()));
        }
    }
}

/**
 * (pass 108 FIX) Does the lockfile currently belong to THIS process? A stale
 * takeover replaces the file with the successor's (different pid) — deleting
 * by path alone would clobber a live peer lock and put two writers inside the
 * mutex at once (probe: deterministic). Corrupt or vanished files are left for
 * the next acquire()'s stale sweep.
 */
function _ownsLock(lockPath) {
    try {
        const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        return !!data && data.pid === process.pid;
    } catch (e) {
        return false;
    }
}

/** Release the lockfile (best-effort; never throws; ONLY our own lock). */
function release(lockPath) {
    _held.delete(lockPath);
    if (!_ownsLock(lockPath)) return;
    try { fs.unlinkSync(lockPath); _stats.releases++; } catch (e) { /* already gone */ }
    try { require('./event').emit('lock:released', { lockPath, timestamp: Date.now() }); } catch (e) { /* bus never blocks */ }
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
        _stats.aborted++; // (pass 117) a visible refusal
        return Promise.resolve({ ok: false, reason: res.reason, aborted: true });
    }
    const t0 = Date.now();
    const done = () => {
        if (res.ok) {
            release(lockPath);
            const hold = Date.now() - t0;
            _stats.holdMsTotal += hold;
            if (hold > _stats.holdMsMax) _stats.holdMsMax = hold;
        }
    };
    _stats.bodiesRun++;
    try {
        const out = fn(res);
        if (out && typeof out.then === 'function') {
            return out.then(
                (v) => { done(); return v; },
                (e) => { done(); _stats.bodyErrors++; throw e; }
            );
        }
        done();
        return Promise.resolve(out);
    } catch (e) {
        _stats.bodyErrors++;
        done();
        return Promise.reject(e);
    }
}

/**
 * (pass 115, live-fire) SYNCHRONOUS twin of withLock — same acquire, same
 * body-run-and-release discipline, same failMode, but the outcome comes
 * back as a plain value instead of a Promise. Exists because the outcome
 * is decided synchronously anyway (acquire's bounded wait busy-spins
 * inside this call): the promise wrapper only HID the result, which let
 * fire-and-forget callers report success while the save was fail-closed
 * refused. Accepts a sync fn (required); a thrown fn error is re-thrown
 * after release. The async withLock remains the canonical API for async
 * bodies.
 * @param {string} lockPath
 * @param {Function} fn - sync body
 * @param {object} [opts] - { failMode, staleMs, waitMs }
 * @returns {object} fn's return value, or the abort marker
 *   { ok:false, reason, aborted:true } when fail-closed refused
 */
function withLockSync(lockPath, fn, opts = {}) {
    const failMode = opts.failMode === 'open' ? 'open' : 'closed';
    const res = acquire(lockPath, opts);
    if (!res.ok && failMode === 'closed') {
        _stats.aborted++; // (pass 117) a visible refusal
        return { ok: false, reason: res.reason, aborted: true };
    }
    const t0 = Date.now();
    _stats.bodiesRun++;
    try {
        return fn(res);
    } catch (e) {
        _stats.bodyErrors++;
        throw e;
    } finally {
        if (res.ok) {
            release(lockPath);
            const hold = Date.now() - t0;
            _stats.holdMsTotal += hold;
            if (hold > _stats.holdMsMax) _stats.holdMsMax = hold;
        }
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

/**
 * Repo-GLOBAL mutex root (pass 111, S5/F12) for resources that are shared
 * across brains and anchored OUTSIDE any brain — auth lockouts
 * (.circuit-auth.json), VAF blocklists (.circuit-vaf.json), and the
 * cross-brain insight feed (models/public/insights.json). Those files live
 * at the repo/models root, so a per-brain lock would split-brain two
 * processes pinned to different brains. Same discipline as pathFor():
 *   models/.locks-global/<kind>[__<id>].lock
 */
function pathForGlobal(kind, id) {
    const raw = (id === undefined || id === null || id === '')
        ? String(kind)
        : String(kind) + '__' + String(id);
    const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.resolve('models', '.locks-global', safe + '.lock');
}

module.exports = {
    acquire,
    release,
    withLock,
    withLockSync,
    mutex,
    pathFor,
    pathForGlobal,
    stats, // (pass 117) observability: acquire/held/unavailable/takeovers/releases/bodies/aborted/hold times
    DEFAULT_STALE_MS,
    DEFAULT_WAIT_MS
};
