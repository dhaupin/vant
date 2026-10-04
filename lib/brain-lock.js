/**
 * Brain lock — authorization lease (v0.8.6; renamed from lib/lock.js, pass 102)
 *
 * This is NOT a state-write mutex. It is the long-lived, token-verified,
 * agent-scoped lease that answers "who may write to this brain?" (TTL default
 * 1h, emits `brain-lock:*` events). The short cross-process
 * write serializer is the separate `lib/lock.js` (a mutex) — use THAT one to
 * serialize a snapshot write; use this one only for agent write ownership.
 *
 * SEPARATION OF CONCERN (pass 106, PRD §8.3):
 *   - This module = authorization LEASE ("who may write"), token + agent +
 *     TTL. It is NOT a write serializer and must not be used to serialize a
 *     snapshot write.
 *   - ROOT: `models/private/.locks/.lock-<brain>.json` — ONE directory ABOVE
 *     the per-brain dirs (the mutex root is `models/private/<brain>/.locks/`).
 *     The lease is a cross-brain registry (one file per brain), so it lives at
 *     the shared parent, and it is REPLACED atomically (temp+rename), not taken
 *     with O_EXCL. Root + mechanism differ from the mutex ON PURPOSE — do NOT
 *     fold this into lib/lock.js pathFor().
 *
 * Usage:
 *   const brainLock = require('./brain-lock');
 *   const token = await brainLock.acquireBrainLock('agent-1');
 *   if (token) { ... do work ... await brainLock.releaseBrainLock('agent-1', token); }
 *
 * Multibrain:
 *   const token = await brainLock.acquireBrainLock('agent-1', 60000, { brain: 'nova' });
 *   // Uses .lock-nova.json instead of .lock-brain.json
 *
 * SECURITY:
 * - Uses atomic file operations to prevent races
 * - Token-based ownership validation before release
 * - Timeout prevents stuck locks
 * - Token cached in memory for secure release
 * - Per-brain lock files prevent cross-brain contention
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

const fs = require('fs');
const path = require('path');
const Encrypt = require('./encrypt');
const vaf = require('./vaf');
const audit = require('./audit');

const LOCK_DIR = '.locks';
const DEFAULT_TIMEOUT_MS = 3600000; // 1 hour
// NOTE (pass 105): the lease is acquired HOT by internal writers (sandbox
// write, shell exec, tmp put/delete) as well as by `vant lock`. A per-agent
// per-minute cap here would throttle those legitimately-frequent internal
// acquires — and rate limiting is QoS's concern anyway (lib/qos.js). The old
// RATE_LIMIT_WINDOW / MAX_ACQUIRES_PER_MINUTE constants and their
// `_checkRateLimit` were dead (never called) and referenced an undefined
// `errors`; removed so the docstring stops promising a limit that never fired.

// v0.9.0 fs->storage migration: lock files are coordination artifacts owned by
// this subsystem and must operate even during races, so writes go through
// storage's atomicWrite (temp+rename) via FileStorage.writeRaw and reads via
// readRaw. Paths are anchored to models/ and validated with vaf so a hostile
// brain name cannot traverse out. raw variants are deliberate: locks must
// keep working when capability gates are locked down (release-before-deny).
const lockStore = new (require('./storage').FileStorage)({
    basePath: path.join((() => { try { return require('./brain').getBrainPath(); } catch (e) { return 'models/private'; } })(), '..')
});



// MULTIBRAIN: Brain-scoped state
const _brainLocks = new Map();

/**
 * Resolve brain from options or current context
 * @param {string|null} brain - Explicit brain name
 * @returns {string|null} - Resolved brain name
 */
function _resolveBrain(brain) {
    if (brain) return brain;
    try {
        const brainMod = require('./brain');
        return brainMod.currentBrain ? brainMod.currentBrain() : null;
    } catch (e) {
        return null;
    }
}

/**
 * Get brain-scoped lock state
 * @param {string|null} brain - Brain name or null for default
 * @returns {object} - Brain lock state
 */
function getBrainLock(brain) {
    const resolvedBrain = _resolveBrain(brain);
    const brainKey = resolvedBrain || 'default';

    if (!_brainLocks.has(brainKey)) {
        _brainLocks.set(brainKey, {
            brain: resolvedBrain,
            lockFile: `.lock-${brainKey}.json`,
            tokenCache: new Map()
        });
    }
    return _brainLocks.get(brainKey);
}

/**
 * Get lock file path for brain
 * @param {string|null} brain - Brain name
 * @returns {string} - Lock file path
 */
function _getBrainLockFile(brain) {
    const brainLock = getBrainLock(brain);
    // Caller-controlled brain name is interpolated into the filename. Validate
    // the NAME itself (same pattern as context.js) - post-hoc path checks are
    // insufficient here because normalize() can absorb the traversal, e.g.
    // '.lock-../../x' collapses to '.locks/x' (odd .. counts escape).
    if (!/^[a-zA-Z0-9_-]+$/.test(brainLock.brain === null ? 'default' : brainLock.brain)) {
        throw new (require('./error').VantError)('Invalid brain name for lock file', { code: 'VAF_PATH_BLOCKED', retryable: false });
    }
    return path.join(LOCK_DIR, brainLock.lockFile);
}

/**
 * Clear token from cache (brain-scoped)
 */
function _clearToken(agentId, brain) {
    const brainLock = getBrainLock(brain);
    brainLock.tokenCache.delete(agentId);
}

/**
 * Store token in cache (brain-scoped)
 */
function _storeToken(agentId, token, brain) {
    const brainLock = getBrainLock(brain);
    brainLock.tokenCache.set(agentId, token);
}

/**
 * Get cached token (brain-scoped)
 */
function _getToken(agentId, brain) {
    const brainLock = getBrainLock(brain);
    return brainLock.tokenCache.get(agentId) || null;
}

function _checkWrite() {
    const _sandbox = (() => { try { return require('./sandbox'); } catch (e) { return null; } })();
    // Gracefully handle missing canWrite - allow if sandbox doesn't exist or canWrite is undefined
    if (_sandbox && typeof _sandbox.canWrite === 'function' && !_sandbox.canWrite()) {
        // Log warning but don't throw - allow lock to proceed in read-only mode
        _emit('brain-lock:writePermissionMissing', { timestamp: Date.now() });
    }
}

/**
 * Ensure lock directory exists
 */
function ensureBrainLockDir() {
    _checkWrite();
    // Directory creation is infrastructure, not data I/O. First writeRaw via
    // storage also auto-creates directories; this just makes it explicit.
    if (!fs.existsSync(path.join(lockStore.basePath, LOCK_DIR))) {
        fs.mkdirSync(path.join(lockStore.basePath, LOCK_DIR), { recursive: true });
    }
}

/**
 * Get agent ID (default: hostname-pid)
 */
function getAgentId() {
    return process.env.VANT_AGENT_ID || `agent-${process.pid}`;
}

/**
 * Generate unique lock token
 */
function generateToken() {
    return Encrypt.generateToken();
}

/**
 * Check if lock is valid (not expired)
 */
function isLockValid(lockData) {
    if (!lockData) return false;
    const age = Date.now() - lockData.timestamp;
    return age < (lockData.timeout || DEFAULT_TIMEOUT_MS);
}

/**
 * Lock Configuration
 */
const BRAIN_LOCK_CONFIG = {
    MAX_ATTEMPTS: 5,           // More attempts (was 3)
    BASE_BACKOFF_MS: 50,        // Exponential backoff base
    MAX_BACKOFF_MS: 1000,      // Cap at 1s
    LOCK_CHECK_INTERVAL: 100    // Check interval when stale
};

/**
 * Sleep helper with optional backoff
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff
 */
function getBackoff(attempt) {
    const backoff = BRAIN_LOCK_CONFIG.BASE_BACKOFF_MS * Math.pow(2, attempt);
    return Math.min(backoff, BRAIN_LOCK_CONFIG.MAX_BACKOFF_MS);
}

/**
 * Acquire the brain lock for agent (atomic, race-condition safe)
 * Uses exponential backoff for better contention handling
 * @param {string} agentId - Optional agent identifier
 * @param {number} timeout - Optional timeout in ms
 * @param {object} options - Optional options
 * @param {string} options.brain - Brain name for multibrain isolation
 * @returns {Promise<string|null>} - Token if acquired, null if failed
 */
async function acquireBrainLock(agentId = null, timeout = DEFAULT_TIMEOUT_MS, options = {}) {
    const brain = options.brain || null;
    const resolvedBrain = _resolveBrain(brain);

    ensureBrainLockDir();

    const currentAgent = agentId || getAgentId();
    vaf.check(currentAgent, { type: 'string', name: 'agentId', maxLength: 100 });
    const lockPath = _getBrainLockFile(resolvedBrain);
    const token = generateToken();

    // Try with exponential backoff for better contention handling
    for (let attempt = 0; attempt < BRAIN_LOCK_CONFIG.MAX_ATTEMPTS; attempt++) {
        let existing = null;
        let existingToken = null;

        // Read existing lock (if any)
        if (lockStore.has(lockPath)) {
            try {
                const content = lockStore.readRaw(lockPath);
                // Token is last line for atomic comparison
                const parts = content.split('\n---\n');
                existing = JSON.parse(parts[0]);
                existingToken = parts[1] || null;
            } catch (e) {
                // Corrupted - try to take over
            }
        }

        // (pass 108 FIX) Check if we already own it — by AGENT IDENTITY, not
        // by token. The old branch compared the file token against a token
        // freshly generated THIS call, so it was dead code: a same-agent
        // re-acquire (nested sandbox.write, `vant lock acquire` twice) was
        // misclassified as contention and FAILED after ~1.5s of backoff while
        // the agent was ALREADY HOLDING the lease. Refresh in place and keep
        // the FILE token stable so outstanding references stay valid.
        if (existing && existing.agentId === currentAgent) {
            existing.timestamp = Date.now();
            existing.timeout = timeout;
            existing.attempt = attempt;
            const keepToken = existingToken || existing.token || token;
            const newContent = JSON.stringify(existing, null, 2) + '\n---\n' + keepToken;
            lockStore.writeRaw(lockPath, newContent);
            audit.info(`[brain-lock] Refreshed lock for ${currentAgent}`);
            _emit('brain-lock:refreshed', { agentId: currentAgent, timestamp: Date.now(), brain: resolvedBrain });
            // Return the file token (stable across refreshes)
            _storeToken(currentAgent, keepToken, resolvedBrain);
            return keepToken;
        }

        // Check if another agent has valid lock
        if (existing && isLockValid(existing)) {
            audit.info(`[brain-lock] Lock held by ${existing.agentId}, attempt ${attempt + 1}/${BRAIN_LOCK_CONFIG.MAX_ATTEMPTS}`);
            // Exponential backoff before retry
            await sleep(getBackoff(attempt));
            // Add small random jitter to reduce collision
            await sleep(Math.floor(Math.random() * 10));
            continue;
        }

        // Lock is stale or missing - acquire it atomically
        const lockData = {
            // Store token in lock file for persistence across restarts
            token: token,
            agentId: currentAgent,
            timestamp: Date.now(),
            timeout: timeout,
            attempt: attempt,  // Track attempts
            pid: process.pid,
            hostname: require('os').hostname()
        };

        const content = JSON.stringify(lockData, null, 2) + '\n---\n' + token;
        const absLockPath = path.join(lockStore.basePath, lockPath);

        // (pass 108 FIX) Take over with an atomic CREATE-OR-FAIL (O_EXCL), not
        // a blind atomic REPLACE. writeRaw is temp+rename: it clobbers whatever
        // is on disk NOW with no freshness re-check, so two agents that both
        // read the same stale lock could BOTH replace it and BOTH pass the
        // read-back verify (last writer wins the file) — two live holders of
        // an "exclusive" lease (observed 1 in 12 probe races). O_EXCL is the
        // compare-and-swap: exactly one create wins; the loser re-reads and
        // backs off. A symlink planted at the path also refuses O_EXCL
        // (EEXIST) and is swept below, preserving the old symlink guard.
        try {
            // Sweep ONLY what we re-verify right now: a planted symlink, or a
            // file still stale/corrupt. A lock that went FRESH between the
            // loop-top read and here is left alone.
            try {
                const st = fs.lstatSync(absLockPath);
                let sweep = st.isSymbolicLink();
                if (!sweep) {
                    try {
                        const re = lockStore.readRaw(lockPath);
                        const reData = JSON.parse(re.split('\n---\n')[0]);
                        sweep = !reData || !isLockValid(reData) || reData.agentId === currentAgent;
                    } catch (e2) { sweep = true; } // vanished or corrupt — sweep
                }
                if (sweep) fs.unlinkSync(absLockPath);
                else { await sleep(getBackoff(attempt)); continue; } // fresh peer lock — back off
            } catch (e3) { /* vanished — O_EXCL below is the arbiter */ }

            const fd = fs.openSync(absLockPath, 'wx'); // create-or-fail: the CAS
            try { fs.writeSync(fd, content); } finally { fs.closeSync(fd); }

            // Verify we got it (read back and check token)
            const verify = lockStore.readRaw(lockPath);
            const vParts = verify.split('\n---\n');
            const vData = JSON.parse(vParts[0]);

            if (vData.agentId === currentAgent && (vParts[1] || '').trim() === token) {
                audit.info(`[brain-lock] Acquired by ${currentAgent}`);

                // EVENT: lock acquired
                _emit('brain-lock:acquired', { agentId: currentAgent, timestamp: Date.now(), brain: resolvedBrain });

                // Cache token for secure release
                _storeToken(currentAgent, token, resolvedBrain);
                return token;
            }
            // Contents changed under us — retry with backoff
            await sleep(getBackoff(attempt));
        } catch (e) {
            // EEXIST: another agent's create won the takeover race — the CAS
            // worked; re-read and back off. Anything else: fs trouble.
            // Either way, next attempt with backoff.
            await sleep(getBackoff(attempt));
        }
    }

    audit.info(`[brain-lock] Could not acquire after ${BRAIN_LOCK_CONFIG.MAX_ATTEMPTS} attempts`);
    return null;
}

/**
 * Release the brain lock (only if we own it with valid token)
 * @param {string} agentId - Optional agent identifier
 * @param {string} token - Token from acquireBrainLock()
 * @param {object} options - Optional options
 * @param {string} options.brain - Brain name for multibrain isolation
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function releaseBrainLock(agentId = null, token = null, options = {}) {
    const brain = options.brain || null;
    const resolvedBrain = _resolveBrain(brain);

    const currentAgent = agentId || getAgentId();
    vaf.check(currentAgent, { type: 'string', name: 'agentId', maxLength: 100 });
    const lockPath = _getBrainLockFile(resolvedBrain);

    if (!lockStore.has(lockPath)) {
        audit.info(`[brain-lock] No lock to release`);
        _clearToken(currentAgent, resolvedBrain);
        return { success: false, message: 'No lock to release' };
    }

    try {
        const content = lockStore.readRaw(lockPath);
        const parts = content.split('\n---\n');
        const existing = JSON.parse(parts[0]);
        const fileToken = parts[1] ? parts[1].trim() : null;

        // Check if agent ID matches AND token matches
        if (existing.agentId === currentAgent) {
            // Verify token - either from param, cache, or file
            const cachedToken = _getToken(currentAgent, resolvedBrain);
            const providedToken = token || cachedToken;

            if (!providedToken || (providedToken !== fileToken && providedToken !== cachedToken)) {
                audit.info(`[brain-lock] Token mismatch - release denied for ${currentAgent}`);
                return { success: false, message: 'Invalid token - release denied' };
            }

            lockStore.delete(lockPath);
            _clearToken(currentAgent, resolvedBrain);
            audit.info(`[brain-lock] Released by ${currentAgent}`);

            // EVENT: lock released
            _emit('brain-lock:released', { agentId: currentAgent, timestamp: Date.now(), brain: resolvedBrain });

            return { success: true, message: 'Lock released' };
        } else {
            audit.info(`[brain-lock] Cannot release - owned by ${existing.agentId}`);
            return { success: false, message: `Lock owned by ${existing.agentId}` };
        }
    } catch (e) {
        audit.info(`[brain-lock] Error releasing: ${e.message}`);
        _clearToken(currentAgent, resolvedBrain);
        return { success: false, message: e.message };
    }
}

/**
 * Check current brain-lock status
 * @param {object} options - Optional options
 * @param {string} options.brain - Brain name for multibrain isolation
 * @returns {object|null} - Lock data or null
 */
function brainLockStatus(options = {}) {
    const brain = options.brain || null;
    const resolvedBrain = _resolveBrain(brain);
    const lockPath = _getBrainLockFile(resolvedBrain);

    if (!lockStore.has(lockPath)) {
        return null;
    }

    try {
        const content = lockStore.readRaw(lockPath);
        const parts = content.split('\n---\n');
        const data = JSON.parse(parts[0]);
        const fileToken = parts[1] ? parts[1].trim() : null;

        if (isLockValid(data)) {
            return {
                agentId: data.agentId,
                token: fileToken,
                age: Date.now() - data.timestamp,
                valid: true,
                brain: resolvedBrain
            };
        } else {
            return {
                agentId: data.agentId,
                token: fileToken,
                age: Date.now() - data.timestamp,
                valid: false,
                stale: true,
                brain: resolvedBrain
            };
        }
    } catch (e) {
        return null;
    }
}

/**
 * Force release the brain lock (admin)
 * @param {object} options - Optional options
 * @param {string} options.brain - Brain name for multibrain isolation
 * @returns {boolean} true if a lock file was deleted, false if none existed
 *   (pass 108 FIX: was undefined, so MCP `vant_lock force` reported
 *   `forceReleased: undefined` instead of a truthful fact)
 */
function forceReleaseBrainLock(options = {}) {
    const brain = options.brain || null;
    const resolvedBrain = _resolveBrain(brain);
    const lockPath = _getBrainLockFile(resolvedBrain);

    if (lockStore.has(lockPath)) {
        lockStore.delete(lockPath);
        audit.info(`[brain-lock] Force released`);
        _emit('brain-lock:force-released', { brain: resolvedBrain, timestamp: Date.now() });
        return true;
    }
    return false;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Check locks across all brains in the stack
 * @param {Object} options - Options
 * @returns {Object} Combined lock status
 */
function getStackLockStatus(options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            // Pass the brain EXPLICITLY (no pushBrain global mutation): the
            // lease status is per-brain and reading it must not move the
            // process-active brain out from under concurrent work.
            results.byBrain[brainName] = brainLockStatus({ ...options, brain: brainName });
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        }
    }

    return results;
}

/**
 * List the locks currently HELD across every brain in the stack.
 * (pass 105: previously spread brain-name STRINGS into junk rows,
 * `{...'abc'}` -> `{0:'a',...}`; now emits real status rows.)
 * @param {Object} options - Options
 * @returns {Array<object>} rows: { brain, agentId, token, age, valid }
 */
function listStackLocks(options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        try {
            const s = brainLockStatus({ ...options, brain: brainName });
            if (s && s.valid) results.push(s);
        } catch (e) {
            // Skip brains whose name/lock cannot be resolved.
        }
    }

    return results;
}

/**
 * Boot/health layer status — matches sibling layers' shape
 * (`{ name, type, enabled, ... }`). Reports the LEASE (who may write), not the
 * cross-process mutex in lib/lock.js.
 * @returns {object}
 */
function getLayerStatus() {
    return {
        name: 'Brain lock',
        type: 'authorization_lease',
        enabled: true,
        trackedBrains: _brainLocks.size,
        defaultTtlMs: DEFAULT_TIMEOUT_MS
    };
}

module.exports = {
    acquireBrainLock,
    releaseBrainLock,
    brainLockStatus,
    forceReleaseBrainLock,
    getAgentId,
    DEFAULT_TIMEOUT_MS,
    BRAIN_LOCK_CONFIG,  // Export config for diagnostics/adjustment
    // MULTIBRAIN exports
    getBrainLock,

    getLayerStatus,

    // Multibrain Stack
    getStackLockStatus,
    listStackLocks
};
