#!/usr/bin/env node
/**
 * Point-in-time Snapshot Tests (prd-storage.md: Backup/Restore)
 * Exercises FileStorage.snapshot()/listSnapshots()/restoreSnapshot()/
 * deleteSnapshot() against a scratch store: round-trip, post-snapshot
 * cleanup on restore, pruning, validation refusals, encrypted stores.
 *
 * Run: node test/snapshots.test.js
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

const suite = [];
function define(name, fn) { suite.push({ name, fn }); }
async function runSuite() {
    for (const { name, fn } of suite) {
        try {
            const result = await fn();
            const ok = result === true || (result && result.success);
            if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
            else { results.failed++; console.log(`  ✗ ${name}: ${(result && result.error) || 'assertion failed'}`); }
        } catch (e) {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        }
    }
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
}

console.log('\n📸 POINT-IN-TIME SNAPSHOT TESTS\n');

const { FileStorage } = require(path.join(ROOT, 'lib', 'storage'));

const SCRATCH = path.join(ROOT, '.snapshot-scratch');
function freshStore(opts = {}) {
    fs.rmSync(SCRATCH, { recursive: true, force: true });
    fs.mkdirSync(SCRATCH, { recursive: true });
    return new FileStorage({ basePath: SCRATCH, ...opts });
}
function cleanup() { fs.rmSync(SCRATCH, { recursive: true, force: true }); }

// ---------- 1. round-trip ----------

define('snapshot captures store; restore brings content back', async () => {
    const store = freshStore();
    try {
        store.write('a.md', 'alpha content');
        store.write('sub/b.md', 'beta content');
        const snap = store.snapshot('before-change');
        if (!snap.id || snap.files !== 2) return { success: false, error: 'snapshot: ' + JSON.stringify(snap) };

        // mutate
        store.write('a.md', 'CHANGED');
        store.delete('sub/b.md');
        store.write('new.md', 'post-snapshot file');

        const r = store.restoreSnapshot(snap.id);
        if (r.restored < 2) return { success: false, error: 'restore: ' + JSON.stringify(r) };
        const back = store.read('a.md');
        const backB = store.read('sub/b.md');
        const removed = store.read('new.md');
        return {
            success: back === 'alpha content' && backB === 'beta content' && removed === null,
            error: `a=${back} b=${backB} new=${removed} r=${JSON.stringify(r)}`
        };
    } finally { cleanup(); }
});

define('subdirectory content round-trips (deep paths)', async () => {
    const store = freshStore();
    try {
        store.write('deep/nested/tree/file.md', 'deep value');
        const snap = store.snapshot('deep');
        store.delete('deep/nested/tree/file.md');
        store.restoreSnapshot(snap.id);
        return { success: store.read('deep/nested/tree/file.md') === 'deep value', error: 'deep read failed' };
    } finally { cleanup(); }
});

// ---------- 2. listing + deletion ----------

define('listSnapshots reports labels/files sorted; deleteSnapshot removes', async () => {
    const store = freshStore();
    try {
        store.write('x.txt', 'x');
        store.snapshot('first');
        store.snapshot('second');
        const list = store.listSnapshots();
        if (list.length !== 2) return { success: false, error: 'list: ' + JSON.stringify(list) };
        if (!(list[0].label === 'first' && list[1].label === 'second')) {
            return { success: false, error: 'order: ' + list.map(s => s.label).join(',') };
        }
        store.deleteSnapshot(list[0].id);
        const after = store.listSnapshots();
        const dirGone = !fs.existsSync(path.join(SCRATCH, '.snapshots', list[0].id));
        return { success: after.length === 1 && after[0].label === 'second' && dirGone, error: 'after: ' + JSON.stringify(after) };
    } finally { cleanup(); }
});

define('empty store snapshots cleanly (zero files)', async () => {
    const store = freshStore();
    try {
        const snap = store.snapshot('empty');
        const list = store.listSnapshots();
        const r = store.restoreSnapshot(snap.id);
        return { success: snap.files === 0 && list.length === 1 && r.restored === 0, error: JSON.stringify({ snap, list, r }) };
    } finally { cleanup(); }
});

// ---------- 3. validation refusals ----------

define('invalid labels rejected; traversal ids rejected', async () => {
    const store = freshStore();
    try {
        let badLabel = false, badId = false;
        try { store.snapshot('../../evil'); } catch (e) { badLabel = true; }
        try { store.restoreSnapshot('../escape'); } catch (e) { badId = true; }
        try { store.restoreSnapshot('ok-id/../../escape'); } catch (e) { badId = true; }
        return { success: badLabel && badId, error: `label=${badLabel} id=${badId}` };
    } finally { cleanup(); }
});

define('hand-edited manifest with traversal path is refused by the chain', async () => {
    const store = freshStore();
    try {
        store.write('good.md', 'good');
        const snap = store.snapshot('honest');
        // Hand-edit the manifest to inject a traversal path
        const manifestPath = path.join(SCRATCH, '.snapshots', snap.id, 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.files.push({ path: '../../evil.md', size: 5 });
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        let refused = false;
        try { store.restoreSnapshot(snap.id); } catch (e) {
            refused = /blocked|escape|Security|Path/i.test(e.message);
        }
        const outside = fs.existsSync(path.join(SCRATCH, '..', 'evil.md'));
        return { success: refused && !outside, error: `refused=${refused} outside=${outside}` };
    } finally { cleanup(); }
});

// ---------- 4. pruning cap ----------

define('snapshot count capped; oldest pruned', async () => {
    const store = freshStore({ maxSnapshots: 3 });
    try {
        store.write('f.txt', 'f');
        const ids = [];
        for (let i = 0; i < 4; i++) {
            const s = store.snapshot('cap' + i);
            ids.push(s.id);
        }
        const list = store.listSnapshots();
        const firstGone = !fs.existsSync(path.join(SCRATCH, '.snapshots', ids[0]));
        return {
            success: list.length === 3 && firstGone && list[0].label === 'cap1',
            error: `n=${list.length} labels=${list.map(s => s.label).join(',')}`
        };
    } finally { cleanup(); }
});

// ---------- 5. encrypted store round-trip ----------

define('encrypted store: snapshot + restore round-trips through codec', async () => {
    const store = freshStore({ encrypt: true, encryptKey: 'test-key-snapshots' });
    try {
        store.write('secret.md', 'classified content');
        const snap = store.snapshot('enc');
        store.write('secret.md', 'tampered');
        store.restoreSnapshot(snap.id);
        const back = store.read('secret.md');
        // on-disk snapshot data must carry the encrypted prefix
        const rawFiles = [];
        const dataDir = path.join(SCRATCH, '.snapshots', snap.id, 'data');
        const walk = (d) => {
            for (const f of fs.readdirSync(d, { withFileTypes: true })) {
                if (f.isDirectory()) walk(path.join(d, f.name));
                else rawFiles.push(fs.readFileSync(path.join(d, f.name), 'utf8'));
            }
        };
        walk(dataDir);
        const encOnDisk = rawFiles.length > 0 && rawFiles.every(c => c.startsWith('vant-enc:v1:'));
        return { success: back === 'classified content' && encOnDisk, error: `back=${back} encOnDisk=${encOnDisk}` };
    } finally { cleanup(); }
});

// ---------- 6. exclusion ----------

define('.snapshots dir never captured inside a snapshot', async () => {
    const store = freshStore();
    try {
        store.write('a.txt', 'a');
        store.snapshot('one');
        store.snapshot('two'); // now .snapshots has content
        const snap = store.snapshot('three');
        const captured = snap.id && snap.files === 1; // only a.txt
        return { success: captured, error: 'files=' + snap.files };
    } finally { cleanup(); }
});

// ---------- RUN ----------

runSuite();
