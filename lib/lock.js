/**
 * Agent Lock Manager
 * Prevents race conditions in multi-agent scenarios
 * 
 * Usage:
 *   const lock = require('./lock');
 *   const token = await lock.acquire('agent-1');
 *   if (token) { ... do work ... await lock.release('agent-1', token); }
 * 
 * SECURITY:
 * - Uses atomic file operations to prevent races
 * - Token-based ownership validation before release
 * - Timeout prevents stuck locks
 * - Token cached in memory for secure release
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vaf = require('./vaf');

const LOCK_DIR = '.agent-locks';
const LOCK_FILE = 'current.lock';
const DEFAULT_TIMEOUT_MS = 3600000; // 1 hour
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_ACQUIRES_PER_MINUTE = 10;
let _acquireAttempts = new Map();

// Token cache for secure release - maps agentId -> token
let _tokenCache = new Map();

/**
 * Check and record rate limit
 */
function _checkRateLimit(agentId) {
    const now = Date.now();
    const attempts = _acquireAttempts.get(agentId) || [];
    const recent = attempts.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (recent.length >= MAX_ACQUIRES_PER_MINUTE) {
        throw new Error("Rate limit exceeded");
    }
    recent.push(now);
    _acquireAttempts.set(agentId, recent);
}

/**
 * Clear token from cache
 */
function _clearToken(agentId) {
    _tokenCache.delete(agentId);
}

/**
 * Store token in cache
 */
function _storeToken(agentId, token) {
    _tokenCache.set(agentId, token);
}

/**
 * Get cached token
 */
function _getToken(agentId) {
    return _tokenCache.get(agentId) || null;
}

/**
 * Ensure lock directory exists
 */
function ensureLockDir() {
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
    return crypto.randomBytes(16).toString('hex');
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
 * @returns {Promise<string|null>} - Token if acquired, null if failed
 */
async function acquire(agentId = null, timeout = DEFAULT_TIMEOUT_MS) {
    ensureLockDir();
    
    const currentAgent = agentId || getAgentId();
    vaf.check(currentAgent, { type: 'string', name: 'agentId', maxLength: 100 });
    const lockPath = path.join(LOCK_DIR, LOCK_FILE);
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
            console.log(`[Lock] Refreshed lock for ${currentAgent}`);
            // Return cached token
            _storeToken(currentAgent, token);
            return token;
        }
        
        // Check if another agent has valid lock
        if (existing && isLockValid(existing)) {
            console.log(`[Lock] Lock held by ${existing.agentId}, attempt ${attempt + 1}/${LOCK_CONFIG.MAX_ATTEMPTS}`);
            // Exponential backoff before retry
            await sleep(getBackoff(attempt));
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
                console.log(`[Lock] Acquired by ${currentAgent}`);
                // Cache token for secure release
                _storeToken(currentAgent, token);
                return token;
            }
            // Lost race, try again with backoff
            await sleep(getBackoff(attempt));
        } catch (e) {
            // Try next attempt with backoff
            await sleep(getBackoff(attempt));
        }
    }
    
    console.log(`[Lock] Could not acquire after ${LOCK_CONFIG.MAX_ATTEMPTS} attempts`);
    return null;
}

/**
 * Release lock (only if we own it with valid token)
 * @param {string} agentId - Optional agent identifier
 * @param {string} token - Token from acquire()
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function release(agentId = null, token = null) {
    const currentAgent = agentId || getAgentId();
    vaf.check(currentAgent, { type: 'string', name: 'agentId', maxLength: 100 });
    const lockPath = path.join(LOCK_DIR, LOCK_FILE);
    
    if (!fs.existsSync(lockPath)) {
        console.log(`[Lock] No lock to release`);
        _clearToken(currentAgent);
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
            const cachedToken = _getToken(currentAgent);
            const providedToken = token || cachedToken;
            
            if (!providedToken || (providedToken !== fileToken && providedToken !== cachedToken)) {
                console.log(`[Lock] Token mismatch - release denied for ${currentAgent}`);
                return { success: false, message: 'Invalid token - release denied' };
            }
            
            fs.unlinkSync(lockPath);
            _clearToken(currentAgent);
            console.log(`[Lock] Released by ${currentAgent}`);
            return { success: true, message: 'Lock released' };
        } else {
            console.log(`[Lock] Cannot release - owned by ${existing.agentId}`);
            return { success: false, message: `Lock owned by ${existing.agentId}` };
        }
    } catch (e) {
        console.log(`[Lock] Error releasing: ${e.message}`);
        _clearToken(currentAgent);
        return { success: false, message: e.message };
    }
}

/**
 * Check current lock status
 * @returns {object|null} - Lock data or null
 */
function status() {
    const lockPath = path.join(LOCK_DIR, LOCK_FILE);
    
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
                valid: true
            };
        } else {
            return {
                agentId: data.agentId,
                token: fileToken,
                age: Date.now() - data.timestamp,
                valid: false,
                stale: true
            };
        }
    } catch (e) {
        return null;
    }
}

/**
 * Force release any lock (admin)
 */
function forceRelease() {
    const lockPath = path.join(LOCK_DIR, LOCK_FILE);
    
    if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
        console.log(`[Lock] Force released`);
    }
}

module.exports = {
    acquire,
    release,
    status,
    forceRelease,
    getAgentId,
    DEFAULT_TIMEOUT_MS,
    LOCK_CONFIG,  // Export config for diagnostics/adjustment
    // Expose helpers for testing/diagnostics
    _getToken,
    _clearToken,
    getBackoff  // Export backoff calculator
};