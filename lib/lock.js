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
 * Acquire the lockfile at lockPath. Returns true if held (or false when the
 * lock cannot be used — caller should warn and proceed unlocked).
 * @param {string} lockPath
 * @param {object} [opts] - { staleMs, waitMs }
 */
function acquire(lockPath, opts = {}) {
    const staleMs = Number(opts.staleMs) > 0 ? Number(opts.staleMs) : DEFAULT_STALE_MS;
    const waitMs = Number(opts.waitMs) >= 0 ? Number(opts.waitMs) : DEFAULT_WAIT_MS;
    _installExitHook();
    try { fs.mkdirSync(path.dirname(lockPath), { recursive: true }); } catch (e) { /* dir exists / unusable */ }
    const deadline = Date.now() + waitMs;
    for (;;) {
        try {
            const fd = fs.openSync(lockPath, 'wx');
            fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
            fs.closeSync(fd);
            _held.add(lockPath);
            return true;
        } catch (e) {
            if (e.code !== 'EEXIST') return false; // unusable dir/fs
            try {
                const st = fs.lstatSync(lockPath);
                // Stale takeover (crashed writer) or a planted symlink.
                if (st.isSymbolicLink() || (Date.now() - st.mtimeMs) > staleMs) {
                    fs.unlinkSync(lockPath);
                    continue;
                }
            } catch (e2) { continue; } // lock vanished — retry open
            if (Date.now() > deadline) return false;
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
 * Run fn under the lock, releasing in a finally. fn receives whether the
 * lock was actually held (callers may warn + proceed unlocked when false).
 */
async function withLock(lockPath, fn, opts = {}) {
    const locked = acquire(lockPath, opts);
    try {
        return await fn(locked);
    } finally {
        if (locked) release(lockPath);
    }
}

module.exports = { acquire, release, withLock, DEFAULT_STALE_MS, DEFAULT_WAIT_MS };
