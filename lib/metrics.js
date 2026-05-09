/**
 * Metrics - Datadog monitoring integration + local tracking
 * 
 * Usage:
 *   const metrics = require('./metrics');
 *   
 *   // Datadog (HTTP API)
 *   metrics.increment('vant.sync.success');
 *   metrics.gauge('vant.memory.usage', 256);
 *   
 *   // Local in-memory tracking
 *   metrics.getStats();
 *   metrics.isOperationAllowed('read');
 *   metrics.getLayerStatus();
 */

const os = require('os');
const vaf = require('./vaf');

const DEFAULT_TAGS = ['env:production', 'service:vant'];

/**
 * Metrics Class
 * Provides in-memory metrics tracking with framework hooks
 */
class Metrics {
    /**
     * Create Metrics instance
     */
    constructor(options = {}) {
        this.options = {
            prefix: options.prefix || 'vant',
            retention: options.retention || 1000,
            ...options
        };
        
        // Storage: metricName → { values: [], count: 0, sum: 0, min, max }
        this._metrics = new Map();
        
        // Timestamps for cleanup
        this._startTime = Date.now();
        
        // System info
        this._system = {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            memory: os.totalmem()
        };
    }
    
    /**
     * Increment counter
     */
    increment(name, value = 1) {
        return this._updateCounter(name, value);
    }
    
    /**
     * Decrement counter
     */
    decrement(name, value = 1) {
        return this._updateCounter(name, -value);
    }
    
    /**
     * Update counter
     */
    _updateCounter(name, value) {
        const fullName = this._prefix(name);
        
        if (!this._metrics.has(fullName)) {
            this._metrics.set(fullName, { type: 'counter', value: 0 });
        }
        
        const metric = this._metrics.get(fullName);
        metric.value += value;
        
        return metric.value;
    }
    
    /**
     * Record gauge value
     */
    gauge(name, value) {
        const fullName = this._prefix(name);
        this._metrics.set(fullName, { type: 'gauge', value });
        
        return value;
    }
    
    /**
     * Record timing
     */
    timing(name, value) {
        const fullName = this._prefix(name);
        
        if (!this._metrics.has(fullName)) {
            this._metrics.set(fullName, { 
                type: 'timing', 
                values: [], 
                count: 0, 
                sum: 0, 
                min: Infinity, 
                max: -Infinity 
            });
        }
        
        const metric = this._metrics.get(fullName);
        metric.values.push(value);
        metric.count++;
        metric.sum += value;
        metric.min = Math.min(metric.min, value);
        metric.max = Math.max(metric.max, value);
        
        // Trim old values
        if (metric.values.length > this.options.retention) {
            const removed = metric.values.shift();
            metric.count--;
            metric.sum -= removed;
        }
        
        return value;
    }
    
    /**
     * Get metric value
     */
    get(name) {
        return this._metrics.get(this._prefix(name));
    }
    
    /**
     * Get all metrics
     */
    getAll() {
        return Object.fromEntries(this._metrics);
    }
    
    /**
     * Get statistics
     */
    getStats() {
        const stats = {
            metrics: this._metrics.size,
            uptime: Date.now() - this._startTime,
            system: this._system,
            values: {}
        };
        
        for (const [name, metric] of this._metrics) {
            if (metric.type === 'timing' && metric.count > 0) {
                stats.values[name] = {
                    count: metric.count,
                    sum: metric.sum,
                    avg: (metric.sum / metric.count).toFixed(2),
                    min: metric.min,
                    max: metric.max
                };
            } else {
                stats.values[name] = { value: metric.value };
            }
        }
        
        return stats;
    }
    
    /**
     * Add prefix
     */
    _prefix(name) {
        return this.options.prefix ? `${this.options.prefix}.${name}` : name;
    }
    
    /**
     * Clear metrics
     */
    clear() {
        this._metrics.clear();
    }
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'Metrics',
            type: 'metrics',
            enabled: true,
            config: {
                prefix: this.options.prefix,
                retention: this.options.retention
            },
            state: {
                metrics: this._metrics.size,
                uptime: Date.now() - this._startTime,
                system: this._system
            }
        };
    }
    
    /**
     * Check operation allowed
     */
    isOperationAllowed(operationType, context = {}) {
        return {allowed: true, layer: 'Metrics'};
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {enabled: true, metrics: this._metrics.size};
    }
}

/**
 * Default Metrics instance
 */
const defaultMetrics = new Metrics();

/**
 * Submit metric to Datadog (HTTP API)
 * @param {string} type - counter, gauge, timing
 * @param {string} metric - Metric name
 * @param {number} value - Metric value
 * @param {array} tags - Additional tags
 */
async function submit(type, metric, value, tags = []) {
    vaf.check(type, {type: "string", name: "type", maxLength: 20});
    const { DD_API_KEY, DD_SITE = 'datadoghq.com' } = process.env;
    
    if (!DD_API_KEY) {
        // No-op if no API key
        return false;
    }
    
    const allTags = [...DEFAULT_TAGS, ...tags].join(',');
    const payload = `${metric}:${value}|${type}|#${allTags}\n`;
    
    try {
        const https = require('https');
        const req = https.request({
            hostname: 'api.' + DD_SITE,
            path: '/api/v1/series',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'DD-API-KEY': DD_API_KEY
            }
        }, (res) => {
            res.on('data', () => {});
            res.on('end', () => {});
        });
        
        req.write(JSON.stringify({
            series: [{
                metric,
                points: [[Date.now() / 1000, value]],
                type,
                tags: allTags.split(',')
            }]
        }));
        
        req.end();
        return true;
    } catch (e) {
        console.error('[Metrics] Failed:', e.message);
        return false;
    }
}

/**
 * Increment a counter
 * @param {string} metric - Metric name
 * @param {number} value - Increment by (default 1)
 * @param {array} tags - Tags
 */
function increment(metric, value = 1, tags = []) {
    return submit('counter', metric, value, tags);
}

/**
 * Set a gauge value
 * @param {string} metric - Metric name
 * @param {number} value - Value
 * @param {array} tags - Tags
 */
function gauge(metric, value, tags = []) {
    return submit('gauge', metric, value, tags);
}

/**
 * Record a timing
 * @param {string} metric - Metric name
 * @param {number} ms - Milliseconds
 * @param {array} tags - Tags
 */
function timing(metric, ms, tags = []) {
    return submit('gauge', metric, ms, tags);
}

/**
 * Record sync event
 * @param {string} type - success, fail, conflict
 * @param {object} meta - Extra metadata
 */
function sync(type, meta = {}) {
    increment(`vant.sync.${type}`, 1, [meta.branch ? `branch:${meta.branch}` : ''].filter(Boolean));
    
    if (meta.duration) {
        timing('vant.sync.duration', meta.duration);
    }
    
    if (meta.files) {
        gauge('vant.sync.files', meta.files);
    }
}

/**
 * Record brain load event
 * @param {string} version - Brain version
 * @param {object} stats - Load stats
 */
function brainLoad(version, stats = {}) {
    increment('vant.brain.load', 1, [`version:${version}`]);
    
    if (stats.files) {
        gauge('vant.brain.files', stats.files);
    }
    
    if (stats.size) {
        gauge('vant.brain.size_bytes', stats.size);
    }
}

/**
 * Record plugin event
 * @param {string} plugin - Plugin name
 * @param {string} event - load, unload, error
 */
function plugin(plugin, event) {
    increment(`vant.plugin.${event}`, 1, [`plugin:${plugin}`]);
}

/**
 * Set system metrics (call periodically)
 */
function system() {
    const cpus = os.cpus();
    const load = os.loadavg()[0];
    const mem = os.freemem() / os.totalmem() * 100;
    
    gauge('vant.system.cpu.load', load);
    gauge('vant.system.memory.used_pct', mem);
    
    const cpusIdle = cpus.reduce((sum, c) => sum + c.times.idle, 0);
    const cpusTotal = cpus.reduce((sum, c) => sum + Object.values(c.times).reduce((a, b) => a + b, 0), 0);
    gauge('vant.system.cpu.idle_pct', (cpusIdle / cpusTotal) * 100);
}

module.exports = {
    // Class
    Metrics,
    
    /**
     * Create Metrics instance
     */
    create(options) {
        return new Metrics(options);
    },
    
    // Datadog functions
    increment,
    gauge,
    timing,
    sync,
    brainLoad,
    plugin,
    system,
    DEFAULT_TAGS,
    
    // Re-export local methods from default instance
    get: (name) => defaultMetrics.get(name),
    getAll: () => defaultMetrics.getAll(),
    getStats: () => defaultMetrics.getStats(),
    clear: () => defaultMetrics.clear(),
    
    // Framework hooks
    getLayerStatus() {
        return defaultMetrics.getLayerStatus();
    },
    
    isOperationAllowed(operationType, context) {
        return defaultMetrics.isOperationAllowed(operationType, context);
    },
    
    getStatus() {
        return defaultMetrics.getStatus();
    }
};