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

// Ledger I/O routes through the shared models FileStorage (containment /
// symlink / VAF / atomic-write). The ledger lives under the CURRENT brain path
// (_getModelsPath() resolves per call), so stores are keyed by basePath and
// cache-invalidate when the stack position changes (pushBrain).
const _metrics = new Map();
const _counters = new Map();
const _gauges = new Map();
let _metricsStart = Date.now();

const _auditModelRoot = path.resolve(__dirname, '..', 'models');
let _auditStores = new Map();
function _getLedgerStore() {
    const brainPath = path.resolve(_getModelsPath());
    if (!_auditStores.has(brainPath)) {
        const Storage = require('./storage');
        _auditStores.set(brainPath, new Storage.FileStorage({ basePath: _auditModelRoot }));
    }
    return _auditStores.get(brainPath);
}
function _ledgerRel() {
    return path.relative(_auditModelRoot, _getLedgerFile());
}

// User activity (from audit-log.js)
const _activity = [];
let _activityStart = Date.now();

// ==================== LEDGER (from audit.js) ====================
function getLedger() {
    _checkRead();
    // (storage migration: read() returns null when missing - same contract as
    // the old existsSync check)
    const content = _getLedgerStore().read(_ledgerRel());
    if (!content) return { version: VERSION, entries: [] };
    try { return JSON.parse(content); } catch { return { version: VERSION, entries: [] }; }
}

function saveLedger(data) {
    _checkWrite();
    _getLedgerStore().write(_ledgerRel(), JSON.stringify(data, null, 2));
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

function query(filter = {}, userCtx) {
    if (userCtx) _checkRead(userCtx, '_audit:query');

    return _activity.filter(e => {
        if (filter.user && e.user !== filter.user) return false;
        if (filter.action && e.action !== filter.action) return false;
        return true;
    });
}

function getUserActivity(user) { return _activity.filter(e => e.user === user); }

function getActivityStats(userCtx) {
    if (userCtx) _checkRead(userCtx, '_audit:activity');

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

function getStats(userCtx) {
    if (userCtx) _checkRead(userCtx, '_audit:stats');

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
function search(filter = {}, userCtx) {
    if (userCtx) _checkRead(userCtx, '_audit:search');

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

    // Archive old entries (storage migration: FileStorage write into a
    // contained models-root dir. The legacy signature accepted an archiveDir
    // but no caller ever passed one; caller-supplied paths are not trusted -
    // archives always land in models/audit-rotate/.)
    if (archive.length > 0) {
        _getLedgerStore().write(path.join('audit-rotate', `audit-${Date.now()}.json`), JSON.stringify(archive, null, 2));
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

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get ledger from all brains in the stack
 * @returns {Object} Combined ledger from all brains
 */
function getStackLedger() {
    const brain = _getBrain();
    const stack = brain.getStack();
    const results = {
        version: VERSION,
        source: 'stack',
        brains: stack,
        entries: []
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const ledger = getLedger();
            if (ledger && ledger.entries) {
                ledger.entries.forEach(entry => {
                    results.entries.push({ ...entry, brain: brainName });
                });
            }
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * Query activity across all brains in stack
 * @param {Object} options - Query options
 * @returns {Array} Combined activity from all brains
 */
function queryStack(options = {}) {
    const brain = _getBrain();
    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const activity = query(options);
            if (Array.isArray(activity)) {
                activity.forEach(entry => {
                    results.push({ ...entry, brain: brainName });
                });
            }
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * Get activity stats from all brains in stack
 * @returns {Object} Combined stats from all brains
 */
function getStackActivityStats() {
    const brain = _getBrain();
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        total: 0,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const stats = getActivityStats();
            results.byBrain[brainName] = stats;
            results.total += stats.total || 0;
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
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
    getLayerStatus, isOperationAllowed, getStatus,
    // Multibrain Stack
    getStackLedger, queryStack, getStackActivityStats
};
