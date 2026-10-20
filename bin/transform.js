#!/usr/bin/env node
/**
 * Vant Transform CLI
 *
 * Usage:
 *   node bin/transform.js gather           # Gather basic data
 *   node bin/transform.js full            # Gather EVERYTHING (full state)
 *   node bin/transform.js horcrux <svg> <pass>   # Create horcrux (SVG embed)
 *   node bin/transform.js backup          # Full backup to JSON
 *   node bin/transform.js extract <svg> <pass>   # Decode horcrux, print data
 *   node bin/transform.js restore <svg> <pass>   # Decode + full restore
 *   node bin/transform.js status         # Show security status
 *
 * (pass 30) extract/restore use the REAL lib API: transform.fromHorcrux()
 * (handles .svg stego + .json, filename p_<pw>, VANT_BRAIN_PASSWORD) +
 * transform.restore() — which IS the full restore since the 0.8.6 payload
 * unwrap fix. The old code called transform.fromSvg()/restoreFull(), which
 * do not exist in lib/transform.js exports; both cases could only ever
 * throw "transform.fromSvg is not a function".
 */

const transform = require('../lib/transform');

const args = process.argv.slice(2);
// (pass 92) -h/--help prints the subcommands instead of falling into the
// dispatch switch as an unknown command and exiting 1.
if (args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: node bin/transform.js <command>');
    console.log('');
    console.log('  gather [--brains <a,b>]            Gather basic data');
    console.log('  full [--brains <a,b>]              Gather EVERYTHING (full state)');
    console.log('  horcrux <svg> <pass> [--brains <a,b>]  Create horcrux (SVG embed)');
    console.log('  backup [--brains <a,b>]            Full backup to JSON');
    console.log('');
    console.log('  --brains <a,b>: issue #219 payload scope — captures ONLY those');
    console.log('  brains. Without it, the gather bundles ALL brains in the install');
    console.log('  (file bodies included), not just those in state.json.');
    console.log('');
    console.log('  extract <svg> <pass>   Decode horcrux, print data');
    console.log('  restore <svg> <pass>   Decode + full restore');
    console.log('  status                 Show security status');
    process.exit(0);
}
const command = args[0];

// (issue #219 CLI closure — the Cairn gap from prestruct) THE PAYLOAD
// FILTER on the transform face: --brains <a,b> scopes WHICH brains the
// gather captures. The lib law has supported the allowlist since issue
// #219 (transform.gather({ brains }) scopes both the storage walk AND
// the mode inventory), and `vant snapshot` + `vant horcrux` expose it —
// but this file passed nothing through, so `vant transform gather` and
// friends deliberately captured ALL brains in the install ("snapshot
// captures all brains, not just those in state.json") with no CLI
// filter. Same output contract as snapshot.js: an empty --brains value
// is a caller error (refuser, exit 1), and only the gather verbs
// (gather/full/horcrux/backup) take the filter.
function parseBrainsFilter(argv) {
    const idx = argv.indexOf('--brains');
    if (idx === -1) return null;
    const names = String(argv[idx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) {
        console.error('❌ --brains resolved to zero names');
        process.exit(1);
    }
    console.log('Payload scope:', 'only ' + names.join(', '));
    return names;
}

async function main() {
    switch (command) {
        case 'gather': {
            console.log('=== GATHERING DATA ===');
            const brains = parseBrainsFilter(args);
            const data = await transform.gather(brains ? { brains } : {});
            console.log(JSON.stringify(data, null, 2));
            break;
        }

        case 'full': {
            console.log('=== GATHERING FULL STATE ===');
            const brains = parseBrainsFilter(args);
            const data = await transform.gather(brains ? { full: true, brains } : { full: true });
            console.log('Keys:', Object.keys(data));
            console.log('Size:', JSON.stringify(data).length, 'bytes');
            console.log(JSON.stringify(data, null, 2));
            break;
        }

        case 'horcrux':
        case 'full-horcrux': {
            const svgPath = args[1] || './vant-brain-horcrux.svg';
            const password = args[2];
            if (!password) {
                console.log('❌ Password required');
                console.log('Usage: vant transform horcrux <path> <password>');
                console.log('   Or set VANT_BRAIN_PASSWORD env var');
                process.exit(1);
            }
            console.log('=== CREATING HORCRUX ===');
            console.log('SVG:', svgPath);
            // toHorcrux handles full gather + stego embed; returns the path written
            // (--brains rides through: issue #219 payload scope, same as
            // `vant horcrux create --brains`.)
            const brains = parseBrainsFilter(args);
            const result = await transform.toHorcrux(svgPath, brains ? { password, brains } : { password });
            console.log('Result:', result);
            break;
        }

        case 'backup': {
            console.log('=== FULL BACKUP ===');
            const brains = parseBrainsFilter(args);
            const backup = await transform.toBackup(brains ? { brains } : {});
            console.log(JSON.stringify(backup, null, 2));
            break;
        }

        case 'status': {
            console.log('=== SECURITY STATUS ===');
            const status = transform.getLayerStatus();
            console.log(JSON.stringify(status, null, 2));
            break;
        }

        case 'extract': {
            const extractPath = args[1];
            if (!extractPath) {
                console.log('❌ Path required');
                console.log('Usage: vant transform extract <horcrux.svg|horcrux.json> [password]');
                process.exit(1);
            }
            console.log('=== EXTRACT FROM HORCRUX ===');
            console.log('Path:', extractPath);
            const opts = args[2] ? { password: args[2] } : {};
            const extracted = await transform.fromHorcrux(extractPath, opts);
            console.log('Keys:', Object.keys(extracted));
            console.log(JSON.stringify({ ...extracted, raw: undefined }, null, 2));
            break;
        }

        case 'restore': {
            const restorePath = args[1];
            if (!restorePath) {
                console.log('❌ Path required');
                console.log('Usage: vant transform restore <horcrux.svg|horcrux.json> [password]');
                process.exit(1);
            }
            console.log('=== RESTORE FROM HORCRUX ===');
            console.log('Path:', restorePath);
            const opts = args[2] ? { password: args[2] } : {};
            // (pass 30) restore() is the full restore: decode → validate →
            // restore every section. Legacy brain data is rejected with
            // E_LEGACY_FORMAT and a migrateLegacyBrainStorage hint.
            const data = await transform.fromHorcrux(restorePath, opts);
            const restored = await transform.restore(data);
            console.log('Restored:', restored.restored.join(', '));
            if (restored.errors.length) {
                console.log('Errors:', JSON.stringify(restored.errors, null, 2));
                process.exit(1);
            }
            break;
        }

        default:
            console.log('Vant Transform CLI');
            console.log('');
            console.log('Usage:');
            console.log('  node bin/transform.js gather                       # Gather basic data');
            console.log('  node bin/transform.js full                         # Gather EVERYTHING');
            console.log('  node bin/transform.js horcrux <svg> <pass>         # Create horcrux (SVG embed)');
            console.log('  node bin/transform.js backup                       # Full backup to JSON');
            console.log('  node bin/transform.js extract <file> [pass]        # Decode horcrux, print data');
            console.log('  node bin/transform.js restore <file> [pass]        # Decode + full restore');
            console.log('  node bin/transform.js status                       # Show security status');
            process.exit(1);
    }
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
