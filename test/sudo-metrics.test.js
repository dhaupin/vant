#!/usr/bin/env node
/**
 * Sudo metrics tests (prd-sudo "Metrics" item — Slice E)
 *
 * lib/sudo.js instruments escalations into the shared registry
 * (lib/metrics.js): outcome counters, grants-active gauge, escalation
 * latency histogram, revalidation/expiry counters. Instrumentation is
 * best-effort and never throws into sudo paths.
 */

const sudo = require('../lib/sudo');
const metrics = require('../lib/metrics');

const results = { passed: 0, failed: 0 };
const failures = [];

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then((ok) => {
            if (ok === true || (ok && ok.success)) {
                results.passed++;
                console.log(`  ✓ ${name}`);
            } else {
                results.failed++;
                const msg = (ok && ok.error) || 'failed';
                failures.push(`${name}: ${msg}`);
                console.log(`  ✗ ${name}: ${msg}`);
            }
        })
        .catch((e) => {
            results.failed++;
            failures.push(`${name}: ${e.message}`);
            console.log(`  ✗ ${name}: ${e.message}`);
        });
}

const T = 'qc-metrics-task';
const counter = (labels) => metrics.counterValue('vant_sudo_escalations_total', labels);
const reval = (labels) => metrics.counterValue('vant_sudo_revalidations_total', labels);
const gauge = () => {
    const g = metrics.snapshot().gauges.find(x => x.name === 'vant_sudo_grants_active');
    return g ? g.value : null;
};

async function run() {
    console.log('\n🔐 SUDO METRICS TESTS\n');

    const tests = [

    ['getSudoMetrics exported with expected shape', () => {
        const m = sudo.getSudoMetrics();
        for (const k of ['grantsActive', 'byTask', 'byService', 'registry']) {
            if (!(k in m)) return { success: false, error: `missing ${k}` };
        }
        return true;
    }],

    ['granted escalation: requested + granted counters, gauge, latency', async () => {
        metrics.reset();
        sudo.createTask(T, ['read']);
        const r = await sudo.escalate(T, 'write', { service: 'storage' });
        if (!r.granted) return { success: false, error: 'escalation not granted' };
        if (counter({ outcome: 'requested' }) !== 1) return { success: false, error: 'requested counter' };
        if (counter({ outcome: 'granted', service: 'storage' }) !== 1) return { success: false, error: 'granted counter' };
        if (gauge() !== 1) return { success: false, error: `gauge ${gauge()}` };
        const h = metrics.snapshot().histograms.find(x => x.name === 'vant_sudo_escalation_duration_ms');
        if (!h || h.count !== 1) return { success: false, error: 'latency histogram missing' };
        const sm = sudo.getSudoMetrics();
        if (sm.grantsActive !== 1 || sm.byService.storage !== 1) return { success: false, error: 'aggregation wrong' };
        return true;
    }],

    ['whitelist denial counted with reason', async () => {
        const before = counter({ outcome: 'denied', reason: 'not_in_whitelist' });
        await sudo.escalate(T, 'admin', { service: 'storage' }); // admin not allowed for storage
        const after = counter({ outcome: 'denied', reason: 'not_in_whitelist' });
        return after === before + 1 || { success: false, error: `denied counter ${before} -> ${after}` };
    }],

    ['revoke() refreshes grants-active gauge', async () => {
        // self-contained: clear leftover sudo state from prior tests
        sudo.reset();
        metrics.reset();
        sudo.createTask(T + '-b', ['read']);
        const r = await sudo.escalate(T + '-b', 'network', { service: 'network' });
        if (!r.granted) return { success: false, error: 'setup escalation failed' };
        if (gauge() !== 1) return { success: false, error: `gauge after escalate ${gauge()}` };
        sudo.revoke(T + '-b', 'network');
        if (gauge() !== 0) return { success: false, error: `gauge after revoke ${gauge()}` };
        return true;
    }],

    ['revalidateEscalation counts extensions', async () => {
        metrics.reset();
        sudo.createTask(T + '-r', ['read']);
        await sudo.escalate(T + '-r', 'write', { service: 'storage' });
        const before = reval({ outcome: 'extended' });
        const r = sudo.revalidateEscalation(T + '-r', 'write');
        if (!r.revalidated) return { success: false, error: 'revalidate failed' };
        return reval({ outcome: 'extended' }) === before + 1 || { success: false, error: 'extension counter' };
    }],

    ['reset() zeroes the gauge', () => {
        metrics.setGauge('vant_sudo_grants_active', 5, { layer: 'sudo' });
        sudo.reset();
        return gauge() === 0 || { success: false, error: `gauge after reset ${gauge()}` };
    }],

    ['instrumentation never throws into sudo paths', async () => {
        // poison the registry accessor target and confirm escalate still works
        const orig = require.cache[require.resolve('../lib/metrics')];
        require.cache[require.resolve('../lib/metrics')].exports = null;
        try {
            sudo.createTask(T + '-x', ['read']);
            const r = await sudo.escalate(T + '-x', 'write', { service: 'storage' });
            if (!r.granted) return { success: false, error: 'escalation failed under broken registry' };
            return true;
        } finally {
            require.cache[require.resolve('../lib/metrics')].exports = orig.exports;
            metrics.reset();
        }
    }]

    ];

    for (const [name, fn] of tests) await test(name, fn);

    // cleanup
    try { sudo.reset(); } catch (e) { /* noop */ }
    metrics.reset();

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    if (results.failed > 0) {
        console.log('\nFailures:');
        for (const f of failures) console.log(`  - ${f}`);
        process.exit(1);
    }
    process.exit(0);
}

run();
