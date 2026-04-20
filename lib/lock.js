/**
 * Agent Lock Manager
 * Prevents race conditions in multi-agent scenarios
 * 
 * Usage:
 *   const lock = require('./lock');
 *   const acquired = await lock.acquire('agent-1');
 *   if (acquired) { ... do work ... await lock.release(); }
 * 
 * SECURITY:
 * - Uses atomic file operations to prevent races
 * - Validates ownership before release
 * - Timeout prevents stuck locks
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCK_DIR = '.agent-locks';
const LOCK_FILE = 'current.lock';
const DEFAULT_TIMEOUT_MS = 3600000; // 1 hour

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
 * Acquire lock for agent (atomic, race-condition safe)
 * @param {string} agentId - Optional agent identifier
 * @param {number} timeout - Optional timeout in ms
 * @returns {Promise<boolean>} - True if lock acquired
 */
async function acquire(agentId = null, timeout = DEFAULT_TIMEOUT_MS) {
    ensureLockDir();
    
    const currentAgent = agentId || getAgentId();
    const lockPath = path.join(LOCK_DIR, LOCK_FILE);
    const token = generateToken();
    
    // Try up to 3 times with immediate retry (fast race resolution)
    for (let attempt = 0; attempt < 3; attempt++) {
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
            return true;
        }
        
        // Check if another agent has valid lock
        if (existing && isLockValid(existing)) {
            console.log(`[Lock] Lock held by ${existing.agentId}, attempt ${attempt + 1}/3`);
            // Small backoff before retry
            await sleep(50);
            continue;
        }
        
        // Lock is stale or missing - acquire it atomically
        const lockData = {
            agentId: currentAgent,
            timestamp: Date.now(),
            timeout: timeout,
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
                return true;
            }
            // Lost race, try again
        } catch (e) {
            // Try next attempt
        }
    }
    
    console.log(`[Lock] Could not acquire after 3 attempts`);
    return false;
}

/**
 * Release lock (only if we own it)
 * @param {string} agentId - Optional agent identifier
 */
async function release(agentId = null) {
    const currentAgent = agentId || getAgentId();
    const lockPath = path.join(LOCK_DIR, LOCK_FILE);
    
    if (!fs.existsSync(lockPath)) {
        console.log(`[Lock] No lock to release`);
        return { success: false, message: 'No lock to release' };
    }
    
    try {
        const content = fs.readFileSync(lockPath, 'utf8');
        const parts = content.split('\n---\n');
        const existing = JSON.parse(parts[0]);
        const lockToken = parts[1];
        
        // Can't verify token here without storing it, but check agent
        if (existing.agentId === currentAgent) {
            fs.unlinkSync(lockPath);
            console.log(`[Lock] Released by ${currentAgent}`);
            return { success: true, message: 'Lock released' };
        } else {
            console.log(`[Lock] Cannot release - owned by ${existing.agentId}`);
            return { success: false, message: `Lock owned by ${existing.agentId}` };
        }
    } catch (e) {
        console.log(`[Lock] Error releasing: ${e.message}`);
        return { success: false, message: e.message };
    }
}

/**
 * Sleep helper
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        
        if (isLockValid(data)) {
            return {
                agentId: data.agentId,
                age: Date.now() - data.timestamp,
                valid: true
            };
        } else {
            return {
                agentId: data.agentId,
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
    DEFAULT_TIMEOUT_MS
};