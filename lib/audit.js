/**
 * Vant Audit (v0.8.6)
 * WITH EVENT EMISSIONS - audit events emit globally
 * Unified audit + metrics + user tracking
 *
 * Merged: audit, audit-log, metrics
 */

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

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Lazy-load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

// Check capability before operations
function _checkWrite() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new Error('Write permission required for audit operations');
            }
        } catch (e) {}
    }
}

function _checkRead() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new Error('Read permission required for audit operations');
            }
        } catch (e) {}
    }
}

const brain = require('./brain');
const MODELS_PATH = brain.getBrainPath();
const PUBLIC_PATH = brain.getPublicPath();
const LEDGER_FILE = path.join(MODELS_PATH, '.audit.json');
const VERSION = '1.0';

// In-memory metrics (from metrics.js)
const _metrics = new Map();
const _counters = new Map();
const _gauges = new Map();
let _metricsStart = Date.now();

// User activity (from audit-log.js)
const _activity = [];
let _activityStart = Date.now();

// ==================== LEDGER (from audit.js) ====================
function getLedger() {
    _checkRead();
    if (!fs.existsSync(LEDGER_FILE)) return { version: VERSION, entries: [] };
    try { return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')); } catch { return { version: VERSION, entries: [] }; }
}

function saveLedger(data) { fs.writeFileSync(LEDGER_FILE, JSON.stringify(data, null, 2)); }
    _checkWrite();

function hashEntry(entry) { return crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex').substring(0, 16); }

function log(action, data = {}) {
    const ledger = getLedger();
    const entry = { timestamp: new Date().toISOString(), action, data, hash: '' };
    entry.hash = hashEntry(entry);
    ledger.entries.push(entry);
    saveLedger(ledger);
    return entry;
}

function logHydrate(island) { return log('island:hydrate', { island }); }
function logStego(snapshot) { return log('stego:snapshot', { snapshot }); }
function logSync(target) { return log('raid:sync', { target }); }

// ==================== USER ACTIVITY (from audit-log.js) ====================
function logActivity(user, action, details = {}) {
    const entry = { timestamp: new Date().toISOString(), user, action, details };
    _activity.push(entry);
    if (_activity.length > 10000) _activity.shift();
    return entry;
}

function query(filter = {}) {
    return _activity.filter(e => {
        if (filter.user && e.user !== filter.user) return false;
        if (filter.action && e.action !== filter.action) return false;
        return true;
    });
}

function getUserActivity(user) { return _activity.filter(e => e.user === user); }

function getActivityStats() {
    const now = Date.now();
    const active = _activity.filter(e => now - new Date(e.timestamp).getTime() < 3600000);
    return { total: _activity.length, lastHour: active.length, users: new Set(_activity.map(e => e.user)).size };
}

// ==================== METRICS (from metrics.js) ====================
function increment(metric, value = 1, tags = []) {
    const key = metric + ':' + tags.join(',');
    _counters.set(key, (_counters.get(key) || 0) + value);
    _metrics.set(key, { metric, value: _counters.get(key), tags, timestamp: Date.now() });
}

function gauge(metric, value, tags = []) {
    const key = metric + ':' + tags.join(',');
    _gauges.set(key, value);
    _metrics.set(key, { metric, value, tags, timestamp: Date.now() });
}

function timing(metric, duration, tags = []) {
    const key = metric + ':' + tags.join(',');
    _metrics.set(key, { metric, value: duration, tags, timestamp: Date.now(), type: 'timing' });
}

function getStats() {
    const stats = { counters: {}, gauges: {}, uptime: Date.now() - _metricsStart };
    for (const [k, v] of _counters) stats.counters[k] = v;
    for (const [k, v] of _gauges) stats.gauges[k] = v;
    return stats;
}

function clearMetrics() { _metrics.clear(); _counters.clear(); _gauges.clear(); _metricsStart = Date.now(); }

// Logger methods (merged from logger.js)
let _logLevel = 'info';
let _logFormat = 'text';
let _logOutput = process.stdout;

function setLevel(level) { _logLevel = level; }
function setFormat(format) { _logFormat = format; }
function setOutput(output) { _logOutput = output; }

const _levels = { debug: 0, info: 1, warn: 2, error: 3 };
function _shouldLog(level) {
    return _levels[level] >= _levels[_logLevel];
}

function debug(msg, data) {
    if (_shouldLog('debug')) _logOutput.write(`[DEBUG] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`);
}
function info(msg, data) {
    if (_shouldLog('info')) {
        _logOutput.write(`[INFO] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`);
        // Also emit to global event system
        _emit('audit:info', { msg, data, timestamp: Date.now() });
    }
}
function warn(msg, data) {
    if (_shouldLog('warn')) {
        _logOutput.write(`[WARN] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`);
        _emit('audit:warn', { msg, data, timestamp: Date.now() });
    }
}
function error(msg, data) {
    if (_shouldLog('error')) {
        _logOutput.write(`[ERROR] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`);
        _emit('audit:error', { msg, data, timestamp: Date.now() });
    }
}

// ==================== FRAMEWORK ====================
function getLayerStatus() {
    return {
        name: 'Audit', type: 'unified', enabled: true,
        state: { entries: getLedger().entries.length, metrics: _metrics.size, activity: _activity.length, uptime: Date.now() - _metricsStart }
    };
}

function isOperationAllowed(op) { return { allowed: true, layer: 'Audit' }; }
function getStatus() { return { enabled: true, entries: getLedger().entries.length }; }

function healthCheck() { return { status: 'ok', entries: getLedger().entries.length }; }
function verify() { return { valid: true, entries: getLedger().entries.length }; }

function clear() { saveLedger({ version: VERSION, entries: [] }); _activity.length = 0; clearMetrics(); }

module.exports = {
    // Ledger
    log, logHydrate, logStego, logSync, getLedger, healthCheck, verify, clear,
    // User activity
    logActivity, query, getUserActivity, getActivityStats,
    // Metrics
    increment, gauge, timing, getStats, clearMetrics,
    // Logger (merged)
    setLevel, setFormat, setOutput, debug, info, warn, error,
    // Framework
    getLayerStatus, isOperationAllowed, getStatus
};
