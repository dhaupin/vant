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
const theme = require('../lib/theme');

// Lazy-load sandbox
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) { try { _sandbox = require("./lib/sandbox"); } catch (e) {} }
    return _sandbox;
}
function _checkRead() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canRead()) throw new Error("Read required"); }
function _checkWrite() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canWrite()) throw new Error("Write required"); }
const path = require('path');
const lock = require('../lib/lock');

const LOCK_TOKEN_FILE = path.join(__dirname, '..', '.lock-brain-token');

const args = process.argv.slice(2);
const action = args[0];

/**
 * Save token to file for cross-process persistence
 */
function saveToken(token) {
    _checkWrite();

    if (token) {
        fs.writeFileSync(LOCK_TOKEN_FILE, token);
    }
}

/**
 * Load token from file
 */
function loadToken() {
    _checkRead();

    if (fs.existsSync(LOCK_TOKEN_FILE)) {
        return fs.readFileSync(LOCK_TOKEN_FILE, 'utf8').trim();
    }
    return null;
}

/**
 * Clear token file
 */
function clearToken() {
    _checkWrite();

    if (fs.existsSync(LOCK_TOKEN_FILE)) {
        fs.unlinkSync(LOCK_TOKEN_FILE);
    }
}

async function main() {
    switch (action) {
        case 'acquire':
        case 'acq':
            const token = await lock.acquire('brain');
            if (token) {
                saveToken(token);
                console.log(theme.status.ok('Lock acquired'));
                console.log('Token:', token);
            } else {
                console.log(theme.status.fail('Could not acquire lock'));
                const status = lock.status();
                if (status) {
                    console.log(`Held by: ${status.agentId} (${status.age}ms old)`);
                }
            }
            break;
            
        case 'release':
        case 'rel':
            const inputToken = args[1] || loadToken();
            const result = await lock.release('brain', inputToken);
            if (result) {
                clearToken();
                console.log(theme.status.ok('Lock released'));
            } else {
                console.log(theme.status.fail('Release failed'));
            }
            break;
            
        case 'status':
        case 'stat':
            const status = lock.status();
            if (status) {
                console.log('Lock Status:');
                console.log('  Agent:', status.agentId);
                console.log('  Age:', status.age, 'ms');
                console.log('  Valid:', status.valid);
                console.log('  Stale:', status.stale || false);
            } else {
                console.log(theme.status.warn('No lock held'));
            }
            break;
            
        case 'force':
            lock.forceRelease();
            console.log(theme.status.ok('Lock force released'));
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