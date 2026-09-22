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

    // Brain layout migration (idempotent; no-op when layout is current).
    // stdio pipe (not inherit) so we can detect whether the import actually
    // moved anything and give legacy users a clear, friendly alert.
    console.log('[Start] Checking brain layout...');
    const mig = spawn('node', [path.join(BIN_DIR, 'migrate.js')], {
        stdio: ['ignore', 'pipe', 'inherit']
    });

    let migOut = '';
    mig.stdout.on('data', d => { migOut += d; process.stdout.write(d); });

    mig.on('close', (code) => {
        if (code === 0) {
            console.log('[Start] Brain layout OK.');
            // Legacy import happened? Tell the user what changed, warmly.
            // Requires a NON-ZERO file count — a 0-file import is a no-op,
            // not a migration worth banner space.
            const m = migOut.match(/legacy\.multibrain-import[^{]*\{[^}]*\}/);
            if (m) {
                let imported = null, brainName = 'vant';
                try {
                    const parsed = JSON.parse(m[0].slice(m[0].indexOf('{')));
                    imported = parsed.imported;
                    brainName = parsed.brain || brainName;
                } catch (e) { /* cosmetic only */ }
                if (imported > 0) {
                    console.log('');
                    console.log('╔═══════════════════════════════════════════════════╗');
                    console.log('║  🧠 BRAIN MIGRATED to the multi-brain layout      ║');
                    console.log('╚═══════════════════════════════════════════════════╝');
                    console.log(`  Your old-style brain was imported${imported != null ? ` (${imported} files)` : ''} as brain "${brainName}".`);
                    console.log(`  Files now live in models/public/${brainName}/ and models/private/${brainName}/.`);
                    console.log('  Nothing was lost — verify with: vant migrate --status');
                    console.log(`  Prefer a different name? vant migrate --brain-name <name>`);
                    console.log('');
                }
            } else if (/could not verify/.test(migOut)) {
                console.log('');
                console.log('⚠  Brain layout migration ran but could NOT verify your brain is readable.');
                console.log('   Your files were moved but the layout was not marked migrated.');
                console.log('   Inspect models/{public,private}/ and re-run `vant migrate`.');
                console.log('');
            }
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