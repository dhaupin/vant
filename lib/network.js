/**
 * Vant Network Layer
 * Handles network connectivity, retries, timeouts, and latency
 * 
 * Features:
 * - Online/offline detection
 * - Latency measurement
 * - Retry with exponential backoff
 * - Request timeouts
 * - Circuit integration
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');

// ==================== CONFIG ====================
const CONFIG = {
    DEFAULT_TIMEOUT_MS: 30000,
    DEFAULT_RETRIES: 3,
    DEFAULT_BACKOFF_MS: 1000,
    MAX_BACKOFF_MS: 30000,
    LATENCY_SAMPLE_SIZE: 3,
    ONLINE_CHECK_URL: 'https://www.google.com',
    ONLINE_CHECK_TIMEOUT: 5000
};

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

// ==================== HTTP HELPERS ====================
function fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const { method = 'GET', timeout = CONFIG.DEFAULT_TIMEOUT_MS, headers = {} } = options;
        
        const parsed = new URL(url);
        const transport = parsed.protocol === 'https:' ? https : http;
        
        const req = transport.request(url, { method, headers, timeout }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Follow redirect
                fetch(res.headers.location, options).then(resolve).catch(reject);
                return;
            }
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
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

function clear() {
    _latencyHistory = [];
    _startTime = Date.now();
}

// ==================== EXPORTS ====================
module.exports = {
    // Config
    CONFIG,
    
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
    getStatus,
    healthCheck,
    clear
};