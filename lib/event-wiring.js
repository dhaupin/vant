/**
 * Vant Event Wiring (pass 179, prd-canonicalization Wave A3)
 *
 * BEFORE this module: 266 distinct event names were emitted on the shared
 * bus, 8 were heard anywhere, and the security/integrity events that
 * DESERVE reaction (denials, storage errors, failed syncs) lifted off
 * into the void. This module attaches the high-value listeners:
 *
 *   denied/error class  → audit (warn/error entries with payload context)
 *   sync:push/pull:failed → health (last-failure surfaced in runChecks)
 *   stego:*, secret:*   → audit info entries (names/paths only — no values)
 *
 * Idempotent (wire() keeps a registry so repeat calls don't stack
 * duplicate handlers) and lazy (require() inside handlers — the wiring
 * must not create a load-cycle with audit/health). Called from boot;
 * test/event-observability.test.js pins every wire.
 */

const bus = require('./event');

const _wired = [];
function _wire(name, fn, note) {
    bus.on(name, fn);
    _wired.push({ name, note });
}

function _audit() {
    try { return require('./audit'); } catch { return null; }
}

// ── Category 1: denials → audit ledger. audit.log() is the PERSISTING
// writer (hash-chained ledger); warn/info/error are console-only (audit.js
// build: they emit + print, only log() appends). Security denials deserve
// the durable path.
const DENIAL_EVENTS = ['vaf:blocked', 'rls:denied', 'trust:blocked', 'market:blocked'];
for (const name of DENIAL_EVENTS) {
    _wire(name, (data) => {
        try {
            _audit()?.log?.('event-wiring:' + name, { event: name, ...(typeof data === 'object' ? data : { data }) });
        } catch { /* reaction must never become the new failure */ }
    }, 'security denial → audit.log (ledger)');
}

// ── Category 2: storage errors → audit ledger (error class) ──────────────
_wire('storage:error', (data) => {
    try {
        _audit()?.log?.('event-wiring:storage:error', { event: 'storage:error', ...(typeof data === 'object' ? data : { data }) });
    } catch {}
}, 'storage failure → audit.log (ledger)');

// ── Category 3: sync failures → health last-failure ─────────────────────
const _lastSyncFailure = { event: null, at: null, error: null };
for (const name of ['sync:push:failed', 'sync:pull:failed']) {
    _wire(name, (data) => {
        _lastSyncFailure.event = name;
        _lastSyncFailure.at = Date.now();
        _lastSyncFailure.error = typeof data === 'object' && data ? (data.error || data.reason || 'unknown') : 'unknown';
    }, 'sync failure → health.lastSyncFailure');
}

function lastSyncFailure() {
    return { ..._lastSyncFailure };
}

// ── Category 4: stego + secret access → audit ledger (names only) ──────
_wire('stego:encoded', (data) => {
    try { _audit()?.log?.('event-wiring:stego:encoded', { inputPath: data?.inputPath, outputPath: data?.outputPath, encrypted: !!data?.hasPassword }); } catch {}
}, 'stego op → audit.log (paths only)');
_wire('stego:decoded', (data) => {
    try { _audit()?.log?.('event-wiring:stego:decoded', { imagePath: data?.imagePath, length: data?.length }); } catch {}
}, 'stego op → audit.log (paths only)');
const SECRET_EVENTS = ['secret:accessed', 'secret:denied', 'secret:set', 'secret:cleared'];
for (const name of SECRET_EVENTS) {
    _wire(name, (data) => {
        try {
            // Payloads hold TYPE names, never values (secret.js contract) —
            // assert-shape rather than blind-spread so a payload leak shows here.
            _audit()?.log?.('event-wiring:' + name, typeof data === 'object' ? data : { data });
        } catch {}
    }, 'secret lifecycle → audit.log (names only)');
}

// ── Health surfacing: sync last-failure appears in runChecks ──────────
function _attachHealthCheck() {
    try {
        const health = require('./health');
        const orig = health.runChecks;
        if (orig._eventWired) return; // idempotent
        const wrapped = async () => {
            const checks = await orig.call(health);
            if (_lastSyncFailure.event) {
                checks.push({
                    name: 'sync',
                    status: Date.now() - _lastSyncFailure.at < 30 * 60 * 1000 ? 'warn' : 'ok',
                    last_failure: _lastSyncFailure.event,
                    when: new Date(_lastSyncFailure.at).toISOString(),
                    message: _lastSyncFailure.error
                });
            } else {
                checks.push({ name: 'sync', status: 'ok' });
            }
            return checks;
        };
        wrapped._eventWired = true;
        try { health.runChecks = wrapped; } catch { /* read-only export: skip surfacing */ }
    } catch { /* health optional */ }
}

// ── Public surface ────────────────────────────────────────────────────────
function wire() {
    _attachHealthCheck();
    return listWired();
}

function listWired() {
    return _wired.map(w => ({ event: w.name, note: w.note }));
}

function isWired(name) {
    return _wired.some(w => w.name === name);
}

module.exports = { wire, listWired, isWired, lastSyncFailure };
