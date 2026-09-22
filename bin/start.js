#!/usr/bin/env node
const vaf = require("../lib/vaf");
// VAF: No user input - fixed --sync flag only
/**
 * Vant Start
 * Full startup: migrate → health → sync → ready
 *
 * NOTE: Does NOT auto-sync. User must run vant sync manually
 * to comply with GitHub TOS.
 *
 * Migration auto-run: brain layout migrations (lib/migrations.js) are
 * idempotent, content-detected, and dry-runnable — running them on start
 * means a pre-multibrain (old single-public-brain) user's brain is imported
 * automatically instead of silently invisible. Opt out: --no-migrate.
 *
 * Usage: vant start
 *        vant start --sync  (if you want to sync)
 *        vant start --no-migrate  (skip layout migration)
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
    const doMigrate = !args.includes('--no-migrate');

    console.log(`
╔═══════════════════════════════════════╗
║         Vant Starting             ║
╚═══════════════════════════════════════╝
`);

    const runHealth = () => {
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
    };

    if (!doMigrate) {
        runHealth();
        return;
    }

    // Brain layout migration (idempotent; no-op when layout is current)
    console.log('[Start] Checking brain layout...');
    const mig = spawn('node', [path.join(BIN_DIR, 'migrate.js')], {
        stdio: 'inherit'
    });

    mig.on('close', (code) => {
        if (code === 0) {
            console.log('[Start] Brain layout OK.');
        } else {
            // Migrate exits 1 on real failures; layout problems should be
            // visible, not fatal — health check reports the state next.
            console.log(`[Start] Brain layout migration exited ${code} — continuing (see output above).`);
        }
        runHealth();
    });

    mig.on('error', () => {
        console.log('[Start] Could not run layout migration — continuing.');
        runHealth();
    });
}

main();