/**
 * Storage (v0.8.6)
 * Unified storage abstraction layer for Vant
 * WITH EVENT EMISSIONS - all operations emit for interoperability
 *
 * Design:
 * - Type-specific storage classes
 * - Connector pattern (like providers/)
 * - Atomic writes for safety
 * - Lazy loading
 * - Sandbox capability gating
 * - Event emissions for reactivity
 *
 * Usage:
 *   const Storage = require('./storage');
 *   const brain = Storage.get('brain');
 *   const content = brain.get('identity', 'lessons.md');
 */

const fs = require('fs');
const sudo = require('../sudo');
const path = require('path');
const crypto = require('crypto');
const embed = require('../embed');
const errors = require('../error');
const metrics = require('../metrics');
const { Wal } = require('../wal');

// ==================== (prd-storage: metrics) STORE-LEVEL COUNTERS ====================
// Per-store op counters/bytes/errors for aggregation (getStorageMetrics()),
// mirrored into the shared metrics registry (lib/metrics.js) for Prometheus
// exposition. Collection is best-effort: never throws into caller paths.
const _storeMetrics = new Map(); // basePath -> { ops:{}, rawOps:{}, bytes:{}, errors:{} }

function _storeMetricsFor(basePath) {
    let m = _storeMetrics.get(basePath);
    if (!m) {
        m = { basePath, ops: {}, rawOps: {}, bytes: {}, errors: {} };
        _storeMetrics.set(basePath, m);
    }
    return m;
}

function _recordStoreOp(basePath, op, ok, bytes, startedNs, raw) {
    try {
        const m = _storeMetricsFor(basePath);
        const bucket = raw ? m.rawOps : m.ops;
        bucket[op] = (bucket[op] || 0) + 1;
        if (typeof bytes === 'number' && ok) m.bytes[op] = (m.bytes[op] || 0) + bytes;
        if (!ok) m.errors[op] = (m.errors[op] || 0) + 1;
        metrics.inc('vant_storage_ops_total', { op, outcome: ok ? 'ok' : 'error' });
        if (startedNs) {
            metrics.observe('vant_storage_op_duration_ms', Number(process.hrtime.bigint() - startedNs) / 1e6, { op });
        }
        if (typeof bytes === 'number' && ok) {
            metrics.observe('vant_storage_op_bytes', bytes, { op }, [64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304]);
        }
        return true;
    } catch (e) { return false; }
}

/**
 * Aggregated storage metrics (prd-storage "Metrics" item): per-store op
 * counts / bytes / errors plus the shared registry snapshot. In-process by
 * design (Prometheus exporters scrape the live process); the WAL gives the
 * durable on-disk counterpart.
 */
/** (prd-storage: WAL) Journal status for a store basePath (CLI helper). */
function getWalStatus(basePath) {
    try {
        const logPath = path.join(basePath, '.wal', 'wal.log');
        if (!fs.existsSync(logPath)) return { exists: false };
        const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
        const recs = [];
        for (const line of lines) {
            try { const r = JSON.parse(line); if (r) recs.push(r); } catch (e) { /* skip corrupt */ }
        }
        // Per-file LAST state: a later done/abort for the same file
        // supersedes its intent (records are seq-ordered).
        const last = new Map();
        for (const r of recs) {
            if (r && typeof r.file === 'string') last.set(r.file, r);
        }
        const pending = [...last.values()].filter(r => !r.done && !r.abort && !r.resolved);
        return {
            exists: true,
            bytes: fs.statSync(logPath).size,
            records: recs.length,
            pendingIntents: pending.length,
            pending: pending.slice(-10).map(r => ({ op: r.op, file: r.file, ts: r.ts }))
        };
    } catch (e) {
        return { exists: false, error: e.message };
    }
}

function getStorageMetrics() {
    const stores = [];
    let totalOps = 0, totalBytes = 0, totalErrors = 0;
    for (const [, m] of _storeMetrics) {
        const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
        const t = { ops: sum(m.ops) + sum(m.rawOps), bytes: sum(m.bytes), errors: sum(m.errors) };
        stores.push({ basePath: m.basePath, ops: { ...m.ops }, rawOps: { ...m.rawOps }, bytes: { ...m.bytes }, errors: { ...m.errors }, totals: t });
        totalOps += t.ops; totalBytes += t.bytes; totalErrors += t.errors;
    }
    return { registry: metrics.snapshot(), stores, totals: { ops: totalOps, bytes: totalBytes, errors: totalErrors } };
}

// Format handler for multi-format support
let _format = null;
function _getFormat() {
    if (!_format) {
        try { _format = require('../format'); } catch (e) {}
    }
    return _format;
}

// VAF for security validation
// (F-2 fix) cache-resilient: during a storage↔vaf circular require, vaf's
// module init can re-enter here while vaf is mid-init — requiring it then
// caches a PARTIAL export (no checkPathTraversal yet), permanently disabling
// vaf path checks in every store call. Verify the member we rely on before
// caching; retry until vaf finishes initializing.
let _vaf = null;
function _getVaf() {
    if (_vaf && typeof _vaf.checkPathTraversal === 'function') return _vaf;
    try {
        const candidate = require('../vaf');
        if (candidate && typeof candidate.checkPathTraversal === 'function') _vaf = candidate;
        return _vaf;
    } catch (e) {
        return _vaf; // may still be null mid-cycle; callers use vaf?. optional chain
    }
}

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('../event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

// Lazy load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('../sandbox'); } catch (e) {}
    }
    return _sandbox;
}

// Lazy load pipeline for unified security chain (0.8.6)
let _pipeline = null;
function _getPipeline() {
    if (!_pipeline) {
        try { _pipeline = require('../pipeline'); } catch (e) {}
    }
    return _pipeline;
}

// Safe check functions
function _checkRead(userCtx, resource) {
    const sandbox = _getSandbox();
    // Capability check (global)
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new errors.VantError('Read permission required', { code: errors.CODES.STORAGE_TYPE_UNKNOWN, retryable: false }, { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            }
        } catch (e) {}
    }
    // Auto-chain to RLS for per-record ACL
    // (pass 90) inline sync enforcement — see lib/brain.js _checkRead. The
    // fire-and-forget async call made denials into orphaned rejections.
    if (userCtx && sandbox && sandbox.rls) {
        if (sandbox.rls.assertSync) {
            sandbox.rls.assertSync(userCtx, resource, 'read');
        } else {
            sandbox.rls.checkRead(userCtx, resource, 'read').catch(() => {});
        }
    }
}


// Lazy-load Encrypt for optional encryption at rest
let _Encrypt = null;
function _getEncrypt() {
    if (!_Encrypt) {
        try { _Encrypt = require('../encrypt'); } catch (e) {}
    }
    return _Encrypt;
}


function _checkWrite(userCtx, resource) {
    const sandbox = _getSandbox();
    // Capability check (global)
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new errors.VantError('Write permission required', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
            }
        } catch (e) {}
    }
    // Auto-chain to RLS for per-record ACL (pass 90: inline sync
    // enforcement, same reasoning as _checkRead above)
    if (userCtx && sandbox && sandbox.rls) {
        if (sandbox.rls.assertSync) {
            sandbox.rls.assertSync(userCtx, resource, 'write');
        } else {
            sandbox.rls.checkWrite(userCtx, resource, 'write').catch(() => {});
        }
    }
}

// ==================== 0.8.6: SAFE-BY-DEFAULT CAPABILITY GATE ====================
// The default sandbox module exports `canRead: () => false` and
// `canWrite: () => false` (DENY by default). If we called those naively
// every storage.read/write would fail because nothing replaced the default
// module. These helpers distinguish "sandbox is the default stub" (allow
// with first-time warning) from "sandbox is a real config that denies"
// (throw) so that existing callers don't break but explicit lock-down
// (sandbox.create({ canRead: false, canWrite: false })) is honored.


// (B-2) see _checkWriteSafe note above - shared gate, _explicitlyConfigured-based
function _checkReadSafe() {
    const gate = require('../gate');
    const check = gate.checkCapability('canRead', { scope: 'storage' });
    if (check.allowed) return;
    throw new errors.VantError('Read permission required', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
}

// 0.8.6 (B-2): capability checks route through the shared gate
// (lib/gate.js), which detects the untouched default via _explicitlyConfigured
// instead of method-reference comparison. The old ref-compare could never see
// configuration done through setScopes/setCapabilities on the shared default
// sandbox instance - a configured canWrite:false gate kept allowing (the same
// hole closed in trust/market/memory).
function _checkWriteSafe() {
    const gate = require('../gate');
    const check = gate.checkCapability('canWrite', { scope: 'storage' });
    if (check.allowed) return;
    throw new errors.VantError('Write permission required', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
}

// ==================== CONSTANTS ====================
const STORAGE_VERSION = '0.8.6';

// Use brain router for path
const brain = require('../brain');
// Resolved lazily, not at module top level: storage.js loads inside brain.js's
// bootstrap window (circular require), and calling brain.getBrainPath() here
// reads partial brain exports. That is the source of Node's circular-dependency
// warnings on every CLI run. Every consumer below is a constructor, called long
// after boot completes.
let _MODELS_PATH = null;
let _PUBLIC_PATH = null;
function MODELS_PATH() {
    if (!_MODELS_PATH) _MODELS_PATH = brain.getBrainPath();
    return _MODELS_PATH;
}
function PUBLIC_PATH() {
    if (!_PUBLIC_PATH) _PUBLIC_PATH = brain.getPublicPath();
    return _PUBLIC_PATH;
}

const CONFIG_PATH = 'vant.config.js';

// ==================== HELPERS ====================
// (pass 115, live-fire) A temp stranded by a SIGKILL mid-writeFileSync never
// gets renamed away; the only durable fact about it is its AGE. A temp older
// than this with no rename is crash debris — a CONCURRENT writer's in-flight
// temp always has a fresh mtime, so the threshold is what makes sweeping safe.
const TEMP_DEBRIS_MS = 60000;
const _TEMP_SUFFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Remove crash-stranded temps for THIS target (atomicWrite's temp naming:
 * `<file>.<uuid>` in the same dir). Scoped to the target so other files are
 * never touched; age-guarded so in-flight temps are never swept.
 */
function _sweepStaleTemps(filePath) {
    try {
        const dir = path.dirname(filePath);
        const base = path.basename(filePath);
        for (const f of fs.readdirSync(dir)) {
            if (!f.startsWith(base + '.')) continue;
            if (!_TEMP_SUFFIX_RE.test(f.slice(base.length + 1))) continue;
            const p = path.join(dir, f);
            try {
                const st = fs.lstatSync(p);
                if (Date.now() - st.mtimeMs > TEMP_DEBRIS_MS) fs.unlinkSync(p);
            } catch (e) { /* raced away or unreadable — next write retries */ }
        }
    } catch (e) { /* dir unreadable — the write below surfaces it */ }
}

// Atomic write - write to temp, then rename
function atomicWrite(filePath, content) {
    _checkWrite();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // (pass 115) Sweep crash debris for this target before adding our own temp.
    _sweepStaleTemps(filePath);
    const tempPath = filePath + '.' + crypto.randomUUID();
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
}

/**
 * (pass 117, post-PRD target #3) The DEBRIS JANITOR. The passive sweep above
 * only reclaims a target's temps when that target is written again — a file
 * never written again keeps its SIGKILL debris forever. This scan walks a
 * root recursively and reports (and optionally removes) every
 * `<something>.<ext>.<uuid>`-shaped file older than maxAgeMs. The uuid-shape
 * requirement plus the age guard is what makes sweeping safe: a concurrent
 * writer's in-flight temp always has a fresh mtime, and real files do not
 * end in a bare uuid.
 *
 * Health calls this with dryRun:true (a read path must not mutate); the
 * operator-facing sweep (`vant health --sweep`) runs it for real — operator
 * intent, not a background job.
 *
 * @param {object} [opts] - { root, maxAgeMs = TEMP_DEBRIS_MS, dryRun = false, maxDepth = 8 }
 * @returns {{root, scanned, dryRun, found: Array<{file, ageMs, bytes}>, removed, errors: number}}
 */
function sweepTemps(opts = {}) {
    const root = path.resolve(opts.root || path.join(process.cwd(), 'models'));
    const maxAgeMs = Number(opts.maxAgeMs) > 0 ? Number(opts.maxAgeMs) : TEMP_DEBRIS_MS;
    const dryRun = opts.dryRun === true;
    const maxDepth = Number(opts.maxDepth) > 0 ? Number(opts.maxDepth) : 8;
    const report = { root, scanned: 0, dryRun, found: [], removed: 0, errors: 0 };
    const walk = (dir, depth) => {
        if (depth > maxDepth) return;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch (e) { report.errors++; return; }
        for (const ent of entries) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
                if (ent.name === '.git' || ent.name === 'node_modules') continue;
                walk(full, depth + 1);
                continue;
            }
            if (!ent.isFile()) continue; // never follow symlinks for removal
            report.scanned++;
            if (ent.name.indexOf('.') === -1) continue;
            const lastDot = ent.name.lastIndexOf('.');
            const suffix = ent.name.slice(lastDot + 1);
            const prefix = ent.name.slice(0, lastDot);
            if (!_TEMP_SUFFIX_RE.test(suffix)) continue;
            if (prefix.indexOf('.') === -1) continue; // must look like <name>.<ext>.<uuid>
            try {
                const st = fs.lstatSync(full);
                const ageMs = Date.now() - st.mtimeMs;
                if (ageMs <= maxAgeMs) continue; // fresh — an in-flight temp, leave it
                report.found.push({ file: full, ageMs, bytes: st.size });
                if (!dryRun) {
                    fs.unlinkSync(full);
                    report.removed++;
                }
            } catch (e) { report.errors++; }
        }
    };
    walk(root, 0);
    return report;
}

// Safe read JSON
function readJson(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

// Safe write JSON
function writeJson(filePath, data) {
    atomicWrite(filePath, JSON.stringify(data, null, 2));
}


// ==================== SHARED EXPORTS (Wave D — lib/storage.js split) ====================
// The single-source security/metrics/emission plumbing every class below
// requires. lib/storage.js (the factory) also re-exports the public surface.
module.exports = {
    fs, sudo, path, crypto, embed, errors, metrics, Wal,
    _storeMetrics, _storeMetricsFor, _recordStoreOp, getWalStatus,
    getStorageMetrics, _getFormat, _getVaf, _emit, _getSandbox,
    _getPipeline, _getEncrypt, _checkRead, _checkWrite,
    _checkReadSafe, _checkWriteSafe,
    STORAGE_VERSION, brain, MODELS_PATH, PUBLIC_PATH, CONFIG_PATH,
    _TEMP_SUFFIX_RE, _sweepStaleTemps,
    atomicWrite, sweepTemps, readJson, writeJson
};
