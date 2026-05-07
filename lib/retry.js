/**
 * Vant Retry Class
 * Retry with backoff
 */

class Retry {
    constructor(options = {}) {
        this.options = { maxAttempts: options.maxAttempts || 3, backoff: options.backoff || 1000, multiplier: options.multiplier || 2 };
        this._startTime = Date.now();
    }
    
    async run(fn) {
        let lastError;
        for (let i = 0; i < this.options.maxAttempts; i++) {
            try { return await fn(); }
            catch (e) { lastError = e; if (i < this.options.maxAttempts - 1) await new Promise(r => setTimeout(r, this.options.backoff * Math.pow(this.options.multiplier, i))); }
        }
        throw lastError;
    }
    
    getLayerStatus() { return { name: 'Retry', type: 'utility', enabled: true, config: { maxAttempts: this.options.maxAttempts, backoff: this.options.backoff }, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Retry' }; }
    getStatus() { return { enabled: true }; }
}

const defaultRetry = new Retry();

module.exports = {
    Retry, create: (o) => new Retry(o),
    run: (f) => defaultRetry.run(f),
    getLayerStatus: () => defaultRetry.getLayerStatus(),
    isOperationAllowed: (op) => defaultRetry.isOperationAllowed(op),
    getStatus: () => defaultRetry.getStatus()
};