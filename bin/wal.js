#!/usr/bin/env node
/**
 * Vant WAL CLI — storage crash-recovery journal (prd-storage)
 *
 * Usage:
 *   vant wal --status <basePath>    Journal state (records, pending intents)
 *   vant wal --drill <basePath>     Reopen the store → replay → verify → report
 *   vant wal --reset <basePath>     Drop the journal (DANGEROUS: abandons
 *                                   pending intents — verify first)
 *
 * The drill is the recovery path end-users hit after a crash: reopen →
 * replay applies lost writes (mtime-rule idempotent) → status shows clean.
 */

const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argAfter = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

if (has('-h') || has('--help') || args.length === 0) {
    console.log(`Vant WAL — storage crash-recovery journal

Usage:
  vant wal --status <basePath>    Journal state (records, pending intents)
  vant wal --drill <basePath>     Reopen → replay → verify → report
  vant wal --reset <basePath>     Drop the journal (abandons pending intents!)

The store basePath is the root the FileStorage was constructed with
(defaults to the repo root; brain stores live under models/private/<brain>).`);
    process.exit(0);
}

function resolveBase() {
    const raw = argAfter('--status') || argAfter('--drill') || argAfter('--reset') || process.cwd();
    return path.resolve(raw);
}

/** --drill only: opening the store IS the recovery (constructor replays). */
function openStore(base) {
    const mod = require('../lib/storage');
    const { FileStorage } = mod;
    return new FileStorage({ basePath: base, wal: true });
}

function main() {
    const base = resolveBase();

    if (!fs.existsSync(base)) {
        console.error('❌ basePath does not exist: ' + base);
        process.exit(1);
    }

    // NOTE: never construct a FileStorage for --status — the constructor
    // replays the journal (side effect). --status is a pure journal read;
    // --drill is the explicit recovery trigger.
    const mod = require('../lib/storage');

    if (has('--status')) {
        const st = mod.getWalStatus(base);
        if (!st.exists) {
            console.log('No WAL journal at ' + path.join(base, '.wal'));
            process.exit(0);
        }
        console.log('WAL journal: ' + path.join(base, '.wal', 'wal.log'));
        console.log('  records: ' + st.records + '  (' + st.bytes + ' bytes)');
        console.log('  pending intents: ' + st.pendingIntents);
        for (const p of st.pending) {
            console.log(`    - ${p.op} ${p.file} (${new Date(p.ts).toISOString()})`);
        }
        if (st.pendingIntents > 0) {
            console.log('\n  Reopen the store (or run --drill) to replay pending intents.');
        }
        process.exit(0);
    }

    if (has('--drill')) {
        const before = mod.getWalStatus(base);
        const hadPending = before.exists ? before.pendingIntents : 0;
        openStore(base); // constructor replays pending intents
        const after = mod.getWalStatus(base);
        const applied = Math.max(0, hadPending - (after.exists ? after.pendingIntents : 0));
        console.log('WAL replay drill: ' + base);
        console.log('  pending before: ' + hadPending);
        console.log('  pending after:  ' + (after.exists ? after.pendingIntents : 0));
        console.log('  replayed:       ' + applied);
        if (hadPending > 0 && applied === hadPending) console.log('  ✓ journal clean — recovery complete');
        else if (hadPending === 0) console.log('  ✓ nothing to recover — journal already clean');
        else console.log('  ⚠ some intents did not replay (missing blobs?) — inspect ' + path.join(base, '.wal'));
        process.exit(0);
    }

    if (has('--reset')) {
        if (!has('--yes')) {
            console.error('⚠ --reset abandons pending intents (lost writes are gone forever).');
            console.error('  Re-run with --yes to confirm, after inspecting --status.');
            process.exit(1);
        }
        const { Wal } = require('../lib/wal');
        const w = new Wal(base, { enabled: true });
        const ok = w.reset();
        console.log(ok ? '✓ journal dropped at ' + path.join(base, '.wal') : '❌ reset failed');
        process.exit(ok ? 0 : 1);
    }

    console.log('Usage: vant wal --status|--drill|--reset <basePath>');
    process.exit(1);
}

main();
