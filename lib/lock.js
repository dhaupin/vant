/**
 * Agent Lock Manager
 * Prevents race conditions in multi-agent scenarios
 * 
 * Usage:
 *   const lock = require('./lock');
 *   const acquired = await lock.acquire('agent-1');
 *   if (acquired) { ... do work ... await lock.release(); }
 */

const fs = require('fs');
const path = require('path');

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
    return process.env.VANT_AGENT_ID || `agent-${process.pid}-${Date.now()}`;
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
 * Acquire lock for agent
 * @param {string} agentId - Optional agent identifier
 * @param {number} timeout - Optional timeout in ms
 * @returns {Promise<boolean>} - True if lock acquired
 */
async function acquire(agentId = null, timeout = DEFAULT_TIMEOUT_MS) {
    ensureLockDir();
    
    const currentAgent = agentId || getAgentId();
    const lockPath = path.join(LOCK_DIR, LOCK_FILE);
    
    // Check existing lock
    if (fs.existsSync(lockPath)) {
        try {
            const existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            
            // Same agent, refresh lock
            if (existing.agentId === currentAgent) {
                existing.timestamp = Date.now();
                existing.timeout = timeout;
                fs.writeFileSync(lockPath, JSON.stringify(existing, null, 2));
                console.log(`[Lock] Refreshed lock for ${currentAgent}`);
                return true;
            }
            
            // Different agent - check if stale
            if (!isLockValid(existing)) {
                console.log(`[Lock] Stale lock detected, taking over`);
            } else {
                console.log(`[Lock] Lock held by ${existing.agentId}, waiting...`);
                return false;
            }
        } catch (e) {
            // Corrupted lock, take over
            console.log(`[Lock] Corrupted lock, taking over`);
        }
    }
    
    // Create new lock
    const lockData = {
        agentId: currentAgent,
        timestamp: Date.now(),
        timeout: timeout,
        pid: process.pid,
        hostname: require('os').hostname()
    };
    
    fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2));
    console.log(`[Lock] Acquired by ${currentAgent}`);
    return true;
}

/**
 * Release lock
 * @param {string} agentId - Optional agent identifier
 */
async function release(agentId = null) {
    const currentAgent = agentId || getAgentId();
    const lockPath = path.join(LOCK_DIR, LOCK_FILE);
    
    if (!fs.existsSync(lockPath)) {
        console.log(`[Lock] No lock to release`);
        return;
    }
    
    try {
        const existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        
        if (existing.agentId === currentAgent) {
            fs.unlinkSync(lockPath);
            console.log(`[Lock] Released by ${currentAgent}`);
        } else {
            console.log(`[Lock] Cannot release - owned by ${existing.agentId}`);
        }
    } catch (e) {
        console.log(`[Lock] Error releasing: ${e.message}`);
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