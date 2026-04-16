#!/usr/bin/env node
/**
 * Vant Watch
 * Monitor GitHub for changes
 * 
 * Usage: vant watch
 *        vant watch --interval 30
 */

const { execSync } = require('child_process');
const fs = require('fs');

const DEFAULT_INTERVAL = 60; // seconds

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
 * Check for remote changes
 */
function checkForChanges() {
    try {
        const fetch = execSync('git fetch origin', { encoding: 'utf8', stdio: 'pipe' });
        const local = getCurrentCommit();
        const remote = execSync('git rev-parse origin/main', { encoding: 'utf8' }).trim();
        
        return local !== remote;
    } catch (e) {
        return false;
    }
}

/**
 * Main
 */
function main() {
    const args = process.argv.slice(3);
    let interval = DEFAULT_INTERVAL;
    
    // Parse args
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--interval' && args[i + 1]) {
            interval = parseInt(args[i + 1]);
        }
    }
    
    console.log(`
╔═══════════════════════════════════════╗
║         Vant Watch                 ║
╚═══════════════════════════════════════╝

Watching for changes every ${interval} seconds...
(Ctrl+C to stop)
`);
    
    const local = getCurrentCommit();
    console.log(`Current: ${local}\n`);
    
    // Poll loop
    const poll = () => {
        if (checkForChanges()) {
            console.log(`[${new Date().toISOString()}] Changes detected on remote!`);
            console.log('Run: vant sync pull');
        } else {
            process.stdout.write('.');
        }
    };
    
    setInterval(poll, interval * 1000);
}

main();