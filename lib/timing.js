/**
 * Vant Timing Class
 * High-resolution timing
 */

class Timing {
    constructor(options = {}) {
        this.options = options;
        this._marks = new Map();
        this._startTime = Date.now();
    }
    
    now() { return process.hrtime.bigint(); }
    ms() { return Date.now(); }
    micro() { return Math.floor(process.hrtime.bigint() / 1000n); }
    
    mark(name) { this._marks.set(name, this.now()); }
    
    measure(name, from) {
        const start = this._marks.get(from) || this._marks.get('start') || this.now();
        return Number(this.now() - start) / 1000000;
    }
    
    getLayerStatus() { return { name: 'Timing', type: 'utility', enabled: true, state: { marks: this._marks.size, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Timing' }; }
    getStatus() { return { enabled: true }; }
}

const defaultTiming = new Timing();

module.exports = {
    Timing, create: (o) => new Timing(o),
    now: () => defaultTiming.now(),
    ms: () => defaultTiming.ms(),
    micro: () => defaultTiming.micro(),
    mark: (n) => defaultTiming.mark(n),
    measure: (n, f) => defaultTiming.measure(n, f),
    getLayerStatus: () => defaultTiming.getLayerStatus(),
    isOperationAllowed: (op) => defaultTiming.isOperationAllowed(op),
    getStatus: () => defaultTiming.getStatus()
};