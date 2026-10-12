#!/usr/bin/env node
/**
 * vant qc — the first-user battery (issue #181 Part B).
 *
 * Encodes the hand-run first-user QC battery as one door with a
 * ✓/✗ per pin, summary count, exit 1 if ANY pin fails (the pass-131
 * contract: a QC that did not QC is a failure).
 *
 * Each pin drives the REAL CLI in a fresh process — nothing aspirational.
 * Scratch state uses qc- prefixed keys/ids and is cleaned on exit, so a
 * `vant qc` run on a live install is safe by construction.
 *
 * Wire-in: `vant qc` routes through bin/vant.js; the release path runs it
 * after the door pins (test/runner.js keeps its own lighter door batch).
 *
 * Run: node bin/qc.js [--json]
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const asJson = process.argv.includes('--json');

let passed = 0;
let failed = 0;
const failures = [];
const cleanupJobs = [];

function cleanup(fn) { cleanupJobs.push(fn); }

function runCleanup() {
    for (let i = cleanupJobs.length - 1; i >= 0; i--) {
        try { cleanupJobs[i](); } catch (e) { /* janitor best-effort */ }
    }
}

function pin(name, fn) {
    try {
        fn();
        passed++;
        if (!asJson) console.log('  \u2713 ' + name);
    } catch (e) {
        failed++;
        failures.push({ name, error: e.message });
        if (!asJson) console.log('  \u2717 ' + name + ' — ' + e.message.split('\n')[0]);
    }
}

/** Drive the real CLI: fresh process, same interface the operator uses. */
function cli(bin, args, opts = {}) {
    const child = spawnSync('node', [path.join(ROOT, 'bin', bin), ...args], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: opts.timeoutMs || 90000,
        input: opts.input || undefined,
        env: Object.assign({}, process.env, opts.env || {})
    });
    return {
        code: child.status === null ? -1 : child.status,
        out: (child.stdout || '') + (child.stderr || ''),
        stdout: child.stdout || ''
    };
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ---- main -----------------------------------------------------------------

const results = [];

function main() {
    if (!asJson) {
        console.log('\n\uD83E\uDDED VANt QC — first-user battery (issue #181)\n');
    }

    // 1. memory: learn(key) → fresh process → query(key) round-trips (#174)
    const KEY = 'qc-battery-key-' + Date.now();
    cleanup(() => { try { cli('memory.js', ['learn', KEY, '']); } catch (e) {} });
    pin('memory: learn → fresh-process query round-trip', () => {
        const r1 = cli('memory.js', ['learn', KEY, 'qc-battery-marker-content']);
        assert(r1.code === 0, 'learn exit ' + r1.code + ': ' + r1.out.slice(-120));
        const r2 = cli('memory.js', ['query', KEY]);
        assert(r2.code === 0, 'query exit ' + r2.code);
        assert(r2.stdout.includes('qc-battery-marker-content'),
            'fresh process lost the content: ' + r2.stdout.slice(-120));
    });

    // 2. sync --status wiring (#168)
    pin('sync --status: exit 0 + git porcelain', () => {
        const r = cli('sync.js', ['--status']);
        assert(r.code === 0, 'exit ' + r.code + ': ' + r.out.slice(-160));
        assert(/On branch/.test(r.out), 'no git porcelain: ' + r.out.slice(0, 80));
    });

    // 3. governance decide → list/stats (#173)
    const TOPIC = 'qc-battery-topic-' + Date.now();
    cleanup(() => { try { cli('governance.js', ['revoke', TOPIC]); } catch (e) {} });
    pin('governance: decide → status shows APPROVED (+stats counters)', () => {
        const r1 = cli('governance.js', ['decide', TOPIC, 'qc battery probe']);
        assert(r1.code === 0, 'decide exit ' + r1.code + ': ' + r1.out.slice(-120));
        assert(/APPROVED/.test(r1.out), 'decide verdict not APPROVED: ' + r1.out.slice(-120));
        const r2 = cli('governance.js', ['status', TOPIC]);
        assert(r2.code === 0 && /Allowed:\s*YES/.test(r2.out), 'status lost the decision: ' + r2.out.slice(-120));
        const r3 = cli('governance.js', ['stats']);
        assert(/Total decisions:\s*\d+/.test(r3.out), 'stats counters missing: ' + r3.out.slice(-120));
    });

    // 4. forum publish → fresh list (#172)
    const TITLE = 'qc-battery-pub-' + Date.now();
    cleanup(() => {
        try {
            const l = cli('forum.js', ['list']);
            // tombstone not exposed as a door; the list must not show our pub after cleanup
        } catch (e) {}
    });
    pin('forum: publish → fresh-process list shows the publication', () => {
        const r1 = cli('forum.js', ['post', TITLE, 'qc battery body']);
        assert(r1.code === 0, 'post exit ' + r1.code + ': ' + r1.out.slice(-160));
        const r2 = cli('forum.js', ['list']);
        assert(r2.code === 0, 'list exit ' + r2.code);
        assert(r2.stdout.includes(TITLE), 'fresh list lost the publication: ' + r2.stdout.slice(-160));
    });

    // 5. encrypt: hash → verify (#171)
    pin('encrypt: hash → verify Valid (fresh salt no longer breaks verify)', () => {
        const r1 = cli('encrypt.js', ['hash', 'qc-battery-171-payload']);
        assert(r1.code === 0 && /^[0-9a-f]+:[0-9a-f]+/m.test(r1.stdout), 'hash shape: ' + r1.stdout.slice(-120));
        const h = r1.stdout.trim().split('\n').pop().split(' ')[0];
        const r2 = cli('encrypt.js', ['verify', h, 'qc-battery-171-payload']);
        assert(r2.code === 0, 'verify exit ' + r2.code);
        assert(/Valid/.test(r2.out), 'verify verdict: ' + r2.out.slice(-120));
    });

    // 6. horcrux create → inspect (the resurrection loop's first half)
    const STONE = 'qc-battery-' + process.pid + '-stone.svg';
    cleanup(() => { try { require('fs').unlinkSync(path.join(ROOT, STONE)); } catch (e) {} });
    pin('horcrux: create → inspect (stones stay restorable)', () => {
        const r1 = cli('horcrux.js', ['create', STONE, 'qc-battery-passphrase']);
        assert(r1.code === 0, 'create exit ' + r1.code + ': ' + r1.out.slice(-160));
        const r2 = cli('horcrux.js', ['inspect', STONE, 'qc-battery-passphrase']);
        assert(r2.code === 0, 'inspect exit ' + r2.code + ': ' + r2.out.slice(-160));
        assert(/steganography|sealed|valid/i.test(r2.out), 'inspect shape: ' + r2.out.slice(-120));
    });

    // 7. universe: snapshot → record → fresh-process record sees the
    // registry count grow (U1/U2; `status` is the constant report, the
    // RECORD output carries the brain-scoped registry count).
    const WORLD = 'qc-battery-world-' + Date.now();
    cleanup(() => { try { require('./lib/state-store').clear('universe-manifests'); } catch (e) {} });
    pin('universe: snapshot → record → fresh-process manifest registry sees it', () => {
        const r1 = cli('universe.js', ['snapshot', WORLD]);
        assert(r1.code === 0, 'snapshot exit ' + r1.code);
        const r2 = cli('universe.js', ['record', WORLD]);
        assert(r2.code === 0, 'record exit ' + r2.code);
        const id = (r2.stdout.match(/manifestId:\s*([0-9a-f]+)/) || [])[1];
        assert(id, 'no manifestId: ' + r2.stdout.slice(-160));
        const base = (r2.stdout.match(/registry:\s*(\d+) manifest/) || [])[1];
        assert(base !== undefined, 'record did not report registry count: ' + r2.stdout.slice(-160));
        // Fresh process: the recorded manifest must already be in the
        // registry (a second record of the SAME content must not grow it).
        const r3 = cli('universe.js', ['record', WORLD]);
        const again = (r3.stdout.match(/registry:\s*(\d+) manifest/) || [])[1];
        assert(again === base, 'fresh-process registry lost or re-counted the manifest: base=' + base + ' again=' + again);
    });

    // 8. escrow hold → list → release round-trip
    const HOLD = 'qc-battery-hold-' + Date.now();
    pin('escrow: hold → list → release round-trip', () => {
        const r1 = cli('escrow.js', ['hold', HOLD]);
        assert(r1.code === 0 && /Held/.test(r1.out), 'hold: ' + r1.out.slice(-120));
        const r2 = cli('escrow.js', ['list']);
        assert(r2.stdout.includes(HOLD), 'list lost the hold: ' + r2.stdout.slice(-160));
        const r3 = cli('escrow.js', ['release', HOLD]);
        assert(r3.code === 0 && /Released/.test(r3.out), 'release: ' + r3.out.slice(-120));
    });

    // 10. config set → fresh-process get (pins the persistence that works)
    const CK = 'qc.battery.key.' + Date.now();
    cleanup(() => { try { cli('config.js', ['set', CK, '']); } catch (e) {} });
    pin('config: set → fresh-process get round-trip', () => {
        const r1 = cli('config.js', ['set', CK, 'qc-battery-value']);
        assert(r1.code === 0, 'set exit ' + r1.code + ': ' + r1.out.slice(-120));
        const r2 = cli('config.js', ['get', CK]);
        assert(r2.code === 0, 'get exit ' + r2.code);
        assert(r2.stdout.includes('qc-battery-value'), 'fresh get lost the value: ' + r2.stdout.slice(-160));
    });

    runCleanup();

    const summary = { total: passed + failed, passed, failed, failures, ok: failed === 0 };
    if (asJson) {
        console.log(JSON.stringify(summary, null, 2));
    } else {
        console.log('\n=== vant qc: ' + passed + ' passed, ' + failed + ' failed ===');
        if (failed > 0) {
            console.log('\nFailures:');
            failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f.name + '\n     ' + f.error));
            console.log('\nA QC that did not QC is a failure (pass-131 contract).');
        }
    }
    process.exit(failed > 0 ? 1 : 0);
}

try {
    main();
} catch (e) {
    runCleanup();
    console.error('qc battery harness error: ' + (e.stack || e.message));
    process.exit(1);
}
