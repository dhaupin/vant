#!/usr/bin/env node
/**
 * vant lock - Brain lock management CLI
 * 
 * Usage:
 *   vant lock acquire   - Acquire brain lock
 *   vant lock release   - Release brain lock
 *   vant lock status   - Show lock status
 *   vant lock force    - Force release lock (admin)
 */

const fs = require('fs');
const path = require('path');
const lock = require('../lib/lock');
const brain = require('../lib/brain');

const LOCK_TOKEN_FILE = path.join(__dirname, '..', '.brain-lock-token');

const args = process.argv.slice(2);
const action = args[0];

/**
 * Save token to file for cross-process persistence
 */
function saveToken(token) {
    if (token) {
        fs.writeFileSync(LOCK_TOKEN_FILE, token);
    }
}

/**
 * Load token from file
 */
function loadToken() {
    if (fs.existsSync(LOCK_TOKEN_FILE)) {
        return fs.readFileSync(LOCK_TOKEN_FILE, 'utf8').trim();
    }
    return null;
}

/**
 * Clear token file
 */
function clearToken() {
    if (fs.existsSync(LOCK_TOKEN_FILE)) {
        fs.unlinkSync(LOCK_TOKEN_FILE);
    }
}

async function main() {
    switch (action) {
        case 'acquire':
        case 'acq':
            const token = await brain.acquireBrainLock();
            if (token) {
                saveToken(token);
                console.log('✓ Lock acquired');
                console.log('Token:', token);
            } else {
                console.log('✗ Could not acquire lock');
                const status = brain.getLockStatus();
                if (status) {
                    console.log(`Held by: ${status.agentId} (${status.age}ms old)`);
                }
            }
            break;
            
        case 'release':
        case 'rel':
            const inputToken = args[1] || loadToken();
            const result = await brain.releaseBrainLock(inputToken);
            if (result.success) {
                clearToken();
                console.log('✓ Lock released');
            } else {
                console.log('✗ Release failed:', result.message);
            }
            break;
            
        case 'status':
        case 'stat':
            const status = brain.getLockStatus();
            if (status) {
                console.log('Lock Status:');
                console.log('  Agent:', status.agentId);
                console.log('  Age:', status.age, 'ms');
                console.log('  Valid:', status.valid);
                console.log('  Stale:', status.stale || false);
            } else {
                console.log('No lock held');
            }
            break;
            
        case 'force':
            lock.forceRelease();
            console.log('✓ Lock force released');
            break;
            
        default:
            console.log(`
Vant Brain Lock Management

Usage: vant lock <command>

Commands:
  acquire (acq)   Acquire brain lock for writes
  release (rel)    Release brain lock [token]
  status (stat)    Show lock status
  force           Force release (admin)

Examples:
  vant lock acquire
  vant lock release abc123token
  vant lock status
  vant lock force
`);
            break;
    }
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});