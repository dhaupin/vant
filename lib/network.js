/**
 * Vant Network Layer
 * Handles network connectivity, retries, timeouts, and latency
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
const { CircuitBreaker } = require('./qos');
const cache = require('./cache');
const config = require('./config');

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
    blockExternal: config.get('network.blockExternal') !== false
};

// ==================== DOMAIN WHITELIST ====================
function isDomainAllowed(url) {
    // No restrictions if whitelist empty and blockExternal disabled
    if (!CONFIG.allowedDomains.length && !CONFIG.blockExternal) {
        return true;
    }
    
    try {
        const hostname = new URL(url).hostname;
        
        // Check exact match or subdomain match
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
// Use qos CircuitBreaker full mode - survives restarts, exponential backoff
const _externalCircuit = new CircuitBreaker({
    mode: 'full',
    file: '.network-circuit.json',
    threshold: CONFIG.CIRCUIT_THRESHOLD,
    backoff: { base: CONFIG.DEFAULT_BACKOFF_MS, max: 30000, multiplier: 2 },
    autoRetry: true
});

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
    return new Promise((resolve) => {
        const url = CONFIG.ONLINE_CHECK_URL;
        const timeout = CONFIG.ONLINE_CHECK_TIMEOUT;
        
        // Simple HEAD request
        const req = http.get(url + '/', { timeout }, (res) => {
            _isOnline = res.statusCode < 400;
            _lastOnlineCheck = Date.now();
            resolve(_isOnline);
        });
        
        req.on('error', () => {
            _isOnline = false;
            _lastOnlineCheck = Date.now();
            resolve(false);
        });
        
        req.on('timeout', () => {
            req.destroy();
            _isOnline = false;
            _lastOnlineCheck = Date.now();
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
function fetch(url, options = {}) {
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
        return Promise.reject(new Error('Network: capability not allowed - canNetwork is false'));
    }
    
    // Domain whitelist check
    if (!skipDomainCheck && !isDomainAllowed(url)) {
        return Promise.reject(new Error(`Network: domain not allowed - ${url}`));
    }
    
    // Check cache for GET requests
    if (method === 'GET' && _networkCache.enabled && useCache) {
        const cacheKey = 'net:' + url;
        const cached = cache.get(cacheKey);
        if (cached) return Promise.resolve(cached);
    }

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
                    resolve(data);
                } else {
                    reject(new Error(`HTTP \${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) req.write(options.body);
        req.end();
    });

    // Use circuit breaker for external calls
    if (useCircuit) {
        return _externalCircuit.execute(doFetch);
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
    return _externalCircuit.getStatus();
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
    clear
};