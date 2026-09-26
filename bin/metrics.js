#!/usr/bin/env node
/**
 * Vant Metrics CLI — shared registry dashboard (prd-storage + prd-sudo)
 *
 * Usage:
 *   vant metrics                      # Registry summary + storage section (default)
 *   vant metrics --prom | prom        # Prometheus text exposition format
 *   vant metrics get <name> [labels]  # Counter value (labels: k=v,k=v)
 *   vant metrics inc <name> [by] [labels]
 *   vant metrics gauge <name> <val> [labels]
 *   vant metrics observe <name> <val> [labels]
 *   vant metrics storage              # Per-store op/bytes/error aggregation
 *   vant metrics reset                # Wipe all in-process series
 *
 * Values are in-process by design: they describe the live process and reset
 * on exit. The sudo escalation audit log and the storage WAL are the
 * durable on-disk counterparts.
 */

const metrics = require('../lib/metrics');

const args = process.argv.slice(2);
const subcmd = args[0] || 'summary';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`Vant Metrics — shared registry (Prometheus-compatible)

Usage:
  vant metrics                      Registry summary + storage section (default)
  vant metrics --prom               Prometheus text exposition format
  vant metrics get <name> [labels]  Counter value (labels: k=v,k=v)
  vant metrics inc <name> [by] [labels]
  vant metrics gauge <name> <val> [labels]
  vant metrics observe <name> <val> [labels]
  vant metrics storage              Per-store op/bytes/error aggregation
  vant metrics reset                Wipe all in-process series`);
    process.exit(0);
}

/** Parse "k=v,k2=v2" into a labels object (empty labels allowed). */
function parseLabels(s) {
    if (!s) return {};
    const out = {};
    for (const pair of String(s).split(',')) {
        const i = pair.indexOf('=');
        if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
    }
    return out;
}

function fmtBytes(n) {
    if (!Number.isFinite(n)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Storage aggregation section — feature-detected so the CLI works with any storage build. */
function showStorage() {
    let storage;
    try { storage = require('../lib/storage'); } catch (e) { storage = null; }
    if (!storage || typeof storage.getStorageMetrics !== 'function') {
        console.log('\nStorage: (not instrumented in this build)');
        return;
    }
    const m = storage.getStorageMetrics();
    console.log('\nStorage stores:');
    if (!m.stores.length) {
        console.log('  (no store activity yet this process)');
    }
    for (const s of m.stores) {
        const ops = Object.entries(s.ops).map(([k, v]) => `${k}=${v}`).join(' ') || '-';
        console.log(`  ${s.basePath}`);
        console.log(`    ops: ${ops}`);
        console.log(`    bytes: ${fmtBytes(s.totals.bytes)}  errors: ${s.totals.errors}`);
    }
    console.log(`\nStorage totals: ops=${m.totals.ops} bytes=${fmtBytes(m.totals.bytes)} errors=${m.totals.errors}`);
}

function run() {
    if (subcmd === '--prom' || subcmd === 'prom' || subcmd === 'prometheus') {
        process.stdout.write(metrics.toPrometheus());
        return;
    }

    if (subcmd === 'get') {
        const name = args[1];
        if (!name) { console.error('Usage: vant metrics get <name> [labels]'); process.exit(1); }
        const v = metrics.counterValue(name, parseLabels(args[2]));
        console.log(String(v));
        return;
    }

    if (subcmd === 'inc' || subcmd === 'increment') {
        const name = args[1];
        if (!name) { console.error('Usage: vant metrics inc <name> [by] [labels]'); process.exit(1); }
        const by = args[2] !== undefined && args[2] !== undefined && !/^[a-zA-Z]+=/.test(args[2]) ? Number(args[2]) : undefined;
        const labels = by !== undefined ? parseLabels(args[3]) : parseLabels(args[2]);
        metrics.inc(name, labels, by === undefined || isNaN(by) ? 1 : by);
        console.log('Incremented:', name);
        return;
    }

    if (subcmd === 'gauge') {
        const name = args[1];
        const val = parseFloat(args[2]);
        if (!name || isNaN(val)) { console.error('Usage: vant metrics gauge <name> <value> [labels]'); process.exit(1); }
        metrics.setGauge(name, val, parseLabels(args[3]));
        console.log('Set gauge:', name, '=', val);
        return;
    }

    if (subcmd === 'observe' || subcmd === 'timing') {
        const name = args[1];
        const val = parseFloat(args[2]);
        if (!name || isNaN(val)) { console.error('Usage: vant metrics observe <name> <value> [labels]'); process.exit(1); }
        metrics.observe(name, val, parseLabels(args[3]));
        console.log('Observed:', name, '=', val);
        return;
    }

    if (subcmd === 'storage') {
        showStorage();
        return;
    }

    if (subcmd === 'reset' || subcmd === 'clear') {
        metrics.reset();
        console.log('Metrics cleared');
        return;
    }

    // Default: registry summary + storage section
    const snap = metrics.snapshot();
    console.log('╔═══════════════════════════════════════╗');
    console.log('║         Vant Metrics Registry         ║');
    console.log('╚═══════════════════════════════════════╝');
    console.log(`  Counters:   ${snap.counters.length} series`);
    console.log(`  Gauges:     ${snap.gauges.length} series`);
    console.log(`  Histograms: ${snap.histograms.length} series`);
    if (snap.counters.length) {
        console.log('\nCounters:');
        for (const c of snap.counters.slice(0, 20)) {
            const lbl = Object.keys(c.labels || {}).length
                ? '{' + Object.keys(c.labels).sort().map(k => `${k}=${c.labels[k]}`).join(',') + '}' : '';
            console.log(`  ${c.name}${lbl} = ${c.value}`);
        }
        if (snap.counters.length > 20) console.log(`  … and ${snap.counters.length - 20} more`);
    }
    if (snap.gauges.length) {
        console.log('\nGauges:');
        for (const g of snap.gauges.slice(0, 20)) {
            const lbl = Object.keys(g.labels || {}).length
                ? '{' + Object.keys(g.labels).sort().map(k => `${k}=${g.labels[k]}`).join(',') + '}' : '';
            console.log(`  ${g.name}${lbl} = ${g.value}`);
        }
    }
    showStorage();

    // Sudo section — feature-detected
    try {
        const sudo = require('../lib/sudo');
        if (sudo && typeof sudo.getSudoMetrics === 'function') {
            const sm = sudo.getSudoMetrics();
            console.log('\nSudo: grants active=' + sm.grantsActive +
                (Object.keys(sm.byService).length ? ' byService={' + Object.entries(sm.byService).map(([k, v]) => k + '=' + v).join(',') + '}' : ''));
            const esc = sm.registry.counters.filter(c => c.name === 'vant_sudo_escalations_total' || c.name === 'vant_sudo_revalidations_total');
            for (const c of esc) {
                const lbl = Object.keys(c.labels || {}).sort().map(k => c.labels[k]).join('/');
                console.log('  ' + c.name.replace('vant_sudo_', '') + '[' + lbl + '] = ' + c.value);
            }
        }
    } catch (e) { /* sudo section optional */ }

    console.log('\nPrometheus export: vant metrics --prom');
}

run();
