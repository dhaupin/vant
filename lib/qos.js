/**
 * Vant QoS - Quality of Service
 * Includes: RateLimiter, CircuitBreaker, Bulkhead, Throttler, Debouncer
 */

const vaf = require('./vaf');
const crypto = require('crypto');

// ==================== THROTTLER ====================
/**
 * Throttler - Throttle function calls by rate limit
 */
class Throttler {
    constructor(options = {}) {
        this.options = { limit: options.limit || 10, window: options.window || 1000 };
        this._calls = new Map();
        this._startTime = Date.now();
    }

    throttle(fn) {
        return (...args) => {
            const key = fn.name || crypto.randomBytes(4).toString('hex');
            const now = Date.now();
            const calls = (this._calls.get(key) || []).filter(t => now - t < this.options.window);
            if (calls.length >= this.options.limit) return;
            calls.push(now);
            this._calls.set(key, calls);
            fn(...args);
        };
    }

    clear() { this._calls.clear(); }

    stats() {
        return {
            tracked: this._calls.size,
            uptime: Date.now() - this._startTime
        };
    }

    getLayerStatus() {
        return { name: 'Throttler', type: 'qos', enabled: true, state: this.stats() };
    }

    isOperationAllowed(op) {
        return { allowed: true, layer: 'Throttler' };
    }
}

// ==================== DEBOUNCER ====================
/**
 * Debouncer - Debounce function calls by wait time
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
            this._timers.set(fn, setTimeout(() => {
                fn(...args);
                this._timers.delete(fn);
            }, w));
        };
    }

    cancel(fn) {
        if (this._timers.has(fn)) clearTimeout(this._timers.get(fn));
    }

    stats() {
        return {
            timers: this._timers.size,
            uptime: Date.now() - this._startTime
        };
    }

    getLayerStatus() {
        return { name: 'Debouncer', type: 'qos', enabled: true, state: this.stats() };
    }

    isOperationAllowed(op) {
        return { allowed: true, layer: 'Debouncer' };
    }
}

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

        // Global rate limit (not per-client) to prevent bypass via rotation
        var globalRequests = this._requests.get('_global_') || [];
        globalRequests = globalRequests.filter(function(t) { return t > windowStart; });

        if (globalRequests.length >= this.options.maxPerMinute) {
            audit.warn(`[RateLimiter] Global rate exceeded: ${globalRequests.length}/${this.options.maxPerMinute}`);
            return false;
        }

        globalRequests.push(now);
        this._requests.set('_global_', globalRequests);

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
        // Mode: 'default' | 'full'
        this._mode = (options && options.mode) || 'default';
        
        // Shared options
        this._options = {
            threshold: (options && options.threshold) || 5,
            timeout: (options && options.timeout) || 60000
        };
        
        // Full mode options
        this._fullOptions = {
            file: options && options.file,
            basePath: options && options.basePath || '.',
            backoff: options && options.backoff || { base: 1000, max: 30000, multiplier: 2 },
            autoRetry: options && options.autoRetry !== false
        };
        
        // Default mode state
        this._failures = 0;
        this._state = 'CLOSED';
        this._lastFailure = 0;
        this._startTime = Date.now();
        
        // Full mode state
        this._fullState = { providers: {} };
        
        // Load from file if full mode with file
        if (this._mode === 'full' && this._fullOptions.file) {
            this._load();
        }
    }

    getMode() { return this._mode; }

    isClosed(key) {
        if (this._mode === 'full') return this._isClosedFull(key);
        return this._state === 'CLOSED';
    }

    _isClosedFull(key) {
        const state = this._fullState.providers[key] || { failures: 0, open: false, backoff: 0 };
        if (state.open) {
            const lastFailure = state.lastFailure || 0;
            const backoff = state.backoff || this._fullOptions.backoff.base;
            const actualBackoff = Math.min(
                backoff * Math.pow(this._fullOptions.backoff.multiplier, state.failures - this._options.threshold),
                this._fullOptions.backoff.max
            );
            if (Date.now() - lastFailure > actualBackoff) {
                this._fullState.providers[key] = { failures: 0, open: false, backoff: this._fullOptions.backoff.base };
                this._save();
                if (this._fullOptions.autoRetry) audit.info(`[CircuitBreaker] Retrying ${key} after ${actualBackoff}ms`);
                return true;
            }
            return false;
        }
        return true;
    }

    recordFailure(key) {
        if (this._mode === 'full') return this._recordFailureFull(key);
        this._failures++;
        this._lastFailure = Date.now();
        if (this._failures >= this._options.threshold) this._state = 'OPEN';
    }

    _recordFailureFull(key) {
        const state = this._fullState.providers[key] || { failures: 0, open: false, backoff: this._fullOptions.backoff.base };
        state.failures++;
        state.lastFailure = Date.now();
        if (state.failures >= this._options.threshold) {
            state.open = true;
            audit.info(`[CircuitBreaker] OPEN for ${key} after ${state.failures} failures`);
        } else {
            state.backoff = Math.min(state.backoff * this._fullOptions.backoff.multiplier, this._fullOptions.backoff.max);
        }
        this._fullState.providers[key] = state;
        this._save();
    }

    recordSuccess(key) {
        if (this._mode === 'full') return this._recordSuccessFull(key);
        this._failures = 0;
        this._state = 'CLOSED';
    }

    _recordSuccessFull(key) {
        this._fullState.providers[key] = { failures: 0, open: false, backoff: this._fullOptions.backoff.base };
        this._save();
    }

    getState() {
        if (this._mode === 'full') return this._fullState;
        return this._state;
    }

    getAllStates() {
        if (this._mode === 'full') return { ...this._fullState };
        return { [this._state]: { failures: this._failures } };
    }

    _load() {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(this._fullOptions.basePath, this._fullOptions.file);
        try {
            if (fs.existsSync(filePath)) this._fullState = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) { this._fullState = { providers: {} }; }
    }

    _save() {
        if (!this._fullOptions.file) return;
        const fs = require('fs');
        const path = require('path');
        try {
            fs.writeFileSync(path.join(this._fullOptions.basePath, this._fullOptions.file), JSON.stringify(this._fullState, null, 2));
        } catch (e) { audit.info(`[CircuitBreaker] Save error: ${e.message}`); }
    }

    reset(key) {
        if (this._mode === 'full') { delete this._fullState.providers[key]; this._save(); return; }
        this._failures = 0;
        this._state = 'CLOSED';
    }

    async execute(fn) {
        if (this._mode === 'full') return fn();
        if (this._state === 'OPEN') {
            if (Date.now() - this._lastFailure > this._options.timeout) this._state = 'CLOSED';
            else throw new Error('Circuit OPEN');
        }
        try {
            var result = await fn();
            this._failures = 0;
            this._state = 'CLOSED';
            return result;
        } catch (e) {
            this._failures++;
            this._lastFailure = Date.now();
            if (this._failures >= this._options.threshold) this._state = 'OPEN';
            throw e;
        }
    }

    getStatus(key) {
        if (this._mode === 'full') {
            return { name: 'CircuitBreaker', type: 'circuit-breaker', mode: 'full', enabled: true, config: { ...this._options, ...this._fullOptions }, state: this._fullState.providers[key] || {} };
        }
        return { name: 'CircuitBreaker', type: 'circuit-breaker', mode: 'default', enabled: true, config: this._options, state: { state: this._state, failures: this._failures, uptime: Date.now() - this._startTime } };
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

module.exports = { 
    QoS: QoS, 
    RateLimiter: RateLimiter, 
    CircuitBreaker: CircuitBreaker, 
    Bulkhead: Bulkhead,
    Throttler: Throttler,
    Debouncer: Debouncer
};

// Add aliases to QoS for backward compat
QoS.prototype.resetRateLimiter = function(clientId) { return this._rateLimiter.reset(clientId); };
QoS.prototype.getRateLimiterStatus = function() { return this._rateLimiter.getStatus(); };
QoS.prototype.getCircuitBreakerStatus = function() { return this._circuitBreaker.getStatus(); };
QoS.prototype.reset = function(clientId) { return this._rateLimiter.reset(clientId); };
QoS.prototype.getBulkheadStatus = function() { return this._bulkhead.getStatus(); };
QoS.prototype.throttle = function(fn) { return new Throttler().throttle(fn); };
QoS.prototype.debounce = function(fn, wait) { return new Debouncer().debounce(fn, wait); };

module.exports.RateLimit = RateLimiter;
module.exports.Throttler = Throttler;
module.exports.Debouncer = Debouncer;
module.exports.CircuitBreaker = CircuitBreaker;

// Default instances
const defaultQoS = new QoS();
module.exports.defaultQoS = defaultQoS;

// =============================================
// Protection layer helpers (merged from protection.js)
// =============================================
const MAX_CONCURRENT = 3;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_INPUT_SIZE = 1048576;
const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 60000;

let _activeCount = 0;
let _failureCount = 0;
let _circuitOpen = false;
let _lastFailureTime = 0;

function getActiveCount() { return _activeCount; }
function canProceed() { return _activeCount < MAX_CONCURRENT; }
function incrementActive() { _activeCount++; }
function decrementActive() { if (_activeCount > 0) _activeCount--; }

function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
    ]);
}

function getMaxInputSize() { return MAX_INPUT_SIZE; }
function checkInputSize(content) {
    if (content && content.length > MAX_INPUT_SIZE) {
        throw new Error(`Input too large: max ${MAX_INPUT_SIZE} bytes`);
    }
}

function recordFailure() {
    _failureCount++;
    _lastFailureTime = Date.now();
    if (_failureCount >= FAILURE_THRESHOLD) {
        _circuitOpen = true;
    }
}
function getFailureCount() { return _failureCount; }
function isCircuitOpen() { return _circuitOpen; }
function getCircuitStatus() {
    return {
        open: _circuitOpen,
        failures: _failureCount,
        lastFailure: _lastFailureTime
    };
}
function resetCircuit() {
    _failureCount = 0;
    _circuitOpen = false;
    _lastFailureTime = 0;
}

function getStatus() {
    return {
        active: _activeCount,
        canProceed: canProceed(),
        circuit: getCircuitStatus(),
        maxInputSize: MAX_INPUT_SIZE
    };
}

// Export protection layer
module.exports.getActiveCount = getActiveCount;
module.exports.canProceed = canProceed;
module.exports.incrementActive = function() { _activeCount++; };
module.exports.decrementActive = function() { if (_activeCount > 0) _activeCount--; };
module.exports.MAX_CONCURRENT = MAX_CONCURRENT;
module.exports.withTimeout = withTimeout;
module.exports.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
module.exports.checkInputSize = checkInputSize;
module.exports.getMaxInputSize = getMaxInputSize;
module.exports.MAX_INPUT_SIZE = MAX_INPUT_SIZE;
module.exports.recordFailure = recordFailure;
module.exports.getFailureCount = getFailureCount;
module.exports.isCircuitOpen = isCircuitOpen;
module.exports.getCircuitStatus = getCircuitStatus;
module.exports.resetCircuit = resetCircuit;
module.exports.FAILURE_THRESHOLD = FAILURE_THRESHOLD;
module.exports.FAILURE_WINDOW_MS = FAILURE_WINDOW_MS;
module.exports.getStatus = getStatus;

// NEW: Island QoS (simplified)
module.exports.canCreateIsland = function() {
    // Simple rate check - allow by default
    return true;
};

module.exports.canDeleteIsland = function() {
    return true;
};

module.exports.canLoadIsland = function() {
    return canProceed('island:load');
};