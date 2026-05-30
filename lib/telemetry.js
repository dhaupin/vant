/**
 * Vant Telemetry (v0.8.7)
 * WITH EVENT EMISSIONS - metrics aggregate globally
 * Central telemetry collection + aggregation for runtime observability
 *
 * Usage:
 *   const telemetry = require('./telemetry');
 *   telemetry.record('api.latency', 45);
 *   telemetry.increment('requests.total');
 *   telemetry.getAggregates();
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

const os = require('os');

// In-memory metrics store (production: use storage for persistence)
const _metrics = new Map();

// Flush interval (default: 60s)
const FLUSH_INTERVAL = 60000;
let _flushTimer = null;

/**
 * Record a metric value
 * @param {string} name - Metric name
 * @param {number} value - Metric value
 * @param {object} tags - Optional tags
 */
function record(name, value, tags = {}) {
    if (!_metrics.has(name)) {
        _metrics.set(name, { count: 0, sum: 0, min: Infinity, max: -Infinity, values: [], tags: new Map() });
    }
    const m = _metrics.get(name);
    m.count++;
    m.sum += value;
    m.min = Math.min(m.min, value);
    m.max = Math.max(m.max, value);
    m.values.push(value);
    
    // Keep last 1000 values per metric
    if (m.values.length > 1000) {
        m.values = m.values.slice(-1000);
    }
    
    // Tags
    if (tags && Object.keys(tags).length > 0) {
        const tagKey = JSON.stringify(tags);
        if (!m.tags.has(tagKey)) {
            m.tags.set(tagKey, { count: 0, sum: 0 });
        }
        const t = m.tags.get(tagKey);
        t.count++;
        t.sum += value;
        m.tags.set(tagKey, t);
    }
    
    // EVENT: metric recorded
    _emit('telemetry:recorded', { name, value, tags, timestamp: Date.now() });
}

/**
 * Increment a counter
 * @param {string} name - Counter name
 * @param {number} delta - Amount to increment
 */
function increment(name, delta = 1) {
    record(name, delta);
}

/**
 * Record timing
 * @param {string} name - Timer name
 * @param {number} durationMs - Duration in milliseconds
 */
function timing(name, durationMs) {
    record(`${name}.duration`, durationMs);
}

/**
 * Get aggregates for a metric
 * @param {string} name - Metric name
 * @returns {object} aggregates
 */
function getAggregates(name) {
    if (name) {
        const m = _metrics.get(name);
        if (!m) return null;
        return {
            count: m.count,
            sum: m.sum,
            avg: m.count > 0 ? m.sum / m.count : 0,
            min: m.min === Infinity ? 0 : m.min,
            max: m.max === -Infinity ? 0 : m.max
        };
    }
    
    // All metrics
    const result = {};
    for (const [name, m] of _metrics) {
        result[name] = {
            count: m.count,
            sum: m.sum,
            avg: m.count > 0 ? m.sum / m.count : 0,
            min: m.min === Infinity ? 0 : m.min,
            max: m.max === -Infinity ? 0 : m.max
        };
    }
    return result;
}

/**
 * Get system metrics
 */
function getSystemMetrics() {
    const cpu = os.loadavg();
    const mem = process.memoryUsage();
    
    return {
        cpu: { load1: cpu[0], load5: cpu[1], load15: cpu[2] },
        memory: {
            heapUsed: mem.heapUsed,
            heapTotal: mem.heapTotal,
            rss: mem.rss,
            external: mem.external
        },
        uptime: process.uptime(),
        timestamp: Date.now()
    };
}

/**
 * Start automatic flush
 */
function startFlush(intervalMs = FLUSH_INTERVAL) {
    if (_flushTimer) {
        clearInterval(_flushTimer);
    }
    _flushTimer = setInterval(() => {
        flush();
    }, intervalMs);
    _emit('telemetry:started', { interval: intervalMs, timestamp: Date.now() });
}

/**
 * Stop automatic flush
 */
function stopFlush() {
    if (_flushTimer) {
        clearInterval(_flushTimer);
        _flushTimer = null;
        _emit('telemetry:stopped', { timestamp: Date.now() });
    }
}

/**
 * Flush metrics (for persistence)
 */
function flush() {
    const data = {
        metrics: getAggregates(),
        system: getSystemMetrics(),
        timestamp: Date.now()
    };
    _emit('telemetry:flushed', data);
    return data;
}

/**
 * Reset all metrics
 */
function reset() {
    _metrics.clear();
    _emit('telemetry:reset', { timestamp: Date.now() });
}

// Auto-start flush
startFlush();

module.exports = {
    record,
    increment,
    timing,
    getAggregates,
    getSystemMetrics,
    startFlush,
    stopFlush,
    flush,
    reset
};