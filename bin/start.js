#!/usr/bin/env node
const vaf = require("../lib/vaf");
// VAF: No user input - fixed --sync flag only
/**
 * Vant Start
 * Full startup: health → sync → ready
 * 
 * NOTE: Does NOT auto-sync. User must run vant sync manually
 * to comply with GitHub TOS.
 * 
 * Usage: vant start
 *        vant start --sync  (if you want to sync)
 */

const { spawn } = require('child_process');
const path = require('path');

const BIN_DIR = __dirname;

/**
 * Main
 */
function main() {
    const args = process.argv.slice(3);
    const doSync = args.includes('--sync');
    
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
        console.log(`\n[Start] Health: ${code === 0 ? 'OK' : 'WARNINGS'}`);
        
        if (doSync) {
            console.log('\n[Start] Syncing...');
            const sync = spawn('node', [path.join(BIN_DIR, 'sync.js'), 'pull'], {
                stdio: 'inherit'
            });
            
            sync.on('close', (code) => {
                console.log(`\n[Start] Sync: ${code === 0 ? 'OK' : 'FAILED'}`);
                console.log('\n[Start] Ready!\n');
            });
        } else {
            console.log('\n[Start] Ready!');
            console.log('[Start] Run "vant sync pull" manually when ready');
            console.log('');
        }
    });
}

main();