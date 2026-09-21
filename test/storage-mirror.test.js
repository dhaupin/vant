#!/usr/bin/env node
/**
 * Mirror replication tests (prd-storage — Slice D)
 *
 * FileStorage per-op best-effort replication to configured mirror store(s)
 * (options.mirror / VANT_STORAGE_MIRROR). Mirrors are plain FileStorage
 * instances (no WAL, no nested replication). Failures are counted and
 * mirrored into the shared registry, never thrown into primary callers.
 * Internal dirs (.wal, .snapshots) never replicate.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const mod = require('../lib/storage');
const { FileStorage } = mod;
const metrics = require('../lib/metrics');

const results = { passed: 0, failed: 0 };
const failures = [];

function test(name, fn) {
    try {
        const ok = fn();
        if (ok === true || (ok && ok.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            const msg = (ok && ok.error) || 'failed';
            failures.push(`${name}: ${msg}`);
            console.log(`  ✗ ${name}: ${msg}`);
        }
    } catch (e) {
        results.failed++;
        failures.push(`${name}: ${e.message}`);
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vant-mirror-'));
const rm = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* best effort */ } };
const cleanup = () => { delete process.env.VANT_STORAGE_MIRROR; try { metrics.reset(); } catch (e) { /* noop */ } };

console.log('\n🪞 STORAGE MIRROR REPLICATION TESTS\n');

test('per-op replication: writes and deletes fan out', () => {
    cleanup();
    const prim = mk(), mir = mk();
    try {
        const store = new FileStorage({ basePath: prim, mirror: mir });
        store.write('a.txt', 'one');
        store.write('sub/b.txt', 'two');
        store.delete('a.txt');
        const m = new FileStorage({ basePath: mir, _isMirror: true });
        if (m.has('a.txt')) return { success: false, error: 'deleted file still on mirror' };
        if (m.read('sub/b.txt') !== 'two') return { success: false, error: 'nested write not replicated' };
        const st = store.getReplicationStatus();
        if (st.stats.writes !== 2 || st.stats.deletes !== 1 || st.stats.errors !== 0) {
            return { success: false, error: `stats ${JSON.stringify(st.stats)}` };
        }
        return true;
    } finally { rm(prim); rm(mir); }
});

test('env opt-in (VANT_STORAGE_MIRROR) enables replication', () => {
    cleanup();
    const prim = mk(), mir = mk();
    process.env.VANT_STORAGE_MIRROR = mir;
    try {
        const store = new FileStorage({ basePath: prim });
        store.write('env.txt', 'via-env');
        const m = new FileStorage({ basePath: mir, _isMirror: true });
        return m.read('env.txt') === 'via-env' || { success: false, error: 'env mirror not written' };
    } finally { rm(prim); rm(mir); cleanup(); }
});

test('multi-mirror via path.delimiter separation', () => {
    cleanup();
    const prim = mk(), m1 = mk(), m2 = mk();
    process.env.VANT_STORAGE_MIRROR = m1 + path.delimiter + m2;
    try {
        const store = new FileStorage({ basePath: prim });
        store.write('both.txt', 'fan-out');
        const s1 = new FileStorage({ basePath: m1, _isMirror: true });
        const s2 = new FileStorage({ basePath: m2, _isMirror: true });
        if (s1.read('both.txt') !== 'fan-out') return { success: false, error: 'mirror 1 missing write' };
        if (s2.read('both.txt') !== 'fan-out') return { success: false, error: 'mirror 2 missing write' };
        if (store.getReplicationStatus().mirrors.length !== 2) return { success: false, error: 'not 2 mirrors' };
        return true;
    } finally { rm(prim); rm(m1); rm(m2); cleanup(); }
});

test('mirrors never nest-replicate (_isMirror)', () => {
    cleanup();
    const prim = mk(), mir = mk(), grandchild = mk();
    try {
        const store = new FileStorage({ basePath: prim, mirror: mir });
        const m = new FileStorage({ basePath: mir, _isMirror: true, mirror: grandchild });
        m.write('nested.txt', 'x');
        if (fs.existsSync(path.join(grandchild, 'nested.txt'))) {
            return { success: false, error: 'mirror replicated to a second hop' };
        }
        return true;
    } finally { rm(prim); rm(mir); rm(grandchild); }
});

test('internal dirs (.wal/.snapshots) never replicate', () => {
    cleanup();
    const prim = mk(), mir = mk();
    try {
        const store = new FileStorage({ basePath: prim, mirror: mir, wal: true });
        store.write('real.txt', 'yes');
        store.write('.snapshots/junk/leak.txt', 'no');
        store.write('.wal/junk/leak.txt', 'no');
        const m = new FileStorage({ basePath: mir, _isMirror: true });
        if (m.has('real.txt') !== true) return { success: false, error: 'real file missing on mirror' };
        if (m.has('.snapshots/junk/leak.txt')) return { success: false, error: '.snapshots leaked' };
        if (m.has('.wal/junk/leak.txt')) return { success: false, error: '.wal leaked' };
        return true;
    } finally { rm(prim); rm(mir); }
});

test('mirror failure counted, never thrown into primary caller', () => {
    cleanup();
    const prim = mk(), bad = mk();
    try {
        const store = new FileStorage({ basePath: prim, mirror: path.join(bad, 'not-a-dir-blocker') });
        // make the mirror path a regular FILE so mirror writes fail (ENOTDIR)
        fs.writeFileSync(path.join(bad, 'not-a-dir-blocker'), 'blocker');
        let threw = false;
        try { store.write('f.txt', 'content'); } catch (e) { threw = true; }
        if (threw) return { success: false, error: 'mirror failure threw into caller' };
        if (store.read('f.txt') !== 'content') return { success: false, error: 'primary write lost' };
        const st = store.getReplicationStatus();
        if (st.stats.errors < 1) return { success: false, error: `errors not counted: ${JSON.stringify(st.stats)}` };
        return true;
    } finally { rm(prim); rm(bad); }
});

test('replicateAll syncs full tree and prunes extras', () => {
    cleanup();
    const prim = mk(), mir = mk();
    try {
        const store = new FileStorage({ basePath: prim, mirror: mir });
        store.write('one.txt', '1');
        store.write('dir/two.txt', '2');
        // drift: extra + stale file on the mirror
        const m = new FileStorage({ basePath: mir, _isMirror: true });
        m.write('extra.txt', 'stale');
        store.write('one.txt', '1-updated'); // will re-replicate anyway
        const r = store.replicateAll();
        const mr = r.mirrors[0];
        if (mr.written !== 2) return { success: false, error: `written ${mr.written}` };
        if (mr.deleted !== 1) return { success: false, error: `deleted ${mr.deleted}` };
        if (mr.errors !== 0) return { success: false, error: `errors ${mr.errors}` };
        const v = store.verifyMirror(mir);
        if (v.extra.length !== 0 || v.missing.length !== 0 || v.differing.length !== 0) {
            return { success: false, error: `post-sync drift ${JSON.stringify({ m: v.missing, d: v.differing, e: v.extra })}` };
        }
        return true;
    } finally { rm(prim); rm(mir); }
});

test('verifyMirror reports missing/differing/extra', () => {
    cleanup();
    const prim = mk(), mir = mk();
    try {
        const store = new FileStorage({ basePath: prim, mirror: mir });
        store.write('same.txt', 'same');
        store.write('changed.txt', 'new');
        const m = new FileStorage({ basePath: mir, _isMirror: true });
        m.write('same.txt', 'same');
        m.write('changed.txt', 'old');   // differing
        m.write('extra.txt', 'extra');   // extra on mirror
        // missing: primary has it, mirror doesn't (per-op replication is
        // live, so simulate loss by deleting the mirror-side copy — mirror
        // ops never fan back to the primary)
        store.write('never-replicated.txt', 'only-primary');
        m.delete('never-replicated.txt');
        const v = store.verifyMirror(mir);
        if (v.match !== 1) return { success: false, error: `match ${v.match}` };
        if (v.missing.length !== 1) return { success: false, error: `missing ${v.missing.length}` };
        if (v.differing.length !== 1) return { success: false, error: `differing ${v.differing.length}` };
        if (v.extra.length !== 1) return { success: false, error: `extra ${v.extra.length}` };
        return true;
    } finally { rm(prim); rm(mir); }
});

test('registry counters track mirror ops', () => {
    cleanup();
    const prim = mk(), mir = mk();
    try {
        metrics.reset();
        const store = new FileStorage({ basePath: prim, mirror: mir });
        store.write('m.txt', 'v');
        const ok = metrics.counterValue('vant_storage_mirror_ops_total', { op: 'write', outcome: 'ok' });
        if (ok < 1) return { success: false, error: `ok counter ${ok}` };
        return true;
    } finally { rm(prim); rm(mir); cleanup(); }
});

test('getReplicationStatus shape (disabled by default)', () => {
    cleanup();
    const prim = mk();
    try {
        const store = new FileStorage({ basePath: prim });
        const st = store.getReplicationStatus();
        if (st.enabled !== false) return { success: false, error: 'enabled without mirrors' };
        if (st.mirrors.length !== 0) return { success: false, error: 'phantom mirrors' };
        return true;
    } finally { rm(prim); cleanup(); }
});

try { metrics.reset(); } catch (e) { /* noop */ }
cleanup();

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
if (results.failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
}
process.exit(0);
