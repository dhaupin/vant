/**
 * Vant EventBus Class
 * 
 * Pub/sub event bus for layer-to-layer communication
 * Async event handling, wildcards, once handlers
 * 
 * Usage:
 *   const eventBus = require('./event-bus');
 *   
 *   // Subscribe to events
 *   const handler = (event) => console.log('received', event.data);
 *   eventBus.on('test:event', handler);
 *   
 *   // Publish events  
 *   await eventBus.emit('test:event', { data: 'test value' });
 *   
 *   // Check status
 *   eventBus.isOperationAllowed('read');
 *   eventBus.getLayerStatus();
 */

/**
 * Handler wrapper
 */
class EventHandler {
    constructor(fn, options = {}) {
        this.fn = fn;
        this.options = {
            once: options.once || false,
            priority: options.priority || 0,
            filter: options.filter || null,
            ...options
        };
        this.called = 0;
    }
    
    async handle(event) {
        // Check filter
        if (this.options.filter && !this.options.filter(event)) {
            return null;
        }
        
        this.called++;
        return this.fn(event);
    }
}

/**
 * EventBus Class
 * Provides pub/sub event system
 */
class EventBus {
    /**
     * Create EventBus instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        this.options = {
            maxListeners: options.maxListeners || 100,
            errorHandler: options.errorHandler || null,
            async: options.async !== false,
            ...options
        };
        
        // Handler storage: eventName → [EventHandler]
        this._handlers = new Map();
        
        // Event history
        this._history = [];
        this._maxHistory = options.maxHistory || 100;
        
        // Stats
        this._stats = {
            events: 0,
            emissions: 0,
            handlers: 0
        };
        
        // State
        this._startTime = Date.now();
    }
    
    /**
     * Subscribe to event
     */
    on(eventName, fn, options = {}) {
        const handler = new EventHandler(fn, options);
        
        if (!this._handlers.has(eventName)) {
            this._handlers.set(eventName, []);
        }
        
        const handlers = this._handlers.get(eventName);
        
        // Check limit
        if (handlers.length >= this.options.maxListeners) {
            throw new Error(`Max listeners for ${eventName} exceeded`);
        }
        
        // Insert by priority
        let i = handlers.length;
        while (i > 0 && handlers[i - 1].options.priority < handler.options.priority) {
            i--;
        }
        handlers.splice(i, 0, handler);
        
        this._stats.handlers++;
        
        // Return unsubscribe function
        return () => {
            const idx = handlers.indexOf(handler);
            if (idx !== -1) {
                handlers.splice(idx, 1);
                this._stats.handlers--;
            }
        };
    }
    
    /**
     * Subscribe once
     */
    once(eventName, fn, options = {}) {
        return this.on(eventName, fn, { ...options, once: true });
    }
    
    /**
     * Subscribe to wildcard events
     */
    onAny(fn, options = {}) {
        return this.on('*', fn, options);
    }
    
    /**
     * Emit event
     */
    async emit(eventName, data = {}) {
        this._stats.events++;
        
        const event = {
            name: eventName,
            data,
            timestamp: Date.now(),
            source: data.source || 'unknown'
        };
        
        // Add to history
        this._history.push(event);
        if (this._history.length > this._maxHistory) {
            this._history.shift();
        }
        
        // Get handlers
        const handlers = this._getHandlers(eventName);
        
        if (handlers.length === 0) {
            return [];
        }
        
        // Execute handlers
        const results = await Promise.all(
            handlers.map(h => this._executeHandler(h, event))
        );
        
        this._stats.emissions += handlers.length;
        
        // Remove once handlers
        handlers
            .filter(h => h.options.once)
            .forEach(h => this.off(eventName, h.fn));
        
        return results;
    }
    
    /**
     * Get handlers for event
     */
    _getHandlers(eventName) {
        const handlers = [];
        
        // Exact match
        if (this._handlers.has(eventName)) {
            handlers.push(...this._handlers.get(eventName));
        }
        
        // Wildcard match
        if (this._handlers.has('*')) {
            handlers.push(...this._handlers.get('*'));
        }
        
        // Prefix match
        for (const [pattern, hs] of this._handlers) {
            if (pattern.endsWith(':*') && eventName.startsWith(pattern.slice(0, -1))) {
                handlers.push(...hs);
            }
        }
        
        return handlers;
    }
    
    /**
     * Execute handler
     */
    async _executeHandler(handler, event) {
        try {
            if (this.options.async) {
                return await handler.handle(event);
            } else {
                return handler.handle(event);
            }
        } catch (err) {
            if (this.options.errorHandler) {
                return this.options.errorHandler(err, event);
            }
            console.error(`Event handler error:`, err.message);
            return null;
        }
    }
    
    /**
     * Unsubscribe (alias)
     */
    off(eventName, fn) {
        if (!this._handlers.has(eventName)) return;
        
        const handlers = this._handlers.get(eventName);
        for (let i = handlers.length - 1; i >= 0; i--) {
            if (handlers[i].fn === fn) {
                handlers.splice(i, 1);
                this._stats.handlers--;
            }
        }
    }
    
    /**
     * Remove all handlers for event
     */
    removeAllListeners(eventName) {
        if (eventName) {
            this._handlers.delete(eventName);
        } else {
            this._handlers.clear();
        }
    }
    
    /**
     * Get listener count
     */
    listenerCount(eventName) {
        return this._getHandlers(eventName).length;
    }
    
    /**
     * Get event history
     */
    getHistory(options = {}) {
        const limit = options.limit || 10;
        return this._history.slice(-limit);
    }
    
    /**
     * Get event bus stats
     */
    getStats() {
        return {
            ...this._stats,
            eventTypes: this._handlers.size,
            historySize: this._history.length
        };
    }
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'EventBus',
            type: 'event',
            enabled: true,
            config: {
                maxListeners: this.options.maxListeners,
                async: this.options.async,
                maxHistory: this.options.maxHistory
            },
            state: {
                eventTypes: this._handlers.size,
                handlers: this._stats.handlers,
                uptime: Date.now() - this._startTime
            }
        };
    }
    
    /**
     * Check if operation allowed
     */
    isOperationAllowed(operationType, context = {}) {
        return {allowed: true, layer: 'EventBus'};
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            enabled: true,
            eventTypes: this._handlers.size,
            handlers: this._stats.handlers
        };
    }
}

/**
 * Default EventBus instance
 */
const defaultEventBus = new EventBus();

module.exports = {
    // Class
    EventBus,
    EventHandler,
    
    /**
     * Create EventBus instance
     */
    create(options = {}) {
        return new EventBus(options);
    },
    
    // Methods
    on(eventName, fn, options) {
        return defaultEventBus.on(eventName, fn, options);
    },
    
    once(eventName, fn, options) {
        return defaultEventBus.once(eventName, fn, options);
    },
    
    onAny(fn, options) {
        return defaultEventBus.onAny(fn, options);
    },
    
    emit(eventName, data) {
        return defaultEventBus.emit(eventName, data);
    },
    
    off(eventName, fn) {
        return defaultEventBus.off(eventName, fn);
    },
    
    removeAllListeners(eventName) {
        return defaultEventBus.removeAllListeners(eventName);
    },
    
    listenerCount(eventName) {
        return defaultEventBus.listenerCount(eventName);
    },
    
    getHistory(options) {
        return defaultEventBus.getHistory(options);
    },
    
    getStats() {
        return defaultEventBus.getStats();
    },
    
    // Class methods
    getLayerStatus() {
        return defaultEventBus.getLayerStatus();
    },
    
    isOperationAllowed(operationType, context) {
        return defaultEventBus.isOperationAllowed(operationType, context);
    },
    
    getStatus() {
        return defaultEventBus.getStatus();
    }
};