/**
 * Vant QoS - Quality of Service
 */

const path = require('path');
const fs = require('fs');
const vaf = require('./vaf');

/**
 * RateLimiter - Per-client rate limiting with sliding window
 */
class RateLimiter {
    constructor(options) {
        this.options = {
            maxPerMinute: (options && options.maxPerMinute) || 60,
            maxPerHour: (options && options.maxPerHour) || 3600,
            windowMs: (options && options.windowMs) || 60000
        };
        this._requests = new Map();
        this._startTime = Date.now();
        this._lastCleanup = Date.now();
    }

    async check(clientId, operation) {
        this._maybeCleanup();
        
        var now = Date.now();
        var windowStart = now - this.options.windowMs;

        var requests = this._requests.get(clientId) || [];

        requests = requests.filter(function(t) { return t > windowStart; });

        if (requests.length >= this.options.maxPerMinute) {
            return false;
        }

        requests.push(now);
        this._requests.set(clientId, requests);

        return true;
    }

    _maybeCleanup() {
        var now = Date.now();
        if (now - this._lastCleanup > 60000) {
            this._lastCleanup = now;
            var windowStart = now - this.options.windowMs;
            var self = this;
            this._requests.forEach(function(requests, clientId) {
                var filtered = requests.filter(function(t) { return t > windowStart; });
                if (filtered.length === 0) {
                    self._requests.delete(clientId);
                } else {
                    self._requests.set(clientId, filtered);
                }
            });
        }
    }

    reset(clientId) {
        this._requests.delete(clientId);
    }

    getStatus() {
        return {
            name: 'RateLimiter',
            type: 'rate-limiting',
            enabled: true,
            config: this.options,
            state: {
                uniqueClients: this._requests.size,
                uptime: Date.now() - this._startTime
            }
        };
    }
}

/**
 * CircuitBreaker - Circuit breaker pattern
 */
class CircuitBreaker {
    constructor(options) {
        this.options = {
            threshold: (options && options.threshold) || 5,
            timeout: (options && options.timeout) || 60000
        };
        this._failures = 0;
        this._state = 'CLOSED';
        this._lastFailure = 0;
        this._startTime = Date.now();
    }

    async execute(fn) {
        if (this._state === 'OPEN') {
            if (Date.now() - this._lastFailure > this.options.timeout) {
                this._state = 'CLOSED';
            } else {
                throw new Error('Circuit OPEN - service unavailable');
            }
        }

        try {
            var result = await fn();
            this._failures = 0;
            this._state = 'CLOSED';
            return result;
        } catch (e) {
            this._failures++;
            this._lastFailure = Date.now();
            if (this._failures >= this.options.threshold) {
                this._state = 'OPEN';
            }
            throw e;
        }
    }

    getState() {
        return this._state;
    }

    getStatus() {
        return {
            name: 'CircuitBreaker',
            type: 'circuit-breaker',
            enabled: true,
            config: this.options,
            state: {
                state: this._state,
                failures: this._failures,
                uptime: Date.now() - this._startTime
            }
        };
    }
}

/**
 * Bulkhead - Concurrency isolation
 */
class Bulkhead {
    constructor(options) {
        this.options = {
            concurrency: (options && options.concurrency) || 10
        };
        this._running = 0;
        this._queue = [];
        this._startTime = Date.now();
    }

    async run(fn) {
        if (this._running >= this.options.concurrency) {
            return new Promise(function(resolve, reject) {
                this._queue.push({ fn: fn, resolve: resolve, reject: reject });
            }.bind(this));
        }

        this._running++;
        try {
            var result = await fn();
            return result;
        } finally {
            this._running--;
            if (this._queue.length > 0) {
                var next = this._queue.shift();
                this._running++;
                try {
                    var r = await next.fn();
                    next.resolve(r);
                } catch (e) {
                    next.reject(e);
                }
            }
        }
    }

    isFull() {
        return this._running >= this.options.concurrency;
    }

    getStatus() {
        return {
            name: 'Bulkhead',
            type: 'concurrency',
            enabled: true,
            config: this.options,
            state: {
                running: this._running,
                queued: this._queue.length,
                uptime: Date.now() - this._startTime
            }
        };
    }
}

/**
 * QoS - Unified Quality of Service
 */
class QoS {
    constructor(options) {
        this._rateLimiter = new RateLimiter(options);
        this._circuitBreaker = new CircuitBreaker(options);
        this._bulkhead = new Bulkhead(options);
        this._startTime = Date.now();
    }

    async check(clientId, operation) {
        var rateAllowed = await this._rateLimiter.check(clientId, operation);
        if (!rateAllowed) {
            throw new Error('Rate limited');
        }

        if (this._bulkhead.isFull()) {
            throw new Error('Too many concurrent requests');
        }

        return true;
    }

    async execute(fn) {
        return this._bulkhead.run(function() {
            return this._circuitBreaker.execute(fn);
        }.bind(this));
    }

    getLayerStatus() {
        return {
            name: 'QoS',
            type: 'quality-of-service',
            enabled: true,
            layers: [
                this._rateLimiter.getStatus(),
                this._circuitBreaker.getStatus(),
                this._bulkhead.getStatus()
            ]
        };
    }

    getRateLimiterStatus() {
        return this._rateLimiter.getStatus();
    }

    getCircuitBreakerStatus() {
        return this._circuitBreaker.getStatus();
    }

    getBulkheadStatus() {
        return this._bulkhead.getStatus();
    }

    isOperationAllowed(op) {
        return { allowed: true, layer: 'QoS' };
    }

    getStatus() {
        return { enabled: true };
    }
}

module.exports = { QoS: QoS, RateLimiter: RateLimiter, CircuitBreaker: CircuitBreaker, Bulkhead: Bulkhead };

// Add aliases to QoS for backward compat
QoS.prototype.resetRateLimiter = function(clientId) { return this._rateLimiter.reset(clientId); };
QoS.prototype.getRateLimiterStatus = function() { return this._rateLimiter.getStatus(); };
QoS.prototype.getCircuitBreakerStatus = function() { return this._circuitBreaker.getStatus(); };
QoS.prototype.reset = function(clientId) { return this._rateLimiter.reset(clientId); };
QoS.prototype.getBulkheadStatus = function() { return this._bulkhead.getStatus(); };
module.exports.RateLimit = RateLimiter;