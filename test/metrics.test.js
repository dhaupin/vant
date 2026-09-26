#!/usr/bin/env node
/**
 * Metrics registry unit tests (lib/metrics.js)
 *
 * The registry is shared by storage (prd-storage metrics) and sudo
 * (prd-sudo metrics). Series are keyed by metric name + sorted label pairs;
 * the module NEVER throws into caller paths.
 */

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

console.log('\n📈 METRICS REGISTRY TESTS\n');

test('module loads with expected API', () => {
    for (const k of ['inc', 'setGauge', 'observe', 'startTimer', 'snapshot', 'counterValue', 'toPrometheus', 'reset']) {
        if (typeof metrics[k] !== 'function') return { success: false, error: `missing ${k}` };
    }
    return true;
});

test('inc creates and accumulates series', () => {
    metrics.reset();
    metrics.inc('test_counter_total', { op: 'a' });
    metrics.inc('test_counter_total', { op: 'a' });
    metrics.inc('test_counter_total', { op: 'a' });
    if (metrics.counterValue('test_counter_total', { op: 'a' }) !== 3) return { success: false, error: 'expected 3' };
    if (metrics.counterValue('test_counter_total', { op: 'b' }) !== 0) return { success: false, error: 'label-isolated series expected 0' };
    return true;
});

test('label sets produce distinct series', () => {
    metrics.reset();
    metrics.inc('lbl_total', { op: 'write', outcome: 'ok' });
    metrics.inc('lbl_total', { op: 'write', outcome: 'error' });
    const snap = metrics.snapshot();
    if (snap.counters.length !== 2) return { success: false, error: `expected 2 series, got ${snap.counters.length}` };
    return true;
});

test('setGauge overwrites absolute value', () => {
    metrics.reset();
    metrics.setGauge('test_gauge', 5, { service: 'x' });
    metrics.setGauge('test_gauge', 9, { service: 'x' });
    const g = metrics.snapshot().gauges.find(s => s.name === 'test_gauge');
    if (!g || g.value !== 9) return { success: false, error: 'gauge should be 9' };
    return true;
});

test('observe builds cumulative histogram buckets + sum/count', () => {
    metrics.reset();
    metrics.observe('test_hist_ms', 3, { op: 'read' });
    metrics.observe('test_hist_ms', 250, { op: 'read' });
    metrics.observe('test_hist_ms', 99999, { op: 'read' });
    const h = metrics.snapshot().histograms.find(s => s.name === 'test_hist_ms');
    if (!h) return { success: false, error: 'histogram series missing' };
    if (h.count !== 3) return { success: false, error: `count ${h.count} != 3` };
    // cumulative buckets: 3 falls in le=5 (and all larger), 250 in le=250..500, 99999 only in +Inf
    const idx = (b) => h.buckets.findIndex(x => x >= 250);
    if (h.counts[idx(0)] !== 2) return { success: false, error: `le=250 bucket ${h.counts[idx(0)]} != 2` };
    if (h.sum <= 99998) return { success: false, error: 'sum should include big value' };
    return true;
});

test('prometheus text format: TYPE lines, labels, buckets, +Inf, sum/count', () => {
    metrics.reset();
    metrics.inc('pm_total', { op: 'write', outcome: 'ok' }, 2);
    metrics.setGauge('pm_gauge', 1.5, {});
    metrics.observe('pm_ms', 7, { op: 'read' });
    const text = metrics.toPrometheus();
    if (!text.includes('# TYPE pm_total counter')) return { success: false, error: 'counter TYPE missing' };
    if (!text.includes('# TYPE pm_gauge gauge')) return { success: false, error: 'gauge TYPE missing' };
    if (!text.includes('# TYPE pm_ms histogram')) return { success: false, error: 'histogram TYPE missing' };
    if (!text.includes('pm_total{op="write",outcome="ok"} 2')) return { success: false, error: 'counter series line wrong' };
    if (!text.includes('pm_gauge 1.5')) return { success: false, error: 'gauge line wrong' };
    if (!text.includes('pm_ms_bucket{le="10",op="read"} 1')) return { success: false, error: 'bucket line wrong' };
    if (!text.includes('pm_ms_bucket{le="+Inf",op="read"} 1')) return { success: false, error: '+Inf line missing' };
    if (!text.includes('pm_ms_sum{op="read"} 7')) return { success: false, error: 'sum line missing' };
    if (!text.includes('pm_ms_count{op="read"} 1')) return { success: false, error: 'count line missing' };
    return true;
});

test('names sanitized to prometheus-safe charset', () => {
    metrics.reset();
    metrics.inc('bad name-with spaces!');
    const text = metrics.toPrometheus();
    if (text.includes('bad name')) return { success: false, error: 'unsanitized name leaked' };
    if (!text.includes('bad_name_with_spaces_')) return { success: false, error: 'sanitized name missing' };
    return true;
});

test('label values escape backslash, quote, newline', () => {
    metrics.reset();
    metrics.inc('esc_total', { weird: 'a"b\\c\nd' });
    const text = metrics.toPrometheus();
    const line = text.split('\n').find(l => l.startsWith('esc_total'));
    if (!line || line.includes('a"b')) return { success: false, error: 'unescaped quote leaked into output' };
    if (!line || !line.includes('\\"')) return { success: false, error: 'quote not escaped' };
    return true;
});

test('startTimer observes elapsed ms via stop()', () => {
    metrics.reset();
    const stop = metrics.startTimer('timer_ms', { op: 't' });
    stop();
    const h = metrics.snapshot().histograms.find(s => s.name === 'timer_ms');
    if (!h || h.count !== 1) return { success: false, error: 'timer observation missing' };
    return true;
});

test('never throws: bad inputs return false/0 instead of raising', () => {
    metrics.reset();
    if (metrics.inc(null, null, 'not-a-number') !== false) return { success: false, error: 'inc NaN should be false' };
    if (metrics.observe('hist', 'nope') !== false) return { success: false, error: 'observe bad value should be false' };
    if (metrics.counterValue('missing_total', { x: 1 }) !== 0) return { success: false, error: 'missing counter should be 0' };
    if (typeof metrics.toPrometheus() !== 'string') return { success: false, error: 'toPrometheus should still return a string' };
    return true;
});

test('reset clears all series', () => {
    metrics.inc('reset_total');
    metrics.setGauge('reset_gauge', 1);
    metrics.observe('reset_ms', 1);
    metrics.reset();
    const snap = metrics.snapshot();
    if (snap.counters.length || snap.gauges.length || snap.histograms.length) {
        return { success: false, error: 'snapshot not empty after reset' };
    }
    return true;
});

metrics.reset(); // leave the registry clean for other suites in the same process

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
if (results.failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
}
process.exit(0);
