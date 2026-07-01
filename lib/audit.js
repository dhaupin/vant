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
const errors = require('./error');

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
                throw new errors.Error('Write permission required for audit operations', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

function _checkRead() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new errors.Error('Read permission required for audit operations', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

// Lazy-load brain to avoid circular dependency: audit → brain → ... → event → audit
let _brain = null;
function _getBrain() {
    if (!_brain) {
        _brain = require('./brain');
    }
    return _brain;
}

// Lazy path resolution - only called when actually needed
function _getModelsPath() {
    return _getBrain().getBrainPath();
}
function _getPublicPath() {
    return _getBrain().getPublicPath();
}
function _getLedgerFile() {
    return path.join(_getModelsPath(), '.audit.json');
}

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
    const ledgerFile = _getLedgerFile();
    if (!fs.existsSync(ledgerFile)) return { version: VERSION, entries: [] };
    try { return JSON.parse(fs.readFileSync(ledgerFile, 'utf8')); } catch { return { version: VERSION, entries: [] }; }
}

function saveLedger(data) { 
    _checkWrite();
    fs.writeFileSync(_getLedgerFile(), JSON.stringify(data, null, 2)); 
}

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

// ==================== NEW: SEARCH + BATCH + ROTATE ====================

/**
 * Search audit entries
 * @param {object} filter - { action?, start?, end?, limit? }
 */
function search(filter = {}) {
    const ledger = getLedger();
    let entries = ledger.entries || [];
    
    if (filter.action) {
        entries = entries.filter(e => e.action === filter.action);
    }
    if (filter.start) {
        entries = entries.filter(e => new Date(e.timestamp) >= new Date(filter.start));
    }
    if (filter.end) {
        entries = entries.filter(e => new Date(e.timestamp) <= new Date(filter.end));
    }
    if (filter.limit) {
        entries = entries.slice(-filter.limit);
    }
    
    return entries.reverse();
}

/**
 * Batch log multiple entries
 * @param {array} entries - [{ action, data }]
 */
function batch(entries) {
    const ledger = getLedger();
    for (const e of entries) {
        const entry = { 
            timestamp: new Date().toISOString(), 
            action: e.action, 
            data: e.data || {}, 
            hash: '' 
        };
        entry.hash = hashEntry(entry);
        ledger.entries.push(entry);
    }
    saveLedger(ledger);
    
    _emit('audit:batch', { count: entries.length, timestamp: Date.now() });
    return entries.length;
}

/**
 * Rotate audit logs (archive old and start fresh)
 * @param {number} maxEntries - Keep last N entries
 * @param {string} archiveDir - Directory for archives
 */
function rotate(maxEntries = 10000, archiveDir = null) {
    const ledger = getLedger();
    const entries = ledger.entries || [];
    
    if (entries.length <= maxEntries) {
        return { rotated: 0 };
    }
    
    const keep = entries.slice(-maxEntries);
    const archive = entries.slice(0, entries.length - maxEntries);
    
    // Archive old entries
    if (archiveDir) {
        const archiveFile = path.join(archiveDir, `audit-${Date.now()}.json`);
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
        }
        fs.writeFileSync(archiveFile, JSON.stringify(archive, null, 2));
    }
    
    // Keep recent entries
    ledger.entries = keep;
    saveLedger(ledger);
    
    _emit('audit:rotated', { archived: archive.length, kept: keep.length, timestamp: Date.now() });
    
    return { archived: archive.length, kept: keep.length };
}

/**
 * Get aggregates for metrics
 */
function getAggregates(metricPrefix = null) {
    const stats = {};
    
    for (const [key, val] of _counters) {
        if (!metricPrefix || key.startsWith(metricPrefix)) {
            stats[key] = { type: 'counter', value: val };
        }
    }
    for (const [key, val] of _gauges) {
        if (!metricPrefix || key.startsWith(metricPrefix)) {
            stats[key] = { type: 'gauge', value: val };
        }
    }
    
    return stats;
}

module.exports = {
    // Ledger
    log, logHydrate, logStego, logSync, getLedger, healthCheck, verify, clear,
    // User activity
    logActivity, query, getUserActivity, getActivityStats,
    // Metrics
    increment, gauge, timing, getStats, getAggregates, clearMetrics,
    // Logger (merged)
    setLevel, setFormat, setOutput, debug, info, warn, error,
    // New
    search, batch, rotate,
    // Framework
    getLayerStatus, isOperationAllowed, getStatus
};
