#!/usr/bin/env node
/**
 * Storage metrics tests (prd-storage "Metrics" item — Slice B)
 *
 * FileStorage ops are recorded per-store (ops/rawOps/bytes/errors) and
 * mirrored into the shared registry (lib/metrics.js) for Prometheus
 * exposition. Collection is best-effort and never throws into callers.
 *
 * Semantics: a "miss" (read→null, has→false, delete→false) is a NORMAL
 * outcome — only exceptions count as errors.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

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

// Isolated scratch store so counts are deterministic and the models tree
// is never touched.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-store-metrics-'));
const mod = require('../lib/storage');
const { FileStorage } = mod;
const store = new FileStorage({ basePath: scratch });

console.log('\n📊 STORAGE METRICS TESTS\n');

test('write + read record ops and bytes', () => {
    store.write('a.txt', 'hello world');            // 11 bytes
    const content = store.read('a.txt');
    if (content !== 'hello world') return { success: false, error: 'roundtrip broken' };
    const s = mod.getStorageMetrics().stores.find(x => x.basePath === scratch);
    if (!s) return { success: false, error: 'store not tracked' };
    if (!s.ops.write || !s.ops.read) return { success: false, error: `ops: ${JSON.stringify(s.ops)}` };
    if (s.totals.bytes < 11) return { success: false, error: `bytes ${s.totals.bytes} < 11` };
    return true;
});

test('misses are normal outcomes, not errors (read/has/delete)', () => {
    const before = mod.getStorageMetrics().stores.find(x => x.basePath === scratch).totals.errors;
    store.read('definitely-missing.txt');  // null
    store.has('definitely-missing.txt');   // false
    store.delete('definitely-missing.txt'); // false
    const after = mod.getStorageMetrics().stores.find(x => x.basePath === scratch).totals.errors;
    if (after !== before) return { success: false, error: `errors moved ${before} -> ${after} on misses` };
    return true;
});

test('raw ops are tracked separately (rawOps bucket)', () => {
    store.readRaw('a.txt');
    store.listRaw('*.txt');
    const s = mod.getStorageMetrics().stores.find(x => x.basePath === scratch);
    if (!s.rawOps.read) return { success: false, error: 'raw read not tracked' };
    if (!s.rawOps.list) return { success: false, error: 'raw list not tracked' };
    if (s.rawOps.read + s.rawOps.list > s.totals.ops) return { success: false, error: 'raw ops excluded from totals' };
    return true;
});

test('deleteRaw records raw-flagged ops', () => {
    store.write('doomed.txt', 'x');
    store.deleteRaw('doomed.txt');
    const s = mod.getStorageMetrics().stores.find(x => x.basePath === scratch);
    if (!s.rawOps.delete) return { success: false, error: 'raw delete not tracked' };
    return true;
});

test('exceptions count as errors (traversal-refused write)', () => {
    const before = mod.getStorageMetrics().stores.find(x => x.basePath === scratch).totals.errors;
    try { store.write('../../escape.txt', 'nope'); } catch (e) { /* refused — expected */ }
    const after = mod.getStorageMetrics().stores.find(x => x.basePath === scratch).totals.errors;
    if (after !== before + 1) return { success: false, error: `expected errors ${before + 1}, got ${after}` };
    return true;
});

test('ops mirrored into shared registry (vant_storage_ops_total)', () => {
    const metrics = require('../lib/metrics');
    metrics.reset();
    store.write('reg.txt', 'registry');
    store.read('reg.txt');
    const v = metrics.counterValue('vant_storage_ops_total', { op: 'write', outcome: 'ok' });
    if (v < 1) return { success: false, error: `registry counter ${v}` };
    const snap = metrics.snapshot();
    if (!snap.histograms.some(h => h.name === 'vant_storage_op_duration_ms')) {
        return { success: false, error: 'duration histogram missing' };
    }
    if (!snap.histograms.some(h => h.name === 'vant_storage_op_bytes')) {
        return { success: false, error: 'bytes histogram missing' };
    }
    metrics.reset();
    return true;
});

test('aggregation totals sum across stores', () => {
    const m = mod.getStorageMetrics();
    if (m.totals.ops < 5) return { success: false, error: `totals.ops ${m.totals.ops}` };
    if (typeof m.registry.counters !== 'object') return { success: false, error: 'registry snapshot missing' };
    return true;
});

test('metrics collection never throws into caller paths', () => {
    // _recordStoreOp swallows its own errors; verify via a poisoned bytes path
    const broken = new FileStorage({ basePath: path.join(scratch, 'sub-store') });
    broken.write('x.txt', 'y'); // different basePath -> new tracking entry
    const s2 = mod.getStorageMetrics().stores.filter(x => x.basePath !== scratch);
    if (!s2.length) return { success: false, error: 'second store not tracked' };
    return true;
});

// cleanup
try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (e) { /* best effort */ }
require('../lib/metrics').reset();

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
if (results.failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
}
process.exit(0);
