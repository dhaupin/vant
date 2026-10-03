#!/usr/bin/env node
/**
 * Vant Mirror CLI — storage replication (prd-storage)
 *
 * Usage:
 *   vant mirror --status [--base <path>] [--mirror <path>...]   Replication config + stats
 *   vant mirror --verify <mirrorPath> [--base <path>]           Drift report (match/missing/differing/extra)
 *   vant mirror --resync [--base <path>] [--mirror <path>...]   Full primary → mirror sync
 *
 * Mirror sources (combined): --mirror flags + VANT_STORAGE_MIRROR env
 * (path.delimiter-separated). The base store defaults to the repo root.
 */

const path = require('path');
const fs = require('fs');
const mod = require('../lib/storage');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argAfter = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const allAfter = (f) => {
    const out = [];
    let i = args.indexOf(f);
    while (i >= 0) { out.push(args[i + 1]); i = args.indexOf(f, i + 1); }
    return out.filter(Boolean);
};

if (has('-h') || has('--help') || args.length === 0) {
    console.log(`Vant Mirror — storage replication (prd-storage)

Usage:
  vant mirror --status [--base <path>] [--mirror <path>...]   Replication config + stats
  vant mirror --verify <mirrorPath> [--base <path>]           Drift report
  vant mirror --resync [--base <path>] [--mirror <path>...]   Full primary → mirror sync

Mirror sources combine: --mirror flags + VANT_STORAGE_MIRROR env
(${path.delimiter}-separated). Base store defaults to the repo root.`);
    process.exit(0);
}

function openPrimary() {
    const base = path.resolve(argAfter('--base') || process.cwd());
    if (!fs.existsSync(base)) {
        console.error('❌ base store does not exist: ' + base);
        process.exit(1);
    }
    const mirrors = [...allAfter('--mirror')];
    if (process.env.VANT_STORAGE_MIRROR) {
        mirrors.push(...process.env.VANT_STORAGE_MIRROR.split(path.delimiter).filter(Boolean));
    }
    return { base, store: new mod.FileStorage({ basePath: base, mirror: mirrors.map(m => path.resolve(m)) }) };
}

function main() {
    if (has('--status')) {
        const { base, store } = openPrimary();
        const st = store.getReplicationStatus();
        console.log('Primary store: ' + base);
        console.log('  replication: ' + (st.enabled ? 'ENABLED' : 'disabled (no mirrors configured)'));
        for (const m of st.mirrors) console.log('  mirror: ' + m);
        console.log('  per-op stats: writes=' + st.stats.writes + ' deletes=' + st.stats.deletes + ' errors=' + st.stats.errors);
        process.exit(0);
    }

    if (has('--verify')) {
        const target = argAfter('--verify');
        if (!target) { console.error('Usage: vant mirror --verify <mirrorPath> [--base <path>]'); process.exit(1); }
        const { base, store } = openPrimary();
        const v = store.verifyMirror(target);
        console.log('Drift report: ' + base + '  ⇄  ' + v.basePath);
        console.log('  matching:  ' + v.match);
        console.log('  missing:   ' + v.missing.length + (v.missing.length ? '\n    - ' + v.missing.slice(0, 20).join('\n    - ') : ''));
        console.log('  differing: ' + v.differing.length + (v.differing.length ? '\n    - ' + v.differing.slice(0, 20).join('\n    - ') : ''));
        console.log('  extra:     ' + v.extra.length + (v.extra.length ? '\n    - ' + v.extra.slice(0, 20).join('\n    - ') : ''));
        const clean = v.missing.length + v.differing.length + v.extra.length === 0;
        console.log(clean ? '  ✓ mirrors in sync' : '  ⚠ drift detected — run `vant mirror --resync` to heal');
        process.exit(clean ? 0 : 1);
    }

    if (has('--resync')) {
        const { base, store } = openPrimary();
        const only = argAfter('--mirror') && path.resolve(argAfter('--mirror'));
        const r = store.replicateAll(only);
        console.log('Resync: ' + base + ' → ' + r.mirrors.length + ' mirror(s), ' + r.files + ' file(s) scanned');
        for (const m of r.mirrors) {
            console.log('  ' + m.basePath + ': written=' + m.written + ' deleted=' + m.deleted + ' errors=' + m.errors);
        }
        process.exit(r.mirrors.some(m => m.errors > 0) ? 1 : 0);
    }

    console.log('Usage: vant mirror --status | --verify <mirrorPath> | --resync');
    process.exit(1);
}

main();
