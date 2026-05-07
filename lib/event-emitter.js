/**
 * Vant EventEmitter Class
 * Event emitter utilities
 */

class EventEmitter {
    constructor(options = {}) {
        this._events = new Map();
        this._startTime = Date.now();
    }
    
    on(event, fn) {
        if (!this._events.has(event)) this._events.set(event, []);
        this._events.get(event).push(fn);
    }
    
    once(event, fn) {
        const wrapper = (...args) => { fn(...args); this.off(event, wrapper); };
        this.on(event, wrapper);
    }
    
    emit(event, ...args) {
        const handlers = this._events.get(event) || [];
        handlers.forEach(fn => fn(...args));
    }
    
    off(event, fn) {
        const handlers = this._events.get(event) || [];
        this._events.set(event, handlers.filter(f => f !== fn));
    }
    
    removeAllListeners(event) {
        if (event) this._events.delete(event);
        else this._events.clear();
    }
    
    listenerCount(event) { return (this._events.get(event) || []).length; }
    
    getLayerStatus() { return { name: 'EventEmitter', type: 'event', enabled: true, state: { events: this._events.size, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'EventEmitter' }; }
    getStatus() { return { enabled: true, events: this._events.size }; }
}

module.exports = {
    EventEmitter, create: (o) => new EventEmitter(o),
    on: (e, f) => EventEmitter.prototype.on.call({_events: new Map()}, e, f),
    emit: (e, ...a) => EventEmitter.prototype.emit.call({_events: new Map()}, e, ...a),
    getLayerStatus: () => ({ name: 'EventEmitter', type: 'event', enabled: true, state: { events: 0, uptime: 0 } }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'EventEmitter' }),
    getStatus: () => ({ enabled: true })
};