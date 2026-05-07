/**
 * Vant PubSub Class
 * Publish/subscribe events
 */

const events = require('events');

class PubSub extends events.EventEmitter {
    constructor(options = {}) {
        super();
        this.options = { ...options };
        this._subscriptions = new Map();
        this._startTime = Date.now();
    }
    
    /**
     * Subscribe to channel
     */
    subscribe(channel, handler) {
        if (!this._subscriptions.has(channel)) {
            this._subscriptions.set(channel, new Set());
        }
        this._subscriptions.get(channel).add(handler);
        this.on(channel, handler);
        return this;
    }
    
    /**
     * Unsubscribe from channel
     */
    unsubscribe(channel, handler) {
        if (this._subscriptions.has(channel)) {
            this._subscriptions.get(channel).delete(handler);
            this.off(channel, handler);
        }
        return this;
    }
    
    /**
     * Publish to channel
     */
    publish(channel, data) {
        this.emit(channel, data);
        return this;
    }
    
    /**
     * Get channels
     */
    channels() {
        return Array.from(this._subscriptions.keys());
    }
    
    /**
     * Get subscriber count
     */
    subscriberCount(channel) {
        return this._subscriptions.get(channel)?.size || 0;
    }
    
    getLayerStatus() { return { name: 'PubSub', type: 'infra', enabled: true, config: { channels: this._subscriptions.size }, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'PubSub' }; }
    getStatus() { return { enabled: true, channels: this._subscriptions.size }; }
}

module.exports = {
    PubSub, create: (o) => new PubSub(o),
    subscribe: (c, h) => new PubSub().subscribe(c, h),
    unsubscribe: (c, h) => new PubSub().unsubscribe(c, h),
    publish: (c, d) => new PubSub().publish(c, d),
    channels: () => new PubSub().channels(),
    getLayerStatus: () => ({ name: 'PubSub', type: 'infra', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'PubSub' }),
    getStatus: () => ({ enabled: true })
};