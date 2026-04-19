#!/usr/bin/env node
/**
 * Vant Watch
 * Monitor GitHub for changes
 * 
 * Usage: vant watch
 *        vant watch --interval 30
 *        vant watch --daemon  (run in background)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let logger;
try {
    logger = require('../lib/logger');
} catch (e) {
    logger = {
        info: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console)
    };
}

const DEFAULT_INTERVAL = 60; // seconds
const PID_FILE = '.vant-watch.pid';

/**
 * Get current commit hash
 */
function getCurrentCommit() {
    try {
        return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch (e) {
        return null;
    }
}

/**
 * Get remote commit hash
 */
function getRemoteCommit() {
    try {
        execSync('git fetch origin', { encoding: 'utf8', stdio: 'pipe' });
        return execSync('git rev-parse origin/main', { encoding: 'utf8' }).trim();
    } catch (e) {
        return null;
    }
}

/**
 * Check for remote changes
 */
function checkForChanges() {
    const local = getCurrentCommit();
    const remote = getRemoteCommit();
    
    if (!local || !remote) return false;
    return local !== remote;
}

/**
 * Save PID for daemon mode
 */
function savePid() {
    fs.writeFileSync(PID_FILE, process.pid.toString());
}

/**
 * Remove PID file
 */
function removePid() {
    if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
    }
}

/**
 * Notify (placeholder for stegoframe/email/etc)
 */
function notify(message) {
    console.log(`\n⚠ ${message}`);
    logger.warn(message);
}

/**
 * Main
 */
function main() {
    const args = process.argv.slice(3);
    let interval = DEFAULT_INTERVAL;
    let daemon = false;
    
    // Parse args
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--interval' && args[i + 1]) {
            interval = parseInt(args[i + 1]);
        } else if (args[i] === '--daemon') {
            daemon = true;
        }
    }
    
    if (daemon) {
        savePid();
    }
    
    console.log(`
╔═══════════════════════════════════════╗
║         Vant Watch                 ║
╚═══════════════════════════════════════╝

Watching for changes every ${interval} seconds...
(Ctrl+C to stop, or --daemon to run in background)
`);
    
    const local = getCurrentCommit();
    console.log(`Current: ${local}\n`);
    
    // Poll loop
    let dotCount = 0;
    const poll = () => {
        if (checkForChanges()) {
            notify(`Changes detected on remote! Run: vant sync pull`);
            dotCount = 0;
        } else {
            dotCount++;
            process.stdout.write('.');
            if (dotCount >= 60) {
                console.log('');
                dotCount = 0;
            }
        }
    };
    
    setInterval(poll, interval * 1000);
    
    // Cleanup on exit
    process.on('SIGINT', () => {
        console.log('\n\nStopping watch...');
        removePid();
        process.exit(0);
    });
}

main();