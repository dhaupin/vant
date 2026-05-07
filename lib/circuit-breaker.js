/**
 * Vant CircuitBreaker Class
 * Circuit breaker pattern
 */

class CircuitBreaker {
    constructor(options = {}) {
        this.options = { threshold: options.threshold || 5, timeout: options.timeout || 60000 };
        this._failures = 0;
        this._state = 'CLOSED';
        this._lastFailure = 0;
        this._startTime = Date.now();
    }
    
    async run(fn) {
        if (this._state === 'OPEN') {
            if (Date.now() - this._lastFailure > this.options.timeout) this._state = 'HALF';
            else throw new Error('Circuit open');
        }
        try { const r = await fn(); this._failures = 0; return r; }
        catch (e) { this._failures++; this._lastFailure = Date.now(); if (this._failures >= this.options.threshold) this._state = 'OPEN'; throw e; }
    }
    
    getState() { return this._state; }
    
    getLayerStatus() { return { name: 'CircuitBreaker', type: 'utility', enabled: true, config: { threshold: this.options.threshold }, state: { state: this._state, failures: this._failures, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'CircuitBreaker' }; }
    getStatus() { return { enabled: true, state: this._state }; }
}

const defaultCircuitBreaker = new CircuitBreaker();

module.exports = {
    CircuitBreaker, create: (o) => new CircuitBreaker(o),
    run: (f) => defaultCircuitBreaker.run(f),
    getState: () => defaultCircuitBreaker.getState(),
    getLayerStatus: () => defaultCircuitBreaker.getLayerStatus(),
    isOperationAllowed: (op) => defaultCircuitBreaker.isOperationAllowed(op),
    getStatus: () => defaultCircuitBreaker.getStatus()
};