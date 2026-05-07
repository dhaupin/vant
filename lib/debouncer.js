/**
 * Vant Debouncer Class
 * Debounce function calls
 */

class Debouncer {
    constructor(options = {}) {
        this.options = { wait: options.wait || 100 };
        this._timers = new Map();
        this._startTime = Date.now();
    }
    
    debounce(fn, wait) {
        const w = wait || this.options.wait;
        return (...args) => {
            if (this._timers.has(fn)) clearTimeout(this._timers.get(fn));
            this._timers.set(fn, setTimeout(() => { fn(...args); this._timers.delete(fn); }, w));
        };
    }
    
    cancel(fn) {
        if (this._timers.has(fn)) clearTimeout(this._timers.get(fn));
    }
    
    getLayerStatus() { return { name: 'Debouncer', type: 'utility', enabled: true, config: { wait: this.options.wait }, state: { timers: this._timers.size, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Debouncer' }; }
    getStatus() { return { enabled: true }; }
}

const defaultDebouncer = new Debouncer();

module.exports = {
    Debouncer, create: (o) => new Debouncer(o),
    debounce: (f, w) => defaultDebouncer.debounce(f, w),
    cancel: (f) => defaultDebouncer.cancel(f),
    getLayerStatus: () => defaultDebouncer.getLayerStatus(),
    isOperationAllowed: (op) => defaultDebouncer.isOperationAllowed(op),
    getStatus: () => defaultDebouncer.getStatus()
};