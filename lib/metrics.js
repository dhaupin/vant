/**
 * Metrics (v0.8.6)
 * Performance monitoring + instrumentation
 * Copied from audit.js to separate concerns
 * 
 * Usage:
 *   const metrics = require('./metrics');
 *   metrics.increment('requests');
 *   metrics.timing('db.query', 42);
 *   metrics.gauge('memory.used', process.memoryUsage().heapUsed);
 *   console.log(metrics.getStats());
 */

const _metrics = new Map();
const _counters = new Map();
const _gauges = new Map();
const _timings = new Map();
let _metricsStart = Date.now();

/**
 * Increment a counter
 */
function increment(metric, value = 1, tags = []) {
    const key = metric + ':' + tags.join(',');
    _counters.set(key, (_counters.get(key) || 0) + value);
    _metrics.set(key, { metric, value: _counters.get(key), tags, timestamp: Date.now() });
}

/**
 * Set a gauge value
 */
function gauge(metric, value, tags = []) {
    const key = metric + ':' + tags.join(',');
    _gauges.set(key, value);
    _metrics.set(key, { metric, value, tags, timestamp: Date.now() });
}

/**
 * Record a timing
 */
function timing(metric, duration, tags = []) {
    const key = metric + ':' + tags.join(',');
    const timings = _timings.get(key) || [];
    timings.push(duration);
    _timings.set(key, timings);
    _metrics.set(key, { metric, value: duration, tags, timestamp: Date.now(), type: 'timing' });
}

/**
 * Get aggregated stats
 */
function getStats() {
    const stats = { 
        counters: {}, 
        gauges: {}, 
        timings: {},
        uptime: Date.now() - _metricsStart 
    };
    for (const [k, v] of _counters) stats.counters[k] = v;
    for (const [k, v] of _gauges) stats.gauges[k] = v;
    
    // Calculate timing stats (avg, p50, p95, p99)
    for (const [k, v] of _timings) {
        if (v.length > 0) {
            const sorted = [...v].sort((a, b) => a - b);
            const sum = sorted.reduce((a, b) => a + b, 0);
            const avg = sum / sorted.length;
            const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
            const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
            const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
            stats.timings[k] = { count: v.length, avg, p50, p95, p99 };
        }
    }
    
    return stats;
}

/**
 * Clear all metrics
 */
function clear() { 
    _metrics.clear(); 
    _counters.clear(); 
    _gauges.clear(); 
    _timings.clear();
    _metricsStart = Date.now(); 
}

/**
 * Time a function execution
 */
function timeFn(fn, metric, tags = []) {
    const start = Date.now();
    try {
        const result = fn();
        timing(metric, Date.now() - start, tags);
        return result;
    } catch (e) {
        timing(metric, Date.now() - start, [...tags, 'error']);
        throw e;
    }
}

/**
 * Time an async function execution
 */
async function timeFnAsync(fn, metric, tags = []) {
    const start = Date.now();
    try {
        const result = await fn();
        timing(metric, Date.now() - start, tags);
        return result;
    } catch (e) {
        timing(metric, Date.now() - start, [...tags, 'error']);
        throw e;
    }
}

module.exports = {
    increment,
    gauge,
    timing,
    getStats,
    clear,
    timeFn,
    timeFnAsync,
    getLayerStatus: () => ({ name: 'Metrics', type: 'instrumentation', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, metrics: _metrics.size, counters: _counters.size })
};