/**
 * Vant Event Bus (v0.8.6)
 *
 * Unified event system - EventBus, EventEmitter, PubSub
 * Consolidated from lib/event-bus.js, lib/event-emitter.js, lib/pubsub.js
 *
 * v0.8.6: Breaking refactor - merged all event systems into single file
 */

const events = require('events');

// ============================================
// EventHandler - Internal handler wrapper
// ============================================
class EventHandler {
    constructor(fn, options = {}) {
        this.fn = fn;
        this.options = options;
        this.callCount = 0;
        this.lastCall = null;
        this.createdAt = Date.now();
    }

    execute(...args) {
        this.callCount++;
        this.lastCall = { args, time: Date.now() };
        return this.fn(...args);
    }
}

// ============================================
// EventBus - Full featured event bus
// ============================================
class EventBus {
    constructor(options = {}) {
        this.options = {
            maxListeners: options.maxListeners || 100,
            errorHandler: options.errorHandler || null,
            async: options.async !== false,
            ...options
        };

        this._handlers = new Map();
        this._history = [];
        this._maxHistory = options.maxHistory || 100;
        this._stats = { events: 0, emissions: 0, handlers: 0 };
        this._startTime = Date.now();
    }

    on(eventName, fn, options = {}) {
        const handler = new EventHandler(fn, options);
        if (!this._handlers.has(eventName)) this._handlers.set(eventName, []);
        this._handlers.get(eventName).push(handler);
        this._stats.handlers++;
        return () => this.off(eventName, fn);
    }

    once(eventName, fn, options = {}) {
        return this.on(eventName, fn, { ...options, once: true });
    }

    off(eventName, fn) {
        const handlers = this._handlers.get(eventName);
        if (!handlers) return;
        const filtered = handlers.filter(h => h.fn !== fn);
        if (filtered.length === 0) this._handlers.delete(eventName);
        else this._handlers.set(eventName, filtered);
        this._stats.handlers = Math.max(0, this._stats.handlers - 1);
    }

    emit(eventName, data, context = {}) {
        this._stats.events++;
        const handlers = this._handlers.get(eventName) || [];
        for (const handler of handlers) {
            try {
                if (handler.options.once) this.off(eventName, handler.fn);
                handler.execute(data, context);
                this._stats.emissions++;
            } catch (err) {
                if (this.options.errorHandler) this.options.errorHandler(err, eventName, data);
            }
        }
        this._history.push({ eventName, data, time: Date.now() });
        if (this._history.length > this._maxHistory) this._history.shift();
    }

    removeAllListeners(eventName) {
        if (eventName) this._handlers.delete(eventName);
        else this._handlers.clear();
    }

    listenerCount(eventName) {
        return (this._handlers.get(eventName) || []).length;
    }

    getHistory(options = {}) {
        const limit = options.limit || 50;
        return this._history.slice(-limit);
    }

    getStats() {
        return { ...this._stats, uptime: Date.now() - this._startTime };
    }

    getLayerStatus() {
        return { name: 'EventBus', type: 'event', enabled: true, config: this.options, state: this.getStats() };
    }

    isOperationAllowed(op) { return { allowed: true, layer: 'EventBus' }; }
    getStatus() { return { enabled: true, events: this._stats.events }; }
}

// ============================================
// EventEmitter - Simple event emitter
// ============================================
class SimpleEventEmitter {
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

// ============================================
// PubSub - Publish/subscribe events
// ============================================
class PubSub extends events.EventEmitter {
    constructor(options = {}) {
        super();
        this.options = { ...options };
        this._subscriptions = new Map();
        this._startTime = Date.now();
    }

    subscribe(channel, handler) {
        if (!this._subscriptions.has(channel)) this._subscriptions.set(channel, new Set());
        this._subscriptions.get(channel).add(handler);
        this.on(channel, handler);
        return this;
    }

    unsubscribe(channel, handler) {
        if (this._subscriptions.has(channel)) {
            this._subscriptions.get(channel).delete(handler);
            this.off(channel, handler);
        }
        return this;
    }

    publish(channel, data) {
        this.emit(channel, data);
        return this;
    }

    channels() { return Array.from(this._subscriptions.keys()); }
    subscriberCount(channel) { return this._subscriptions.get(channel)?.size || 0; }

    getLayerStatus() { return { name: 'PubSub', type: 'infra', enabled: true, config: { channels: this._subscriptions.size }, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'PubSub' }; }
    getStatus() { return { enabled: true, channels: this._subscriptions.size }; }
}

// ============================================
// Default instances
// ============================================
const defaultEventBus = new EventBus();
const defaultEventEmitter = new SimpleEventEmitter();
const defaultPubSub = new PubSub();

// ============================================
// Main export (EventBus as default)
// ============================================
module.exports = {
    // Classes
    EventBus,
    EventHandler,
    EventEmitter: SimpleEventEmitter,
    PubSub,

    // Default instances
    defaultEventBus,
    defaultEventEmitter,
    defaultPubSub,

    // EventBus methods
    on: (...args) => defaultEventBus.on(...args),
    once: (...args) => defaultEventBus.once(...args),
    off: (...args) => defaultEventBus.off(...args),
    emit: (...args) => defaultEventBus.emit(...args),
    removeAllListeners: (...args) => defaultEventBus.removeAllListeners(...args),
    listenerCount: (...args) => defaultEventBus.listenerCount(...args),
    getHistory: (...args) => defaultEventBus.getHistory(...args),
    getStats: () => defaultEventBus.getStats(),

    // Layer methods
    getLayerStatus: () => defaultEventBus.getLayerStatus(),
    isOperationAllowed: (op) => defaultEventBus.isOperationAllowed(op),
    getStatus: () => defaultEventBus.getStatus()
};
