/**
 * Health - Express health check endpoint (v0.8.6)
 * WITH EVENT EMISSIONS - health checks emit globally
 * 
 * Usage:
 *   const health = require('./health');
 *   health.start(3000);
 * 
 * Endpoints:
 *   GET /health - Basic health check
 *   GET /health/ready - Readiness probe
 *   GET /health/live - Liveness probe
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

// Lazy-load express (optional - returns null if not installed)
let _express = null;
function _getExpress() {
    if (!_express) {
        try { _express = require('express'); } 
        catch (e) { _express = null; }
    }
    return _express;
}

const os = require('os');
const vaf = require('./vaf');
const network = require('./network');
const fs = require('fs');
const pipeline = require('./pipeline');

// Lazy-load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

let server = null;

/**
 * Start health server
 * @param {number} port - Port (default: 3000)
 * @param {object} options - Additional options
 */
function start(port = 3000, options = {}) {
    vaf.check(port, {type: 'number', name: 'port', min: 1, max: 65535});
    const app = express();
    app.disable('x-powered-by');
    
    // Basic health - am I alive?
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: require('../package.json').version
        });
    });
    
    // Readiness - can I serve requests?
    app.get('/health/ready', async (req, res) => {
        const checks = await runChecks();
        const ready = checks.every(c => c.status === 'ok');
        
        res.status(ready ? 200 : 503).json({
            status: ready ? 'ready' : 'not_ready',
            checks,
            timestamp: new Date().toISOString()
        });
    });
    
    // Liveness - do you need to restart me?
    app.get('/health/live', (req, res) => {
        // Check if we're not stuck in a loop
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        
        // Restart if using > 1GB heap (likely memory leak)
        if (heapUsedMB > 1024) {
            res.status(503).json({
                status: 'restart',
                reason: 'high_memory',
                heap_mb: heapUsedMB
            });
        } else {
            res.json({
                status: 'alive',
                heap_mb: heapUsedMB,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Metrics endpoint
    if (options.metrics) {
        app.get('/metrics', (req, res) => {
            const mem = process.memoryUsage();
            const cpu = process.cpuUsage();
            
            res.set('Content-Type', 'text/plain');
            res.send(`
vant_heap_used_bytes ${mem.heapUsed}
vant_heap_total_bytes ${mem.heapTotal}
vant_rss_bytes ${mem.rss}
vant_cpu_user_ms ${cpu.user}
vant_cpu_system_ms ${cpu.system}
vant_uptime_seconds ${process.uptime()}
`.trim());
        });
    }
    
    // Systems endpoint - use centralized system.js (DRY)
    app.get('/systems', (req, res) => {
        const system = require('./system');
        res.json(system.status());
    });
    
    // Start server
    return new Promise((resolve, reject) => {
        server = app.listen(port, () => {
            audit.info(`[Health] Server listening on port ${port}`);
            
            // EVENT: health server started
            _emit('health:started', { port, timestamp: Date.now() });
            
            resolve({ app, server });
        });
        server.on('error', reject);
    });
}

/**
 * Run health checks
 */
async function runChecks() {
    // Run through unified pipeline
    return pipeline.run(
        { name: 'health:runChecks', operation: 'check' },
        async () => {
            _checkRead();
            const checks = [];
            
            // Check GitHub connectivity
            try {
                // Use network.fetch() (goes through sandbox canNetwork gate)
                await network.fetchJson('https://api.github.com', { timeout: 5000 });
                checks.push({ name: 'github', status: 'ok' });
            } catch (e) {
                checks.push({ name: 'github', status: 'warn', message: e.message });
            }
            
            // Check disk space
            try {
                const stats = fs.statfsSync ? fs.statfsSync('.') : null;
                if (stats) {
                    const freeGB = (stats.bsize * stats.bfree) / 1e9;
                    checks.push({ name: 'disk', status: freeGB > 1 ? 'ok' : 'warn', free_gb: freeGB.toFixed(2) });
                }
            } catch (e) {
                // Ignore
            }
            
            // Check memory
            const mem = process.memoryUsage();
            const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
            checks.push({ name: 'memory', status: heapUsedMB < 512 ? 'ok' : 'warn', heap_mb: heapUsedMB });
            
            // Check Storage
            try {
                const storage = require('./storage');
                if (storage.version) {
                    checks.push({ name: 'storage', status: 'ok', version: storage.version });
                }
            } catch (e) {
                checks.push({ name: 'storage', status: 'warn', message: e.message });
            }
            
            return checks;
        },
        { mode: pipeline.PUBLIC }
    );
}

/**
 * Stop health server
 */
function stop() {
    return new Promise((resolve) => {
        if (server) {
            server.close(resolve);
            server = null;
        } else {
            resolve();
        }
    });
}

module.exports = {
    start,
    stop,
    runChecks,
    
    // Multibrain Stack
    getStackHealthStatus
};

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get health status from all brains in the stack
 * @returns {Object} Combined health info
 */
function getStackHealthStatus() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = { status: 'ok' };
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    
    return results;
}