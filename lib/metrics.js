/**
 * Metrics - Datadog monitoring integration
 * 
 * Usage:
 *   const metrics = require('./metrics');
 *   metrics.increment('vant.sync.success');
 *   metrics.gauge('vant.memory.usage', 256);
 *   metrics.timing('vant.sync.duration', 1234);
 */

const os = require('os');

const DEFAULT_TAGS = ['env:production', 'service:vant'];

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
    increment,
    gauge,
    timing,
    sync,
    brainLoad,
    plugin,
    system,
    DEFAULT_TAGS
};