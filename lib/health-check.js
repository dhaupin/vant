/**
 **
 * Vant HealthCheck Class (v0.8.6)
 *
 * Uses shared status-template for DRY patterns
 * Status interface compatible with security layer
 *
 * v0.8.6: Shared status interface with security layer
 * Dependency health checks, readiness probes
 */

class HealthCheck {
    constructor(options = {}) {
        this.options = {
            timeout: options.timeout || 5000,
            threshold: options.threshold || 0.5
        };
        this._checks = new Map();
        this._startTime = Date.now();
    }
    
    register(name, fn, options = {}) {
        this._checks.set(name, { fn, enabled: options.enabled !== false, critical: options.critical || false });
    }
    
    unregister(name) {
        this._checks.delete(name);
    }
    
    async check() {
        const results = {};
        let healthy = true;
        for (const [name, check] of this._checks) {
            if (!check.enabled) { results[name] = { status: 'disabled' }; continue; }
            try {
                const result = await Promise.race([check.fn(), new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), this.options.timeout))]);
                results[name] = { status: 'healthy', ok: result };
            } catch (err) {
                results[name] = { status: 'error', error: err.message };
                healthy = false;
            }
        }
        return { healthy, checks: results, timestamp: Date.now() };
    }
    
    async checkOne(name) {
        const check = this._checks.get(name);
        if (!check) return { status: 'not_found' };
        try { return { status: 'healthy', ok: await check.fn() }; }
        catch (err) { return { status: 'error', error: err.message }; }
    }
    
    list() { return [...this._checks.keys()]; }
    
    getLayerStatus() {
        return { name: 'HealthCheck', type: 'health', enabled: true, state: { checks: this._checks.size, uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(operationType) {
        return { allowed: true, layer: 'HealthCheck' };
    }
    
    getStatus() {
        return { enabled: true, checks: this._checks.size };
    }
}

const defaultHealthCheck = new HealthCheck();

module.exports = {
    HealthCheck, create: (o) => new HealthCheck(o),
    register: (n, f, o) => defaultHealthCheck.register(n, f, o),
    unregister: (n) => defaultHealthCheck.unregister(n),
    check: () => defaultHealthCheck.check(),
    checkOne: (n) => defaultHealthCheck.checkOne(n),
    list: () => defaultHealthCheck.list(),
    getLayerStatus: () => defaultHealthCheck.getLayerStatus(),
    isOperationAllowed: (op) => defaultHealthCheck.isOperationAllowed(op),
    getStatus: () => defaultHealthCheck.getStatus()
};