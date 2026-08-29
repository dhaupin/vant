/**
 * Vant Network Layer (v0.8.6)
 * Handles network connectivity, retries, timeouts, and latency
 * WITH EVENT EMISSIONS - connection lifecycle emits globally
 *
 * Features:
 * - Online/offline detection
 * - Latency measurement
 * - Retry with exponential backoff
 * - Request timeouts
 * - Circuit breaker (via QoS)
 * - HTTP connection pooling
 * - Response caching
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const dns = require('dns');
// v0.9.0-axolotl T13b: network owns its own Cache instance. The
// defaultCache singleton is gone; consumers must instantiate.
const { Cache } = require('./cache');
const cache = new Cache();
const config = require('./config');

// Lazy load CircuitBreaker to avoid circular dependency
let _circuitBreaker = null;
function _getCircuitBreaker() {
    if (!_circuitBreaker) {
        const { CircuitBreaker } = require('./qos');
        _circuitBreaker = CircuitBreaker;
    }
    return _circuitBreaker;
}

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

// Lazy load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

// ==================== CONFIG ====================
const CONFIG = {
    DEFAULT_TIMEOUT_MS: 30000,
    DEFAULT_RETRIES: 3,
    DEFAULT_BACKOFF_MS: 1000,
    MAX_BACKOFF_MS: 30000,
    LATENCY_SAMPLE_SIZE: 3,
    ONLINE_CHECK_URL: 'https://www.google.com',
    ONLINE_CHECK_TIMEOUT: 5000,
    POOL_SIZE: config.get('network.poolSize') || 5,
    CACHE_TTL: config.get('network.cacheTTL') || 60000,  // 1 minute default
    CIRCUIT_THRESHOLD: config.get('network.circuitThreshold') || 3,
    CIRCUIT_TIMEOUT: config.get('network.circuitTimeout') || 30000,

    // Domain whitelist
    allowedDomains: config.get('network.allowedDomains') || [],
    blockExternal: config.get('network.blockExternal') === true  // Default: false (allow)
};

// ==================== DOMAIN WHITELIST ====================

// Block internal/private IPs (SSRF protection)
const INTERNAL_IP_PATTERNS = [
    /^127\.\d+\.\d+\.\d+$/,                        // 127.0.0.0/8 (localhost)
    /^169\.254\.\d+\.\d+$/,                       // 169.254.0.0/16 (link-local, AWS metadata)
    /^10\.\d+\.\d+\.\d+$/,                       // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,       // 172.16.0.0/12
    /^192\.168\.\d+\.\d+$/,                     // 192.168.0.0/16
    /^0\.\d+\.\d+\.\d+$/,                        // 0.0.0.0/8
    /^224\.\d+\.\d+\.\d+$/,                      // 224.0.0.0/4 (multicast)
    /^::1$/,                                    // IPv6 localhost
    /^::$/,                                     // IPv6 any
    /^[0:]+:[0:]+$/,                            // IPv6 collapsed
    /^fe80:/i,                                 // IPv6 link-local
    /^fc00:/i,                                 // IPv6 unique local
    /^fd00:/i                                  // IPv6 unique local
];

function isInternalIP(hostname) {
    // Strip IPv6 brackets if present: [::1] -> ::1
    const cleaned = hostname.replace(/^\[|\]$/g, '');
    return INTERNAL_IP_PATTERNS.some(pattern => pattern.test(cleaned));
}

// DNS rebinding protection: resolve hostname and verify IP before request
async function resolveAndCheckIP(hostname) {
    return new Promise((resolve) => {
        dns.resolve4(hostname, (err, addresses) => {
            if (err || !addresses || addresses.length === 0) {
                resolve(null); // Allow - DNS failure is not a security issue
                return;
            }
            // Check all resolved IPs
            for (const ip of addresses) {
                if (isInternalIP(ip)) {
                    resolve({ blocked: true, ip });
                    return;
                }
            }
            resolve({ blocked: false, addresses });
        });
    });
}

function isDomainAllowed(url) {
    try {
        const hostname = new URL(url).hostname;

        // SSRF: Block internal IPs unless explicitly whitelisted
        if (isInternalIP(hostname)) {
            return CONFIG.allowedDomains.includes(hostname);
        }

        // Allow all if no blockExternal and no whitelist
        if (!CONFIG.blockExternal && !CONFIG.allowedDomains.length) {
            return true;
        }

        // Check whitelist
        return CONFIG.allowedDomains.some(d =>
            hostname === d || hostname.endsWith('.' + d)
        );
    } catch(e) {
        return false;
    }
}

function setAllowedDomains(domains) {
    CONFIG.allowedDomains = domains;
}

function getAllowedDomains() {
    return [...CONFIG.allowedDomains];
}

// ==================== HTTP AGENTS (Connection Pool) ====================
const _httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: CONFIG.POOL_SIZE,
    maxFreeSockets: 2
});

const _httpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: CONFIG.POOL_SIZE,
    maxFreeSockets: 2
});

// ==================== NETWORK CACHE ====================
const _networkCache = {
    name: 'network',
    enabled: config.get('network.cache') !== false,
    ttl: CONFIG.CACHE_TTL
};

// ==================== CIRCUIT BREAKER ====================
// Lazy init CircuitBreaker to avoid circular dependency at module load
let _externalCircuit = null;
function _getExternalCircuit() {
    if (!_externalCircuit) {
        const CircuitBreaker = _getCircuitBreaker();
        _externalCircuit = new CircuitBreaker({
            mode: 'full',
            file: '.circuit-network.json',
            threshold: CONFIG.CIRCUIT_THRESHOLD,
            backoff: { base: CONFIG.DEFAULT_BACKOFF_MS, max: 30000, multiplier: 2 },
            autoRetry: true
        });
    }
    return _externalCircuit;
}

// ==================== STATE ====================
let _isOnline = true;
let _lastOnlineCheck = 0;
let _latencyHistory = [];
let _startTime = Date.now();

// ==================== CONNECTIVITY ====================
function isOnline() {
    return _isOnline;
}

function setOnline(status) {
    _isOnline = status;
    _lastOnlineCheck = Date.now();
}

// Check network connectivity
async function checkOnline() {
    _emit('network:checking', { timestamp: Date.now() });

    return new Promise((resolve) => {
        const url = CONFIG.ONLINE_CHECK_URL;
        const timeout = CONFIG.ONLINE_CHECK_TIMEOUT;

        // Parse URL to get correct transport
        const parsed = new URL(url);
        const transport = parsed.protocol === 'https:' ? https : http;

        // Request
        const req = transport.get(url, { timeout }, (res) => {
            _isOnline = res.statusCode < 400;
            _lastOnlineCheck = Date.now();

            // EVENT online/offline
            _emit(_isOnline ? 'network:online' : 'network:offline', { timestamp: Date.now() });

            resolve(_isOnline);
        });

        req.on('error', () => {
            _isOnline = false;
            _lastOnlineCheck = Date.now();

            // EVENT offline
            _emit('network:offline', { timestamp: Date.now() });

            resolve(false);
        });

        req.on('timeout', () => {
            req.destroy();
            _isOnline = false;
            _lastOnlineCheck = Date.now();

            // EVENT timeout → offline
            _emit('network:offline', { reason: 'timeout', timestamp: Date.now() });

            resolve(false);
        });
    });
}

// ==================== LATENCY ====================
function getLatency() {
    if (_latencyHistory.length === 0) return 0;
    const sorted = [..._latencyHistory].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function getLatencyStats() {
    if (_latencyHistory.length === 0) return { avg: null, min: null, max: null, samples: 0 };

    const sum = _latencyHistory.reduce((a, b) => a + b, 0);
    return {
        avg: Math.round(sum / _latencyHistory.length),
        min: Math.min(..._latencyHistory),
        max: Math.max(..._latencyHistory),
        samples: _latencyHistory.length
    };
}

// Measure latency to a URL
async function measureLatency(url, sampleSize = CONFIG.LATENCY_SAMPLE_SIZE) {
    const results = [];

    for (let i = 0; i < sampleSize; i++) {
        const start = Date.now();
        try {
            await fetch(url, { timeout: 10000 });
            results.push(Date.now() - start);
        } catch (e) {
            results.push(10000); // Timeout penalty
        }
    }

    const latency = Math.min(...results);
    _latencyHistory.push(latency);
    if (_latencyHistory.length > 100) _latencyHistory.shift();

    return latency;
}

// ==================== TIMING ====================
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function isExpired(timestamp, maxAgeMs) {
    return Date.now() - timestamp > maxAgeMs;
}

// ==================== RETRY ====================
async function retry(fn, options = {}) {
    const {
        retries = CONFIG.DEFAULT_RETRIES,
        backoff = CONFIG.DEFAULT_BACKOFF_MS,
        maxBackoff = CONFIG.MAX_BACKOFF_MS,
        onRetry = null
    } = options;

    let lastError;
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            if (i < retries) {
                const delay = Math.min(backoff * Math.pow(2, i), maxBackoff);
                if (onRetry) onRetry(i, lastError, delay);
                await sleep(delay);
            }
        }
    }
    throw lastError;
}

// ==================== TIMEOUT ====================
function withTimeout(promise, ms = CONFIG.DEFAULT_TIMEOUT_MS) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
    ]);
}
// Fetch with circuit breaker, connection pooling, and caching
async function fetch(url, options = {}) {
    const {
        method = 'GET',
        cache: useCache = true,
        circuit: useCircuit = true,
        timeout = CONFIG.DEFAULT_TIMEOUT_MS,
        headers = {},
        skipDomainCheck = false
    } = options;

    // Check sandbox capability gate (if sandbox has canNetwork: false, block)
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canNetwork')) {
        _emit('network:blocked', { url, reason: 'capability', timestamp: Date.now() });
        return Promise.reject(new Error('Network: capability not allowed - canNetwork is false'));
    }

    // Domain whitelist check
    if (!skipDomainCheck && !isDomainAllowed(url)) {
        _emit('network:blocked', { url, reason: 'domain', timestamp: Date.now() });
        return Promise.reject(new Error(`Network: domain not allowed - ${url}`));
    }

    // DNS rebinding protection - resolve and verify IP before request
    if (!skipDomainCheck) {
        try {
            const hostname = new URL(url).hostname;
            const ipCheck = await resolveAndCheckIP(hostname);
            if (ipCheck && ipCheck.blocked) {
                _emit('network:blocked', { url, reason: 'dns-rebinding', timestamp: Date.now() });
                return Promise.reject(new Error(`Network: DNS rebinding blocked - resolved to internal IP ${ipCheck.ip}`));
            }
        } catch (e) {
            // DNS resolution failed - allow, it's not a security issue
        }
    }

    // Check cache for GET requests
    if (method === 'GET' && _networkCache.enabled && useCache) {
        const cacheKey = 'net:' + url;
        const cached = cache.get(cacheKey);
        if (cached) {
            _emit('network:cache:hit', { url, timestamp: Date.now() });
            return Promise.resolve(cached);
        }
        _emit('network:cache:miss', { url, timestamp: Date.now() });
    }

    // EVENT: request:start
    _emit('network:request:start', { url, method, timestamp: Date.now() });

    // Build request with connection pool
    const doFetch = () => new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const transport = parsed.protocol === 'https:' ? https : http;
        const agent = parsed.protocol === 'https:' ? _httpsAgent : _httpAgent;

        const req = transport.request(url, { method, headers, timeout, agent }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetch(res.headers.location, options).then(resolve).catch(reject);
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    // Cache successful GET responses
                    if (method === 'GET' && _networkCache.enabled && useCache) {
                        const cacheKey = 'net:' + url;
                        cache.set(cacheKey, data, { ttl: _networkCache.ttl });
                    }

                    // EVENT: request:success
                    _emit('network:request:success', { url, method, status: res.statusCode, timestamp: Date.now() });

                    resolve(data);
                } else {
                    // EVENT: request:error
                    _emit('network:request:error', { url, method, status: res.statusCode, timestamp: Date.now() });

                    reject(new Error(`HTTP \${res.statusCode}`));
                }
            });
        });

        req.on('error', (err) => {
            // EVENT: request:error
            _emit('network:request:error', { url, method, error: err.message, timestamp: Date.now() });

            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();

            // EVENT: request:timeout
            _emit('network:request:timeout', { url, method, timeout, timestamp: Date.now() });

            reject(new Error('Request timeout'));
        });

        if (options.body) req.write(options.body);
        req.end();
    });

    // Use circuit breaker for external calls
    if (useCircuit) {
        return _getExternalCircuit().execute(doFetch);
    }

    return doFetch();
}

function fetchJson(url, options = {}) {
    return fetch(url, { ...options, headers: { ...options.headers, 'Content-Type': 'application/json' } })
        .then(data => {
            try { return JSON.parse(data); }
            catch { return data; }
        });
}

// ==================== FRAMEWORK ====================
function getLayerStatus() {
    return {
        name: 'Network',
        type: 'network',
        enabled: true,
        config: {
            allowedDomains: CONFIG.allowedDomains,
            blockExternal: CONFIG.blockExternal
        },
        state: {
            online: _isOnline,
            lastCheck: _lastOnlineCheck,
            latency: getLatency(),
            uptime: Date.now() - _startTime
        }
    };
}

function isOperationAllowed(op) {
    if (!_isOnline && (op === 'fetch' || op === 'sync')) {
        return { allowed: false, reason: 'offline' };
    }
    return { allowed: true };
}

function getStatus() {
    return {
        online: _isOnline,
        lastCheck: _lastOnlineCheck,
        latency: getLatencyStats(),
        uptime: Date.now() - _startTime
    };
}

function healthCheck() {
    return { status: _isOnline ? 'ok' : 'degraded', latency: getLatency() };
}

// ==================== CIRCUIT STATUS ====================
function getCircuitStatus() {
    return _getExternalCircuit().getStatus();
}


function clear() {
    _latencyHistory = [];
    _startTime = Date.now();
}

// ==================== EXPORTS ====================
module.exports = {
    // Config
    CONFIG,

    // Domain whitelist
    isDomainAllowed,
    setAllowedDomains,
    getAllowedDomains,

    // Connectivity
    isOnline,
    setOnline,
    checkOnline,

    // Latency
    getLatency,
    getLatencyStats,
    measureLatency,

    // Timing
    sleep,
    isExpired,

    // Retry
    retry,

    // Timeout
    withTimeout,

    // HTTP
    fetch,
    fetchJson,

    // Framework
    getLayerStatus,
    isOperationAllowed,
    getCircuitStatus,
    getStatus,
    healthCheck,
    clear,

    // Multibrain Stack
    getStackNetworkStatus
};

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get network status from all brains in the stack
 * @returns {Object} Combined network info
 */
function getStackNetworkStatus() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const status = getStatus();
            results.byBrain[brainName] = status;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}
