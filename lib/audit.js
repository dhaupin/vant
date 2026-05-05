/**
 * Vant Audit Ledger
 *
 * Append-only, tamper-proof logging
 * Logs: island hydration, stego snapshot, RAID sync
 *
 * Usage:
 *   const audit = require('./lib/audit');
 *   audit.log('island:github:hydrate');
 *   audit.getLedger();
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODELS_PATH = path.join(__dirname, '..', 'models');
const LEDGER_FILE = path.join(MODELS_PATH, '.audit.json');
const VERSION = '1.0';

/**
 * Load ledger
 */
function loadLedger() {
    if (fs.existsSync(LEDGER_FILE)) {
        return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
    }
    return { version: VERSION, entries: [] };
}

/**
 * Save ledger
 */
function saveLedger(data) {
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(data, null, 2));
}

/**
 * Generate entry hash
 */
function hashEntry(entry) {
    const prevHash = loadLedger().entries.slice(-1)[0]?.hash || 'genesis';
    const data = prevHash + entry.action + entry.timestamp;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8);
}

/**
 * Log an action
 * @param {string} action - Action type (island:hydrate, sync:push, stego:snap)
 * @param {object} meta - Metadata
 */
function log(action, meta = {}) {
    const ledger = loadLedger();
    
    const entry = {
        id: ledger.entries.length + 1,
        timestamp: new Date().toISOString(),
        action,
        meta,
        hash: '' // Will set after
    };
    
    // Generate hash (chain with previous)
    entry.hash = hashEntry(entry);
    
    ledger.entries.push(entry);
    saveLedger(ledger);
    
    console.log('[Audit] ' + action);
    return entry;
}

/**
 * Log island hydration
 */
function logHydrate(island, success) {
    return log('island:' + island + ':' + (success ? 'hydrate' : 'fail'), { success });
}

/**
 * Log stego snapshot
 */
function logStego(action, file) {
    return log('stego:' + action, { file });
}

/**
 * Log sync
 */
function logSync(provider, action) {
    return log('sync:' + provider + ':' + action, { provider });
}

/**
 * Get ledger entries
 * @param {number} limit - Last N entries
 * @returns {object[]}
 */
function getLedger(limit = 100) {
    const ledger = loadLedger();
    return ledger.entries.slice(-limit);
}

/**
 * Get sequence for health check
 * @returns {object} Health result
 */
function healthCheck() {
    const entries = getLedger(50);
    const now = new Date();
    
    // Check for logical soundness
    let lastAction = null;
    let issues = [];
    
    for (const e of entries) {
        // Basic ordering check
        if (lastAction && new Date(e.timestamp) < new Date(lastAction.timestamp)) {
            issues.push('Time regression at entry ' + e.id);
        }
        lastAction = e;
    }
    
    return {
        healthy: issues.length === 0,
        entries: entries.length,
        issues,
        lastEntry: entries.slice(-1)[0] || null
    };
}

/**
 * Verify ledger integrity
 * @returns {boolean}
 */
function verify() {
    const ledger = loadLedger();
    let prevHash = 'genesis';
    
    for (const entry of ledger.entries) {
        const expectedHash = crypto.createHash('sha256')
            .update(prevHash + entry.action + entry.timestamp)
            .digest('hex').substring(0, 8);
        
        if (entry.hash !== expectedHash) {
            console.log('[Audit] Hash mismatch at entry ' + entry.id);
            return false;
        }
        prevHash = entry.hash;
    }
    
    return true;
}

/**
 * Clear ledger (for testing)
 */
function clear() {
    saveLedger({ version: VERSION, entries: [] });
}

module.exports = {
    log,
    logHydrate,
    logStego,
    logSync,
    getLedger,
    healthCheck,
    verify,
    clear
};