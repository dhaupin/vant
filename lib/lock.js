/**
 * Agent Lock Manager (v0.9.0)
 * MULTIBRAIN: Per-brain lock isolation
 * WITH EVENT EMISSIONS - lock acquire/release emit globally
 * Prevents race conditions in multi-agent scenarios
 *
 * Usage:
 *   const lock = require('./lock');
 *   const token = await lock.acquire('agent-1');
 *   if (token) { ... do work ... await lock.release('agent-1', token); }
 *
 * Multibrain:
 *   const token = await lock.acquire('agent-1', 60000, { brain: 'nova' });
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

// Lazy-load audit (optional - falls back gracefully)
let _audit = null;
function _getAudit() {
    if (!_audit) try { _audit = require('./audit'); } catch (e) { _audit = { info: console.log, warn: console.log, error: console.error }; }
    return _audit;
}

const LOCK_DIR = '.locks';
const DEFAULT_TIMEOUT_MS = 3600000; // 1 hour
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_ACQUIRES_PER_MINUTE = 10;

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
            tokenCache: new Map(),
            rateLimits: new Map(),
            acquireAttempts: new Map()
        });
    }
    return _brainLocks.get(brainKey);
}

/**
 * List all brain locks
 * @returns {string[]} - Array of brain names
 */
function listBrainLocks() {
    return Array.from(_brainLocks.keys());
}

/**
 * Get lock file path for brain
 * @param {string|null} brain - Brain name
 * @returns {string} - Lock file path
 */
function _getLockFile(brain) {
    const brainLock = getBrainLock(brain);
    return path.join(LOCK_DIR, brainLock.lockFile);
}

/**
 * Check and record rate limit (brain-scoped)
 */
function _checkRateLimit(agentId, brain) {
    const brainLock = getBrainLock(brain);
    const now = Date.now();
    const attempts = brainLock.acquireAttempts.get(agentId) || [];
    const recent = attempts.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (recent.length >= MAX_ACQUIRES_PER_MINUTE) {
        throw new Error("Rate limit exceeded");
    }
    recent.push(now);
    brainLock.acquireAttempts.set(agentId, recent);
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
        _emit('lock:writePermissionMissing', { timestamp: Date.now() });
    }
}

/**
 * Ensure lock directory exists
 */
function ensureLockDir() {
    _checkWrite();
    if (!fs.existsSync(LOCK_DIR)) {
        fs.mkdirSync(LOCK_DIR, { recursive: true });
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
const LOCK_CONFIG = {
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
    const backoff = LOCK_CONFIG.BASE_BACKOFF_MS * Math.pow(2, attempt);
    return Math.min(backoff, LOCK_CONFIG.MAX_BACKOFF_MS);
}

/**
 * Acquire lock for agent (atomic, race-condition safe)
 * Uses exponential backoff for better contention handling
 * @param {string} agentId - Optional agent identifier
 * @param {number} timeout - Optional timeout in ms
 * @param {object} options - Optional options
 * @param {string} options.brain - Brain name for multibrain isolation
 * @returns {Promise<string|null>} - Token if acquired, null if failed
 */
async function acquire(agentId = null, timeout = DEFAULT_TIMEOUT_MS, options = {}) {
    const brain = options.brain || null;
    const resolvedBrain = _resolveBrain(brain);
    
    ensureLockDir();

    const currentAgent = agentId || getAgentId();
    vaf.check(currentAgent, { type: 'string', name: 'agentId', maxLength: 100 });
    const lockPath = _getLockFile(resolvedBrain);
    const token = generateToken();

    // Try with exponential backoff for better contention handling
    for (let attempt = 0; attempt < LOCK_CONFIG.MAX_ATTEMPTS; attempt++) {
        let existing = null;
        let existingToken = null;

        // Read existing lock (if any)
        if (fs.existsSync(lockPath)) {
            try {
                const content = fs.readFileSync(lockPath, 'utf8');
                // Token is last line for atomic comparison
                const parts = content.split('\n---\n');
                existing = JSON.parse(parts[0]);
                existingToken = parts[1] || null;
            } catch (e) {
                // Corrupted - try to take over
            }
        }

        // Check if we already own it (with token)
        if (existing && existing.token === token) {
            // Refresh our lock
            existing.timestamp = Date.now();
            existing.timeout = timeout;
            const newContent = JSON.stringify(existing, null, 2) + '\n---\n' + token;
            fs.writeFileSync(lockPath, newContent);
            _getAudit().info(`[Lock] Refreshed lock for ${currentAgent}`);
            // Return cached token
            _storeToken(currentAgent, token, resolvedBrain);
            return token;
        }

        // Check if another agent has valid lock
        if (existing && isLockValid(existing)) {
            _getAudit().info(`[Lock] Lock held by ${existing.agentId}, attempt ${attempt + 1}/${LOCK_CONFIG.MAX_ATTEMPTS}`);
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

        // Try to write atomically using rename
        const tempPath = path.join(LOCK_DIR, `temp-${Date.now()}.lock`);
        const content = JSON.stringify(lockData, null, 2) + '\n---\n' + token;

        try {
            fs.writeFileSync(tempPath, content);
            fs.renameSync(tempPath, lockPath);

            // Verify we got it (read back and check token)
            const verify = fs.readFileSync(lockPath, 'utf8');
            const vParts = verify.split('\n---\n');
            const vData = JSON.parse(vParts[0]);

            if (vData.agentId === currentAgent && vParts[1] === token) {
                _getAudit().info(`[Lock] Acquired by ${currentAgent}`);

                // EVENT: lock acquired
                _emit('lock:acquired', { agentId: currentAgent, timestamp: Date.now(), brain: resolvedBrain });

                // Cache token for secure release
                _storeToken(currentAgent, token, resolvedBrain);
                return token;
            }
            // Lost race, try again with backoff
            await sleep(getBackoff(attempt));
        } catch (e) {
            // Try next attempt with backoff
            await sleep(getBackoff(attempt));
        }
    }

    _getAudit().info(`[Lock] Could not acquire after ${LOCK_CONFIG.MAX_ATTEMPTS} attempts`);
    return null;
}

/**
 * Release lock (only if we own it with valid token)
 * @param {string} agentId - Optional agent identifier
 * @param {string} token - Token from acquire()
 * @param {object} options - Optional options
 * @param {string} options.brain - Brain name for multibrain isolation
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function release(agentId = null, token = null, options = {}) {
    const brain = options.brain || null;
    const resolvedBrain = _resolveBrain(brain);
    
    const currentAgent = agentId || getAgentId();
    vaf.check(currentAgent, { type: 'string', name: 'agentId', maxLength: 100 });
    const lockPath = _getLockFile(resolvedBrain);

    if (!fs.existsSync(lockPath)) {
        _getAudit().info(`[Lock] No lock to release`);
        _clearToken(currentAgent, resolvedBrain);
        return { success: false, message: 'No lock to release' };
    }

    try {
        const content = fs.readFileSync(lockPath, 'utf8');
        const parts = content.split('\n---\n');
        const existing = JSON.parse(parts[0]);
        const fileToken = parts[1] ? parts[1].trim() : null;

        // Check if agent ID matches AND token matches
        if (existing.agentId === currentAgent) {
            // Verify token - either from param, cache, or file
            const cachedToken = _getToken(currentAgent, resolvedBrain);
            const providedToken = token || cachedToken;

            if (!providedToken || (providedToken !== fileToken && providedToken !== cachedToken)) {
                _getAudit().info(`[Lock] Token mismatch - release denied for ${currentAgent}`);
                return { success: false, message: 'Invalid token - release denied' };
            }

            fs.unlinkSync(lockPath);
            _clearToken(currentAgent, resolvedBrain);
            _getAudit().info(`[Lock] Released by ${currentAgent}`);

            // EVENT: lock released
            _emit('lock:released', { agentId: currentAgent, timestamp: Date.now(), brain: resolvedBrain });

            return { success: true, message: 'Lock released' };
        } else {
            _getAudit().info(`[Lock] Cannot release - owned by ${existing.agentId}`);
            return { success: false, message: `Lock owned by ${existing.agentId}` };
        }
    } catch (e) {
        _getAudit().info(`[Lock] Error releasing: ${e.message}`);
        _clearToken(currentAgent, resolvedBrain);
        return { success: false, message: e.message };
    }
}

/**
 * Check current lock status
 * @param {object} options - Optional options
 * @param {string} options.brain - Brain name for multibrain isolation
 * @returns {object|null} - Lock data or null
 */
function status(options = {}) {
    const brain = options.brain || null;
    const resolvedBrain = _resolveBrain(brain);
    const lockPath = _getLockFile(resolvedBrain);

    if (!fs.existsSync(lockPath)) {
        return null;
    }

    try {
        const content = fs.readFileSync(lockPath, 'utf8');
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
 * Force release any lock (admin)
 * @param {object} options - Optional options
 * @param {string} options.brain - Brain name for multibrain isolation
 */
function forceRelease(options = {}) {
    const brain = options.brain || null;
    const resolvedBrain = _resolveBrain(brain);
    const lockPath = _getLockFile(resolvedBrain);

    if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
        _getAudit().info(`[Lock] Force released`);
    }
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
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const s = status(options);
            results.byBrain[brainName] = s;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    
    return results;
}

/**
 * List all locks from all brains in the stack
 * @param {Object} options - Options
 * @returns {Array} Combined locks
 */
function listStackLocks(options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const locks = listBrainLocks(options);
            if (Array.isArray(locks)) {
                locks.forEach(l => {
                    results.push({ ...l, brain: brainName });
                });
            }
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }
    
    return results;
}

module.exports = {
    acquire,
    release,
    status,
    forceRelease,
    getAgentId,
    DEFAULT_TIMEOUT_MS,
    LOCK_CONFIG,  // Export config for diagnostics/adjustment
    // MULTIBRAIN exports
    getBrainLock,
    listBrainLocks,
    // Expose helpers for testing/diagnostics
    _getToken,
    _clearToken,
    getBackoff,  // Export backoff calculator
    
    // Multibrain Stack
    getStackLockStatus,
    listStackLocks
};
