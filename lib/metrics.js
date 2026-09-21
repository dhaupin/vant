/**
 * Vant Metrics — shared in-process registry (prd-storage + prd-sudo metrics)
 *
 * Tiny dependency-free counters / gauges / histograms with a Prometheus
 * text-format exporter. Series are keyed by metric name + sorted label pairs,
 * so `inc('vant_storage_ops_total', { op: 'write', outcome: 'ok' })` and the
 * same call with different labels produce distinct series.
 *
 * Contract:
 *   - NEVER throws. Metrics collection must not be able to take down a
 *     storage write or a sudo escalation; every API swallows its own errors.
 *   - In-process only: values live for the lifetime of the module instance
 *     (one per Node module cache). Persistence/aggregation across processes
 *     is the exporter's job, not this module's.
 *   - Histogram buckets are fixed (Prometheus-style cumulative `_bucket`
 *     series plus `_sum` / `_count`).
 *
 * Usage:
 *   const metrics = require('./metrics');
 *   metrics.inc('vant_storage_ops_total', { op: 'write', outcome: 'ok' });
 *   metrics.observe('vant_storage_op_duration_ms', 3.2, { op: 'write' });
 *   metrics.setGauge('vant_sudo_grants_active', 2, { service: 'storage' });
 *   metrics.toPrometheus();  // text exposition format
 */

const DEFAULT_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

const _counters = new Map();   // key -> { name, labels, value }
const _gauges = new Map();     // key -> { name, labels, value }
const _histograms = new Map(); // name -> { buckets, series: Map(key -> {labels, counts, sum, count}) }

function _seriesKey(name, labels) {
    if (!labels) return name;
    const pairs = Object.keys(labels).sort().map(k => `${k}=${String(labels[k])}`);
    return `${name}{${pairs.join(',')}}`;
}

function _sanitizeName(name) {
    return String(name || '').replace(/[^a-zA-Z0-9_:]/g, '_').slice(0, 120);
}

function _sanitizeLabelValue(v) {
    return String(v === undefined || v === null ? '' : v)
        .replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
        .slice(0, 200);
}

/**
 * Increment a counter. `by` defaults to 1 (negative increments allowed for
 * internal corrections but discouraged).
 */
function inc(name, labels, by = 1) {
    try {
        const n = Number(by);
        if (!Number.isFinite(n)) return false;
        const key = _seriesKey(name, labels);
        const cur = _counters.get(key);
        if (cur) cur.value += n;
        else _counters.set(key, { name: _sanitizeName(name), labels: labels || {}, value: n });
        return true;
    } catch (e) { return false; }
}

/** Set a gauge to an absolute value (overwrites). */
function setGauge(name, value, labels) {
    try {
        const key = _seriesKey(name, labels);
        _gauges.set(key, { name: _sanitizeName(name), labels: labels || {}, value: Number(value) || 0 });
        return true;
    } catch (e) { return false; }
}

/** Record one observation into a histogram (milliseconds or bytes, caller decides). */
function observe(name, value, labels, buckets) {
    try {
        let h = _histograms.get(name);
        if (!h) {
            h = { buckets: (buckets || DEFAULT_BUCKETS).slice().sort((a, b) => a - b), series: new Map() };
            _histograms.set(name, h);
        }
        const key = _seriesKey(name, labels);
        let s = h.series.get(key);
        if (!s) {
            s = { labels: labels || {}, counts: new Array(h.buckets.length).fill(0), sum: 0, count: 0 };
            h.series.set(key, s);
        }
        const v = Number(value);
        if (!Number.isFinite(v)) return false;
        for (let i = 0; i < h.buckets.length; i++) {
            if (v <= h.buckets[i]) s.counts[i]++;
        }
        s.sum += v;
        s.count++;
        return true;
    } catch (e) { return false; }
}

/** Structured snapshot (for tests and JSON consumers). */
function snapshot() {
    const counters = [];
    for (const [, c] of _counters) counters.push({ name: c.name, labels: c.labels, value: c.value });
    const gauges = [];
    for (const [, g] of _gauges) gauges.push({ name: g.name, labels: g.labels, value: g.value });
    const histograms = [];
    for (const [name, h] of _histograms) {
        for (const [, s] of h.series) {
            histograms.push({ name, labels: s.labels, buckets: h.buckets, counts: s.counts.slice(), sum: s.sum, count: s.count });
        }
    }
    return { counters, gauges, histograms };
}

/** Get a single counter value (0 when absent). */
function counterValue(name, labels) {
    const c = _counters.get(_seriesKey(name, labels));
    return c ? c.value : 0;
}

/**
 * Prometheus text exposition format (v0.0.4):
 *   # TYPE <name> counter
 *   <name>{label="value",...} <value>
 * Histograms emit cumulative `_bucket{le="..."}` series plus `_sum`/`_count`.
 */
function toPrometheus() {
    const out = [];
    const safeLabels = (labels) => {
        const pairs = Object.keys(labels || {}).sort()
            .map(k => `${_sanitizeName(k)}="${_sanitizeLabelValue(labels[k])}"`);
        return pairs.length ? `{${pairs.join(',')}}` : '';
    };

    if (_counters.size) {
        const seenNames = new Set();
        for (const [, c] of _counters) {
            if (!seenNames.has(c.name)) {
                out.push(`# TYPE ${c.name} counter`);
                seenNames.add(c.name);
            }
            out.push(`${c.name}${safeLabels(c.labels)} ${c.value}`);
        }
    }

    if (_gauges.size) {
        const seenNames = new Set();
        for (const [, g] of _gauges) {
            if (!seenNames.has(g.name)) {
                out.push(`# TYPE ${g.name} gauge`);
                seenNames.add(g.name);
            }
            out.push(`${g.name}${safeLabels(g.labels)} ${g.value}`);
        }
    }

    for (const [name, h] of _histograms) {
        out.push(`# TYPE ${name} histogram`);
        for (const [, s] of h.series) {
            for (let i = 0; i < h.buckets.length; i++) {
                const bl = { ...s.labels, le: String(h.buckets[i]) };
                out.push(`${name}_bucket${safeLabels(bl)} ${s.counts[i]}`);
            }
            const infLabels = { ...s.labels, le: '+Inf' };
            out.push(`${name}_bucket${safeLabels(infLabels)} ${s.count}`);
            out.push(`${name}_sum${safeLabels(s.labels)} ${s.sum}`);
            out.push(`${name}_count${safeLabels(s.labels)} ${s.count}`);
        }
    }

    return out.join('\n') + (out.length ? '\n' : '');
}

/** Wipe all series (used by tests; also exported for /admin-style resets). */
function reset() {
    _counters.clear();
    _gauges.clear();
    _histograms.clear();
    return true;
}

/** High-resolution timer helper: returns a stop() that observes elapsed ms. */
function startTimer(name, labels) {
    const t0 = process.hrtime.bigint();
    return (extraLabels) => {
        const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
        observe(name, elapsedMs, extraLabels ? { ...labels, ...extraLabels } : labels);
        return elapsedMs;
    };
}

module.exports = {
    inc,
    setGauge,
    observe,
    startTimer,
    snapshot,
    counterValue,
    toPrometheus,
    reset,
    DEFAULT_BUCKETS
};
