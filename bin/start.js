#!/usr/bin/env node
/**
 * Vant Start
 * Full startup: health → sync → run
 * 
 * Usage: vant start
 */

const { spawn } = require('child_process');
const path = require('path');

const BIN_DIR = __dirname;

/**
 * Main
 */
function main() {
    console.log(`
╔═══════════════════════════════════════╗
║         Vant Starting             ║
╚═══════════════════════════════════════╝
`);
    
    // Run health check
    console.log('\n[Start] Running health check...');
    const health = spawn('node', [path.join(BIN_DIR, 'health.js')], {
        stdio: 'inherit'
    });
    
    health.on('close', (code) => {
        console.log(`\n[Start] Health check: ${code === 0 ? 'OK' : 'WARNINGS'}`);
        
        // Run sync
        console.log('\n[Start] Syncing...');
        const sync = spawn('node', [path.join(BIN_DIR, 'sync.js'), 'pull'], {
            stdio: 'inherit'
        });
        
        sync.on('close', (code) => {
            console.log(`\n[Start] Sync: ${code === 0 ? 'OK' : 'FAILED'}`);
            console.log('\n[Start] Ready!\n');
        });
    });
}

main();