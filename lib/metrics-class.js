/**
 * Vant Metrics Class
 * 
 * Observability wrapper - tracks metrics, timings, counters
 * Integrated with existing metrics.js logic
 * 
 * Usage:
 *   const metrics = require('./metrics');
 *   
 *   // Record metric
 *   metrics.increment('requests');
 *   metrics.timing('responseTime', 150);
 *   
 *   // Get stats
 *   metrics.getStats();
 *   
 *   // Check allowed
 *   metrics.isOperationAllowed('read');
 *   metrics.getLayerStatus();
 */

const os = require('os');

/**
 * Metrics Class
 * Provides observability tracking
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
        
        // Timestamps forcleanup
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

const defaultMetrics = new Metrics();

module.exports = {
    Metrics,
    create(options) {
        return new Metrics(options);
    },
    increment(name, value) {
        return defaultMetrics.increment(name, value);
    },
    decrement(name, value) {
        return defaultMetrics.decrement(name, value);
    },
    gauge(name, value) {
        return defaultMetrics.gauge(name, value);
    },
    timing(name, value) {
        return defaultMetrics.timing(name, value);
    },
    get(name) {
        return defaultMetrics.get(name);
    },
    getAll() {
        return defaultMetrics.getAll();
    },
    getStats() {
        return defaultMetrics.getStats();
    },
    clear() {
        return defaultMetrics.clear();
    },
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