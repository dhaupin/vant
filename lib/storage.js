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
const sudo = require('./sudo');
const path = require('path');
const crypto = require('crypto');
const embed = require('./embed');
const errors = require('./error');
const metrics = require('./metrics');
const { Wal } = require('./wal');

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
        try { _format = require('./format'); } catch (e) {}
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
        const candidate = require('./vaf');
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

// Lazy load pipeline for unified security chain (v0.9.0-axolotl)
let _pipeline = null;
function _getPipeline() {
    if (!_pipeline) {
        try { _pipeline = require('./pipeline'); } catch (e) {}
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
    if (userCtx && sandbox && sandbox.rls) {
        sandbox.rls.checkRead(userCtx, resource, 'read');
    }
}


// Lazy-load Encrypt for optional encryption at rest
let _Encrypt = null;
function _getEncrypt() {
    if (!_Encrypt) {
        try { _Encrypt = require('./encrypt'); } catch (e) {}
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
    // Auto-chain to RLS for per-record ACL
    if (userCtx && sandbox && sandbox.rls) {
        sandbox.rls.checkWrite(userCtx, resource, 'write');
    }
}

// ==================== v0.9.0-axolotl: SAFE-BY-DEFAULT CAPABILITY GATE ====================
// The default sandbox module exports `canRead: () => false` and
// `canWrite: () => false` (DENY by default). If we called those naively
// every storage.read/write would fail because nothing replaced the default
// module. These helpers distinguish "sandbox is the default stub" (allow
// with first-time warning) from "sandbox is a real config that denies"
// (throw) so that existing callers don't break but explicit lock-down
// (sandbox.create({ canRead: false, canWrite: false })) is honored.


// (B-2) see _checkWriteSafe note above - shared gate, _explicitlyConfigured-based
function _checkReadSafe() {
    const gate = require('./gate');
    const check = gate.checkCapability('canRead', { scope: 'storage' });
    if (check.allowed) return;
    throw new errors.VantError('Read permission required', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
}

// v0.9.0-axolotl (B-2): capability checks route through the shared gate
// (lib/gate.js), which detects the untouched default via _explicitlyConfigured
// instead of method-reference comparison. The old ref-compare could never see
// configuration done through setScopes/setCapabilities on the shared default
// sandbox instance - a configured canWrite:false gate kept allowing (the same
// hole closed in trust/market/memory).
function _checkWriteSafe() {
    const gate = require('./gate');
    const check = gate.checkCapability('canWrite', { scope: 'storage' });
    if (check.allowed) return;
    throw new errors.VantError('Write permission required', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
}

// ==================== CONSTANTS ====================
const STORAGE_VERSION = '0.8.6';

// Use brain router for path
const brain = require('./brain');
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
// Atomic write - write to temp, then rename
function atomicWrite(filePath, content) {
    _checkWrite();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tempPath = filePath + '.' + crypto.randomUUID();
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
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

// ==================== FILE STORAGE ====================
class FileStorage {
    constructor(options = {}) {
        this.basePath = options.basePath || process.cwd();
        this.version = STORAGE_VERSION;

        // (prd-storage: encryption at rest) Opt-in AES-256-GCM at the store
        // level. Key source, in order: options.encryptKey, env
        // VANT_STORAGE_KEY. Encrypted files carry a `vant-enc:v1:` prefix so
        // read() can distinguish them from plaintext (mixed stores OK).
        this._encrypt = options.encrypt === true || process.env.VANT_STORAGE_ENCRYPT === '1';
        this._encryptKey = options.encryptKey || process.env.VANT_STORAGE_KEY || null;
        if (this._encrypt && !this._encryptKey) {
            throw new errors.VantError('Encryption enabled but no key: pass encryptKey or set VANT_STORAGE_KEY', { code: 'STORAGE_ENCRYPT_KEY_REQUIRED', retryable: false });
        }

        // (prd-storage: compression) Transparent gzip for large blobs.
        // Off by default; enable per store (compressAbove bytes) or env
        // VANT_STORAGE_COMPRESS_ABOVE. Compressed files carry a
        // `vant-gz:v1:` prefix. Pipeline order: compress THEN encrypt, so
        // ciphertext (high entropy) is never fed to the compressor.
        const envAbove = parseInt(process.env.VANT_STORAGE_COMPRESS_ABOVE, 10);
        this._compressAbove = Number.isFinite(options.compressAbove)
            ? options.compressAbove
            : (Number.isFinite(envAbove) ? envAbove : 0);
        this._compress = this._compressAbove > 0;

        // (prd-storage: snapshots) max retained snapshots; oldest pruned on overflow
        const envMaxSnap = parseInt(process.env.VANT_STORAGE_MAX_SNAPSHOTS, 10);
        this._maxSnapshots = Number.isFinite(options.maxSnapshots)
            ? options.maxSnapshots
            : (Number.isFinite(envMaxSnap) && envMaxSnap > 0 ? envMaxSnap : 20);

        // (prd-storage: WAL crash recovery) Opt-in per-store intent journal
        // (.wal/ inside basePath). Replay on open: intents without DONE/ABORT
        // whose target is missing or OLDER than the intent are re-applied
        // (idempotent via the mtime rule — a newer target means the write
        // landed before the crash). Best-effort: journal failures never
        // throw; writeRaw stays WAL-free BY DESIGN (race-sensitive callers).
        this._wal = new Wal(this.basePath, { enabled: options.wal === true || process.env.VANT_WAL === '1' });
        const _replayStats = this._wal.replay((op, file, payload) => {
            const target = path.resolve(this.basePath, file);
            if (op === 'write') atomicWrite(target, this._encodeOutbound(payload));
            else if (op === 'delete' && fs.existsSync(target)) fs.unlinkSync(target);
        });
        if (_replayStats && _replayStats.replayed > 0) {
            metrics.inc('vant_wal_replays_total', { store: path.basename(this.basePath) }, _replayStats.replayed);
        }

        // (prd-storage: mirror replication) Best-effort per-op replication to
        // configured mirror store(s) (options.mirror or env
        // VANT_STORAGE_MIRROR, path.delimiter-separated). Mirrors are plain
        // FileStorage instances (no WAL, no nested mirrors) — mutations are
        // replayed via mirror.write()/delete() so each side encodes per its
        // own config. Failures are counted, never thrown into primary callers.
        this._isMirror = options._isMirror === true;
        this._mirrorStats = { writes: 0, deletes: 0, errors: 0 };
        this._mirrors = [];
        if (!this._isMirror) {
            const raw = [];
            if (options.mirror) raw.push(...(Array.isArray(options.mirror) ? options.mirror : [options.mirror]));
            if (process.env.VANT_STORAGE_MIRROR) {
                raw.push(...process.env.VANT_STORAGE_MIRROR.split(path.delimiter).filter(Boolean));
            }
            for (const m of raw) {
                try {
                    this._mirrors.push(new FileStorage({ basePath: path.resolve(String(m)), wal: false, _isMirror: true }));
                } catch (e) { this._mirrorStats.errors++; }
            }
        }
    }

    static get ENCRYPT_PREFIX() { return 'vant-enc:v1:'; }
    static get GZIP_PREFIX() { return 'vant-gz:v1:'; }

    _compressContent(content) {
        if (!this._compress || typeof content !== 'string' || content.length < this._compressAbove) {
            return content;
        }
        const zlib = require('zlib');
        return FileStorage.GZIP_PREFIX + zlib.gzipSync(Buffer.from(content, 'utf8')).toString('base64');
    }

    _decompressContent(content) {
        if (typeof content !== 'string' || !content.startsWith(FileStorage.GZIP_PREFIX)) return content;
        const zlib = require('zlib');
        return zlib.gunzipSync(Buffer.from(content.slice(FileStorage.GZIP_PREFIX.length), 'base64')).toString('utf8');
    }

    _encryptContent(content) {
        if (!this._encrypt) return content;
        const Encrypt = require('./encrypt');
        if (typeof Encrypt.encrypt !== 'function') {
            throw new errors.VantError('encrypt.js unavailable for storage encryption', { code: 'STORAGE_ENCRYPT_UNAVAILABLE', retryable: false });
        }
        return FileStorage.ENCRYPT_PREFIX + Encrypt.encrypt(String(content), this._encryptKey);
    }

    _decryptContent(content) {
        if (typeof content !== 'string' || !content.startsWith(FileStorage.ENCRYPT_PREFIX)) return content;
        if (!this._encryptKey) {
            throw new errors.VantError('Encrypted file encountered but store has no key (VANT_STORAGE_KEY?)', { code: 'STORAGE_DECRYPT_KEY_REQUIRED', retryable: false });
        }
        const Encrypt = require('./encrypt');
        const out = Encrypt.decrypt(content.slice(FileStorage.ENCRYPT_PREFIX.length), this._encryptKey);
        if (out && typeof out === 'object' && out.error) {
            throw new errors.VantError('Storage decrypt failed: ' + out.error, { code: 'STORAGE_DECRYPT_FAILED', retryable: false });
        }
        return out;
    }

    // Write-side pipeline: serialize → compress → encrypt. Read-side is the
    // reverse, each step prefix-detected so any mix of file vintages in one
    // store reads back correctly.
    _encodeOutbound(content) {
        return this._encryptContent(this._compressContent(content));
    }

    _decodeInbound(content) {
        // Reverse of _encodeOutbound: strip encryption first, then decompress
        return this._decompressContent(this._decryptContent(content));
    }
    _checkContainment(fullPath) {
        // (pass 22) Exact-segment containment: the old startsWith check matched
        // the prefix bug class (/repo-evil passes /repo), and the write path
        // never called this at all. path.relative + '..' detection rejects
        // any target that resolves OUTSIDE the store's basePath, and is
        // insensitive to separator quirks and prefix collisions.
        const resolved = path.resolve(fullPath);
        const baseResolved = path.resolve(this.basePath);
        const rel = path.relative(baseResolved, resolved);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            throw new errors.VantError('Security: Path escape detected', { code: errors.CODES.SECURITY_PATH_ESCAPE, retryable: false });
        }
    }

    // Helper: Check for symlink attack
    _checkSymlink(fullPath) {
        // FIRST: Check containment (path escape) - do this regardless of file existence
        this._checkContainment(fullPath);

        // SECOND: Check if file is a symlink (only if file exists)
        try {
            const stats = fs.lstatSync(fullPath);
            if (stats.isSymbolicLink()) {
                throw new errors.VantError('Security: Symlink attack detected', { code: errors.CODES.SECURITY_SYMLINK_ATTACK, retryable: false });
            }
        } catch(e) {
            if (e.code === 'ENOENT') {
                // File doesn't exist, but we already checked containment above - that's okay
            } else if (e.message.includes('Security')) {
                throw e;
            }
            // Other errors - ignore, containment check already passed
        }
    }

    read(filePath) {
        // v0.9.0-axolotl: SECURE BY DEFAULT. Capability check inline before
        // touching the filesystem. For the explicit bypass, use readRaw().
        _checkReadSafe();

        // (prd-storage: metrics)
        const _t0 = process.hrtime.bigint();
        // SECURITY: Use vaf for path validation
        const vaf = _getVaf();
        if (vaf?.checkPathTraversal) {
            const check = vaf.checkPathTraversal(filePath);
            if (check.blocked) {
                throw new errors.VantError('Security: Path blocked', { code: 'VAF_PATH_BLOCKED', retryable: false });
            }
        }
        const fullPath = path.join(this.basePath, filePath);
        // Security: Block absolute paths - can read anything!

        // EVIL FIX: Check containment FIRST (before checking existence)
        // This catches path escapes like ../test even if file doesn't exist
        this._checkSymlink(fullPath);

        if (!fs.existsSync(fullPath)) {
            _recordStoreOp(this.basePath, 'read', true, 0, _t0);
            return null;
        }

        // (prd-storage: encryption/compression) decode transparently based
        // on the file's prefix; plaintext passes through untouched
        try {
            const content = this._decodeInbound(fs.readFileSync(fullPath, 'utf8'));
            _recordStoreOp(this.basePath, 'read', true, content ? content.length : 0, _t0);
            return content;
        } catch (e) {
            _recordStoreOp(this.basePath, 'read', false, undefined, _t0);
            throw e;
        }
    }

    readRaw(filePath) {
        // v0.9.0-axolotl: explicit bypass. Caller asserts they have
        // already validated inputs. NO capability or VAF checks inline.
        return this._readUnsafe(filePath);
    }

    _readUnsafe(filePath) {
        const _t0 = process.hrtime.bigint();
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.basePath, filePath);
        if (!fs.existsSync(fullPath)) {
            _recordStoreOp(this.basePath, 'read', true, 0, _t0, true);
            return null;
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        _recordStoreOp(this.basePath, 'read', true, content ? content.length : 0, _t0, true);
        return content;
    }

    write(filePath, content, opts = {}) {
        // v0.9.0-axolotl: SECURE BY DEFAULT. Capability check inline.
        _checkWriteSafe();

        // SECURITY: Use vaf for path validation
        const vaf = _getVaf();
        if (vaf?.checkPathTraversal) {
            const check = vaf.checkPathTraversal(filePath);
            if (check.blocked) {
                _recordStoreOp(this.basePath, 'write', false);
                throw new errors.VantError('Security: Path blocked', { code: 'VAF_PATH_BLOCKED', retryable: false });
            }
        }
        // Security: Block absolute paths - can write anywhere!
        const fullPath = path.join(this.basePath, filePath);
        // (pass 22) Containment PRE-CHECK on write: the read path had this
        // (via _checkSymlink) but write didn't — a cwd-anchored relative path
        // like '../../tmp/x' collapsed via path.join and silently wrote
        // OUTSIDE the store (escrow store escape, pass 22). Fail before the
        // WAL intent, before any dir creation, before any bytes land.
        this._checkContainment(fullPath);

        // NEW (v0.8.6): Auto-serialize if format specified
        let finalContent = content;
        if (opts.format && typeof content === 'object') {
            const format = _getFormat();
            if (format?.serialize) {
                finalContent = format.serialize(content, opts.format, opts);
            } else {
                // Fallback to JSON
                finalContent = JSON.stringify(content, null, 2);
            }
        }

        // (prd-storage: WAL) intent before the mutation lands; DONE ack
        // after, ABORT tombstone if the write fails
        const _walSeq = this._wal.intent('write', filePath, finalContent);
        const _t0 = process.hrtime.bigint();
        try {
            atomicWrite(fullPath, this._encodeOutbound(finalContent));
        } catch (e) {
            if (_walSeq) this._wal.abort(_walSeq, filePath);
            _recordStoreOp(this.basePath, 'write', false, undefined, _t0);
            throw e;
        }
        if (_walSeq) this._wal.done(_walSeq, filePath);
        _recordStoreOp(this.basePath, 'write', true, typeof finalContent === 'string' ? finalContent.length : undefined, _t0);
        this._replicate('write', filePath, finalContent);

        // Verify what was actually written - not a symlink to escape
        try {
            const stats = fs.lstatSync(fullPath);
            if (stats.isSymbolicLink()) {
                // Dangerous! Remove it
                fs.unlinkSync(fullPath);
                _recordStoreOp(this.basePath, 'write', false);
                throw new errors.VantError('Security: Detected symlink attack', { code: errors.CODES.SECURITY_SYMLINK_ATTACK, retryable: false });
            }
        } catch(e) {
            if (e.code === 'ENOENT') {
                // File wasn't written - that's fine
            } else {
                throw e;
            }
        }

        return true;
    }

    readJson(filePath) {
        // SECURITY: Use vaf for path validation
        const vaf = _getVaf();
        if (vaf?.checkPathTraversal) {
            const check = vaf.checkPathTraversal(filePath);
            if (check.blocked) {
                throw new errors.VantError('Security: Path blocked', { code: 'VAF_PATH_BLOCKED', retryable: false });
            }
        }
        const fullPath = path.join(this.basePath, filePath);
        return readJson(fullPath);
    }

    writeJson(filePath, data) {
        // SECURITY: Use vaf for path validation
        const vaf = _getVaf();
        if (vaf?.checkPathTraversal) {
            const check = vaf.checkPathTraversal(filePath);
            if (check.blocked) {
                throw new errors.VantError('Security: Path blocked', { code: 'VAF_PATH_BLOCKED', retryable: false });
            }
        }
        const fullPath = path.join(this.basePath, filePath);
        writeJson(fullPath, data);
        return true;
    }

    has(filePath) {
        // SECURITY: Use vaf for path validation
        const vaf = _getVaf();
        if (vaf?.checkPathTraversal) {
            const check = vaf.checkPathTraversal(filePath);
            if (check.blocked) {
                return false;
            }
        }
        const fullPath = path.join(this.basePath, filePath);
        const exists = fs.existsSync(fullPath);
        // Not-found is a normal `has()` outcome, not an error — record ok
        // with the existence flag in the bytes slot (1=found, 0=absent).
        _recordStoreOp(this.basePath, 'has', true, exists ? 1 : 0);
        return exists;
    }

    delete(filePath) {
        // v0.9.0-axolotl: SECURE BY DEFAULT.
        _checkReadSafe();
        _checkWriteSafe();

        // SECURITY: Use vaf for path validation
        const vaf = _getVaf();
        if (vaf?.checkPathTraversal) {
            const check = vaf.checkPathTraversal(filePath);
            if (check.blocked) {
                return false;
            }
        }
        const fullPath = path.join(this.basePath, filePath);
        // (pass 22) Same containment guard as write — delete() could unlink
        // anything the join collapses to, including outside the store.
        this._checkContainment(fullPath);
        if (fs.existsSync(fullPath)) {
            const _walSeq = this._wal.intent('delete', filePath);
            fs.unlinkSync(fullPath);
            if (_walSeq) this._wal.done(_walSeq, filePath);
            this._replicate('delete', filePath);
            _recordStoreOp(this.basePath, 'delete', true);

            // EVENT: storage:deleted
            _emit('storage:deleted', { path: fullPath, timestamp: Date.now() });

            return true;
        }
        _recordStoreOp(this.basePath, 'delete', true, 0);
        return false;
    }

    list(pattern) {
        // v0.9.0-axolotl: SECURE BY DEFAULT.
        _checkReadSafe();

        // SECURITY: Use vaf for path validation
        const vaf = _getVaf();
        if (vaf?.checkPathTraversal) {
            const check = vaf.checkPathTraversal(pattern);
            if (check.blocked) {
                return [];
            }
        }
        // Simple glob - just prefix matching
        const dir = path.dirname(pattern);
        const base = path.basename(pattern).replace('*', '');
        const fullDir = path.join(this.basePath, dir);

        if (!fs.existsSync(fullDir)) return [];

        const out = fs.readdirSync(fullDir)
            .filter(f => f.includes(base))
            .map(f => path.join(fullDir, f));
        _recordStoreOp(this.basePath, 'list', true, out.length);
        return out;
    }

    // ==================== (prd-storage) MIRROR REPLICATION ====================
    // Per-op best-effort fan-out (write/delete) plus explicit full resync and
    // verify. Internal dirs (.wal, .snapshots) are never replicated.
    _replicate(op, filePath, content) {
        try {
            if (this._isMirror || !this._mirrors.length) return;
            const rel = String(filePath || '');
            if (rel.startsWith('.snapshots') || rel.startsWith('.wal')) return;
            for (const m of this._mirrors) {
                try {
                    if (op === 'write') m.write(rel, content);
                    else if (op === 'delete') m.delete(rel);
                    if (op === 'write') this._mirrorStats.writes++; else this._mirrorStats.deletes++;
                    metrics.inc('vant_storage_mirror_ops_total', { op, outcome: 'ok' });
                } catch (e) {
                    this._mirrorStats.errors++;
                    metrics.inc('vant_storage_mirror_ops_total', { op, outcome: 'error' });
                }
            }
        } catch (e) { /* never throw into primary callers */ }
    }

    getReplicationStatus() {
        return {
            enabled: this._mirrors.length > 0,
            isMirror: this._isMirror,
            mirrors: this._mirrors.map(m => m.basePath),
            stats: { ...this._mirrorStats }
        };
    }

    /** Full resync: primary tree → mirrors (or the one named mirror path). */
    replicateAll(onlyPath) {
        const targets = onlyPath
            ? this._mirrors.filter(m => m.basePath === path.resolve(String(onlyPath)))
            : this._mirrors;
        const files = this._walkRel().filter(f => !f.startsWith('.snapshots') && !f.startsWith('.wal'));
        const mirrors = [];
        for (const m of targets) {
            const r = { basePath: m.basePath, written: 0, deleted: 0, errors: 0 };
            for (const rel of files) {
                try { m.write(rel, this.read(rel)); r.written++; }
                catch (e) { r.errors++; }
            }
            for (const rel of m._walkRel().filter(f => !f.startsWith('.snapshots') && !f.startsWith('.wal'))) {
                if (!files.includes(rel)) {
                    try { m.delete(rel); r.deleted++; }
                    catch (e) { r.errors++; }
                }
            }
            mirrors.push(r);
        }
        return { files: files.length, mirrors };
    }

    /** Compare primary vs one mirror: counts + file lists (CLI verify). */
    verifyMirror(mirrorPath) {
        const resolved = path.resolve(String(mirrorPath));
        const m = this._mirrors.find(x => x.basePath === resolved)
            || new FileStorage({ basePath: resolved, wal: false, _isMirror: true });
        const out = { basePath: m.basePath, match: 0, missing: [], differing: [], extra: [] };
        const files = this._walkRel().filter(f => !f.startsWith('.snapshots') && !f.startsWith('.wal'));
        for (const rel of files) {
            const b = m.read(rel);
            if (b === null) { out.missing.push(rel); continue; }
            if (this.read(rel) !== b) { out.differing.push(rel); continue; }
            out.match++;
        }
        for (const rel of m._walkRel().filter(f => !f.startsWith('.snapshots') && !f.startsWith('.wal'))) {
            if (!files.includes(rel)) out.extra.push(rel);
        }
        return out;
    }

    // ==================== (prd-storage) POINT-IN-TIME SNAPSHOTS ====================
    // Snapshots capture the store tree at a moment and can restore it later.
    // Layout: <basePath>/.snapshots/<id>/data/<relpath> + <id>/manifest.json
    //   - id = <ISO timestamp>-<label> (label charset-validated)
    //   - .snapshots/ is EXCLUDED from snapshotting and from restore deletion
    //   - every file copy goes through this.read()/this.write()/this.delete()
    //     (capability + vaf + containment chain), so a hand-edited manifest
    //     with traversal paths is refused by the same gates as normal writes
    //   - count capped at VANT_STORAGE_MAX_SNAPSHOTS (default 20); the oldest
    //     snapshot is pruned on overflow
    _snapshotRoot() { return path.join('.snapshots'); }

    _validSnapshotLabel(label) {
        const str = String(label || '');
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(str)) {
            throw new errors.VantError('Invalid snapshot label (use [a-zA-Z0-9._-], max 64): ' + str.slice(0, 40), { code: 'STORAGE_SNAPSHOT_LABEL_INVALID', retryable: false });
        }
        return str;
    }

    // Recursive relative-path walk of the store tree (enumeration stays on fs
    // per prd-storage standard #7 — pattern-glob limitation). Never follows
    // symlinks; always excludes the snapshots dir itself.
    _walkRel(dirRel = '') {
        const skip = new Set([this._snapshotRoot()]);
        const out = [];
        const walk = (rel) => {
            const full = path.join(this.basePath, rel);
            let entries;
            try { entries = fs.readdirSync(full, { withFileTypes: true }); } catch (e) { return; }
            for (const ent of entries) {
                const childRel = rel ? path.join(rel, ent.name) : ent.name;
                if (skip.has(childRel) || (!rel && ent.name.startsWith('.snapshots'))) continue;
                if (ent.isSymbolicLink()) continue; // never follow
                if (ent.isDirectory()) walk(childRel);
                else if (ent.isFile()) out.push(childRel);
            }
        };
        walk(dirRel);
        return out.sort();
    }

    snapshot(label = 'manual') {
        this._validSnapshotLabel(label);
        _checkWriteSafe();
        const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + label;
        const files = this._walkRel();
        let bytes = 0;
        const manifest = { id, label, createdAt: new Date().toISOString(), files: [] };
        for (const rel of files) {
            const content = this.read(rel); // full security chain, decoded
            if (content === null) continue; // vanished mid-walk
            bytes += Buffer.byteLength(String(content), 'utf8');
            this.write(path.join(this._snapshotRoot(), id, 'data', rel), content);
            manifest.files.push({ path: rel, size: Buffer.byteLength(String(content), 'utf8') });
        }
        this.write(path.join(this._snapshotRoot(), id, 'manifest.json'), JSON.stringify(manifest, null, 2));

        // Cap: prune oldest beyond the limit
        const all = this.listSnapshots();
        let pruned = 0;
        while (all.length > this._maxSnapshots) {
            const oldest = all.shift();
            this.deleteSnapshot(oldest.id);
            pruned++;
        }
        return { id, label, files: manifest.files.length, bytes, pruned };
    }

    _readSnapshotManifest(id) {
        // id is charset-validated before path use (traversal guard)
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(String(id || ''))) {
            throw new errors.VantError('Invalid snapshot id', { code: 'STORAGE_SNAPSHOT_LABEL_INVALID', retryable: false });
        }
        const raw = this.read(path.join(this._snapshotRoot(), id, 'manifest.json'));
        if (raw === null) {
            throw new errors.VantError('Snapshot not found: ' + id, { code: 'STORAGE_SNAPSHOT_NOT_FOUND', retryable: false });
        }
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed.files)) throw new Error('manifest.files missing');
            return parsed;
        } catch (e) {
            throw new errors.VantError('Snapshot manifest corrupt: ' + e.message, { code: 'STORAGE_SNAPSHOT_CORRUPT', retryable: false });
        }
    }

    listSnapshots() {
        const root = path.join(this.basePath, this._snapshotRoot());
        let ids;
        try { ids = fs.readdirSync(root, { withFileTypes: true }); } catch (e) { return []; }
        const out = [];
        for (const ent of ids) {
            if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
            try {
                const m = this._readSnapshotManifest(ent.name);
                out.push({ id: m.id, label: m.label, createdAt: m.createdAt, files: m.files.length });
            } catch (e) { /* unreadable entry: skip */ }
        }
        out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        return out;
    }

    restoreSnapshot(id) {
        const manifest = this._readSnapshotManifest(id);
        _checkWriteSafe();

        // Fail fast on hostile manifest paths: validate every rel path BEFORE
        // touching the tree. (path.join would silently normalize '../../x'
        // into the snapshots dir — containment holds, but a hand-edited
        // manifest must be REFUSED, not quietly skipped.)
        const vaf = _getVaf();
        for (const f of manifest.files) {
            if (vaf?.checkPathTraversal) {
                const check = vaf.checkPathTraversal(f.path);
                if (check.blocked) {
                    throw new errors.VantError('Security: Snapshot manifest contains blocked path: ' + f.path, { code: 'VAF_PATH_BLOCKED', retryable: false });
                }
            }
        }

        // Snapshot target set (rel paths); write through the full chain.
        const target = new Set();
        for (const f of manifest.files) target.add(f.path);

        // Current tree minus snapshots dir = candidates for removal
        const current = this._walkRel();
        let restored = 0, removed = 0;
        for (const rel of manifest.files) {
            const content = this.read(path.join(this._snapshotRoot(), id, 'data', rel.path));
            if (content === null) continue; // snapshot data vanished; skip loudly?
            this.write(rel.path, content); // chain: vaf blocks traversal from a hand-edited manifest
            restored++;
        }
        for (const rel of current) {
            if (!target.has(rel)) {
                if (this.delete(rel)) removed++;
            }
        }
        _emit('storage:snapshot_restored', { id, restored, removed, timestamp: Date.now() });
        return { id, restored, removed };
    }

    deleteSnapshot(id) {
        const manifest = this._readSnapshotManifest(id); // validates id charset
        _checkWriteSafe();
        let removed = 0;
        for (const f of manifest.files) {
            if (this.delete(path.join(this._snapshotRoot(), id, 'data', f.path))) removed++;
        }
        this.delete(path.join(this._snapshotRoot(), id, 'manifest.json'));
        // Remove the leftover dir skeleton (nested empty dirs survive plain
        // rmdir). Contained + charset-validated id ⇒ recursive rm is safe.
        const idDir = path.resolve(this.basePath, this._snapshotRoot(), id);
        const rootResolved = path.resolve(this.basePath, this._snapshotRoot());
        if (idDir.startsWith(rootResolved + path.sep)) {
            fs.rmSync(idDir, { recursive: true, force: true });
        }
        return removed >= 0;
    }

    // ==================== v0.9.0-axolotl RAW (UNSAFE) BYPASS ====================
    // Explicit, named unsafe variants for the rare case when a caller has
    // already validated inputs and needs to skip the inline capability
    // check. Use sparingly; the safe-by-default read/write/delete/list
    // is preferred.

    writeRaw(filePath, content, opts = {}) {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.basePath, filePath);
        let finalContent = content;
        if (opts.format && typeof content === 'object') {
            const format = _getFormat();
            if (format?.serialize) {
                finalContent = format.serialize(content, opts.format, opts);
            } else {
                finalContent = JSON.stringify(content, null, 2);
            }
        }
        atomicWrite(fullPath, finalContent);
        return true;
    }

    deleteRaw(filePath) {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.basePath, filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            _recordStoreOp(this.basePath, 'delete', true, undefined, null, true);
            _emit('storage:deleted', { path: fullPath, timestamp: Date.now() });
            return true;
        }
        _recordStoreOp(this.basePath, 'delete', true, 0, null, true);
        return false;
    }

    listRaw(pattern) {
        const dir = path.dirname(pattern);
        const base = path.basename(pattern).replace('*', '');
        const fullDir = path.isAbsolute(pattern) ? dir : path.join(this.basePath, dir);
        if (!fs.existsSync(fullDir)) { _recordStoreOp(this.basePath, 'list', true, 0, null, true); return []; }
        const out = fs.readdirSync(fullDir)
            .filter(f => f.includes(base))
            .map(f => path.join(fullDir, f));
        _recordStoreOp(this.basePath, 'list', true, out.length, null, true);
        return out;
    }

    // ==================== v0.9.0-axolotl PIPELINE-BACKED VARIANTS ====================
    // Async versions of the methods above that route every call through the
    // unified security pipeline (sandbox -> vaf -> qos -> escrow). New code
    // should prefer these over the sync variants.
    //
    // Per prd-sudo.md, writes here escalate via sudo first (service:
    // 'storage' auto-approves 'write' with a TTL). When sudo/boot is not
    // active the escalation resolves against the 'default' task, which is
    // created on demand below.
    async _escalateStorage(scope) {
        try {
            const sudo = require('./sudo');
            if (!sudo) return;
            if (!sudo.getTask('default')) sudo.createTask('default', ['read']);
            await sudo.escalate(null, scope, { service: 'storage', reason: 'storage ' + scope + ' via *Secured' });
        } catch (e) { /* locked or unavailable - pipeline will enforce */ }
    }

    async readSecured(filePath) {
        const pipeline = _getPipeline();
        if (!pipeline) return this.read(filePath);
        return pipeline.run(
            { name: 'storage.read', operation: 'read', input: filePath, filePath },
            async () => this.read(filePath),
            { mode: pipeline.PUBLIC }
        );
    }

    async writeSecured(filePath, content, opts = {}) {
        await this._escalateStorage('write');
        const pipeline = _getPipeline();
        if (!pipeline) return this.write(filePath, content, opts);
        return pipeline.run(
            { name: 'storage.write', operation: 'write', input: filePath, filePath },
            async () => this.write(filePath, content, opts),
            { mode: pipeline.PRIVATE }
        );
    }

    async deleteSecured(filePath) {
        await this._escalateStorage('write');
        const pipeline = _getPipeline();
        if (!pipeline) return this.delete(filePath);
        return pipeline.run(
            { name: 'storage.delete', operation: 'delete', input: filePath, filePath },
            async () => this.delete(filePath),
            { mode: pipeline.PRIVATE }
        );
    }

    async listSecured(pattern) {
        const pipeline = _getPipeline();
        if (!pipeline) return this.list(pattern);
        return pipeline.run(
            { name: 'storage.list', operation: 'read', input: pattern, pattern },
            async () => this.list(pattern),
            { mode: pipeline.PUBLIC }
        );
    }
}

// ==================== BRAIN STORAGE ====================
class BrainStorage {
    constructor(options = {}) {
        this.basePath = options.basePath || MODELS_PATH();
        this.version = STORAGE_VERSION;
    }

    _getFilePath(category, key) {
        // (R-4 audit) REJECT traversal instead of silently rewriting it:
        // the old sanitizer stripped '/' and '..' (turning '../../evil' into
        // 'evil'), which made the containment check below dead code and could
        // mask caller bugs. Legit category/key names never contain separators.
        const _trav = /(^|\/|\\)\.\.($|\/|\\)|^\.\.$/;
        if (_trav.test(category) || _trav.test(key) || /[\/\\]/.test(String(category)) || category === '.' || key === '.' || key === '..') {
            throw new errors.VantError('Path traversal blocked', { code: errors.CODES.SECURITY_PATH_TRAVERSAL, retryable: false });
        }
        const safeCategory = String(category).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 50);
        const safeKey = String(key).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 100);
        if (!safeCategory || !safeKey) {
            throw new errors.VantError('Invalid category/key', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
        }

        const dir = path.join(this.basePath, safeCategory);
        const fullPath = path.join(dir, safeKey);

        // CONTAINMENT: Verify path is within basePath (belt-and-suspenders —
        // reachable now that traversal is rejected above)
        const resolved = path.resolve(fullPath);
        const baseResolved = path.resolve(this.basePath);
        if (!resolved.startsWith(baseResolved + path.sep)) {
            throw new errors.VantError('Path traversal blocked', { code: errors.CODES.SECURITY_PATH_TRAVERSAL, retryable: false });
        }

        return fullPath;
    }

    get(category, key = null) {
        if (!category) return null;

        // Check sandbox capability (canRead for read operations)
        const sb = _getSandbox();
        if (sb && typeof sb.can === 'function' && !sb.can('canRead')) {
            _emit('storage:error', { op: 'get', category, key, error: 'canRead denied' });
            return { error: 'Sandbox: capability not allowed - canRead is false' };
        }

        if (!key) {
            // Return list of categories
            if (!fs.existsSync(this.basePath)) return [];
            return fs.readdirSync(this.basePath).filter(f =>
                fs.statSync(path.join(this.basePath, f)).isDirectory()
            );
        }

        const filePath = this._getFilePath(category, key);
        if (!fs.existsSync(filePath)) {
            _emit('storage:miss', { category, key });
            return null;
        }

        const content = fs.readFileSync(filePath, 'utf8');

        // EVENT: storage:loaded
        _emit('storage:loaded', { category, key, path: filePath, size: content.length, timestamp: Date.now() });

        return content;
    }

    write(category, key, content, opts = {}) {
        if (!key) return false;

        // Check sandbox capability (canWrite for write operations)
        const sb = _getSandbox();
        if (sb && typeof sb.can === 'function' && !sb.can('canWrite')) {
            _emit('storage:error', { op: 'write', category, key, error: 'canWrite denied' });
            return { error: 'Sandbox: capability not allowed - canWrite is false' };
        }

        // NEW (v0.8.6): Support format option for auto-serialization
        let finalContent = content;
        if (opts.format && typeof content === 'object') {
            const format = _getFormat();
            if (format?.serialize) {
                finalContent = format.serialize(content, opts.format, opts);
            } else {
                finalContent = JSON.stringify(content, null, 2);
            }
        }

        // Determine extension based on format or default to .md
        let ext = '.md';
        if (opts.format === 'json') ext = '.json';
        else if (opts.format === 'yaml') ext = '.yaml';
        else if (opts.format === 'txt') ext = '.txt';

        // Add extension if not present
        if (!key.endsWith(ext)) {
            key = key + ext;
        }

        const dir = path.join(this.basePath, category);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const filePath = this._getFilePath(category, key);
        atomicWrite(filePath, finalContent);

        // EVENT: storage:saved
        _emit('storage:saved', { category, key, path: filePath, size: finalContent.length, timestamp: Date.now() });

        return true;
    }

    append(category, key, content) {
        const existing = this.get(category, key) || '';
        return this.write(category, key, existing + content);
    }

    has(category, key) {
        const filePath = this._getFilePath(category, key);
        const exists = fs.existsSync(filePath);

        // EVENT: storage:checked (non-blocking)
        if (exists) {
            _emit('storage:checked', { category, key, exists: true });
        }

        return exists;
    }

    // Brain-friendly: accepts full path or category+key
    brainHas(filePath) {
        // Block external path traversal
        if (filePath.includes('/') || filePath.includes('\\')) {
            // Full path given - BLOCK external access
            return false;
        }
        // Use safe internal method
        return this.has(filePath, '');
    }

    // Brain-friendly: accepts full path or category+key
    brainRead(filePath) {
        // Block external path traversal
        if (filePath.includes('/') || filePath.includes('\\')) {
            // Full path given - BLOCK external access
            return null;
        }
        // Use safe internal method
        return this.get(filePath, '');
    }

    // Brain-friendly: list brains - BLOCK external dirs
    brainList(dirPath) {
        // Block external path access - only list internal brains
        if (!dirPath || dirPath.includes('/') || dirPath.includes('\\')) {
            return [];  // Return empty for safety
        }
        // Internal listing only
        if (!fs.existsSync(path.join(this.basePath, dirPath))) return [];
        const dir = path.join(this.basePath, dirPath);
        return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    }

    list(category) {
        const dir = path.join(this.basePath, category);
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    }

    query(query) {
        // Simple text search in brain files
        const results = [];
        const queryLower = query.toLowerCase();

        if (!fs.existsSync(this.basePath)) return results;

        for (const category of fs.readdirSync(this.basePath)) {
            const catDir = path.join(this.basePath, category);
            if (!fs.statSync(catDir).isDirectory()) continue;

            for (const file of fs.readdirSync(catDir)) {
                if (!file.endsWith('.md')) continue;

                const content = fs.readFileSync(path.join(catDir, file), 'utf8');
                if (content.toLowerCase().includes(queryLower)) {
                    results.push({
                        category,
                        file,
                        content: content.substring(0, 500)
                    });
                }
            }
        }

        return results;
    }
}

// ==================== VECTOR STORAGE ====================
class VectorStorage {
    constructor(options = {}) {
        this.connector = options.connector || null;
        this.connectorConfig = options;
        this._data = new Map(); // Local fallback
        this.version = STORAGE_VERSION;
        this._embedder = options.embedder || null;
    }

    /**
     * Set custom embedder
     */
    setEmbedder(name) {
        if (name && embed) {
            embed.setEmbedder(name);
            this._embedder = name;
        }
        return { embedder: this._embedder };
    }

    // Get embedding from text (uses embed module)
    async _textToEmbedding(text) {
        if (this._embedder === 'legacy') {
            // Old hash fallback
            return this._hashToVector(text);
        }

        // New: use embed module (TF-IDF by default, swap to transformers if installed)
        try {
            return await embed.generate(text);
        } catch (e) {
            // Fallback to legacy hash
            return this._hashToVector(text);
        }
    }

    // Hash text to simple vector (legacy fallback)
    _hashToVector(text) {
        const hash = crypto.createHash('sha256').update(text).digest();
        const vec = [];
        for (let i = 0; i < 128; i++) {
            vec.push(hash[i % hash.length] / 255);
        }
        return vec;
    }

    // Cosine similarity
    _cosineSimilarity(a, b) {
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
        }
        return dot / (Math.sqrt(magA) * Math.sqrt(magB));
    }

    // Add document with embedding (legacy sync)
    add(id, text, metadata = {}) {
        if (this.connector && this.connector.add) {
            return this.connector.add(id, text, metadata);
        }

        // Legacy hash fallback
        this._data.set(id, {
            text,
            metadata,
            vector: this._hashToVector(text)
        });
        return true;
    }

    /**
     * Add document with semantic embedding (async, recommended)
     */
    async addAsync(id, text, metadata = {}) {
        if (this.connector && this.connector.addAsync) {
            return this.connector.addAsync(id, text, metadata);
        }

        // Compute embedding
        const vector = await this._textToEmbedding(text);

        this._data.set(id, {
            text,
            metadata,
            vector
        });

        return true;
    }

    /**
     * Batch add with embeddings
     */
    async addBulk(docs) {
        const results = [];

        for (const { id, text, metadata } of docs) {
            results.push(await this.addAsync(id, text, metadata));
        }

        return results;
    }

    search(query, options = {}) {
        const topK = options.topK || 5;

        if (this.connector && this.connector.search) {
            return this.connector.search(query, options);
        }

        // Legacy hash fallback
        const queryVec = this._hashToVector(query);
        const results = [];

        for (const [id, doc] of this._data) {
            const score = this._cosineSimilarity(queryVec, doc.vector);
            results.push({ id, text: doc.text, metadata: doc.metadata, score });
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    /**
     * Semantic search using embeddings (async, recommended)
     */
    async searchAsync(query, options = {}) {
        const topK = options.topK || 5;

        // Compute query embedding
        const queryVec = await this._textToEmbedding(query);

        const results = [];

        for (const [id, doc] of this._data) {
            const score = this._cosineSimilarity(queryVec, doc.vector);
            results.push({ id, text: doc.text, metadata: doc.metadata, score });
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    delete(id) {
        if (this.connector && this.connector.delete) {
            return this.connector.delete(id);
        }
        return this._data.delete(id);
    }

    connect(connector) {
        this.connector = connector;
    }
}

// ==================== STATE STORAGE ====================
// State with layered read (private overrides public)
class StateStorage {
    constructor(options = {}) {
        this.privatePath = options.privatePath || MODELS_PATH() + '/.state.json';
        this.publicPath = options.publicPath || PUBLIC_PATH() + '/.state.json';
        this.version = STORAGE_VERSION;
        this._state = this._load();
    }

    // Layered read: private first, then public fallback
    _load() {
        // Private has highest priority
        if (fs.existsSync(this.privatePath)) {
            return readJson(this.privatePath) || { static: {}, current: {}, temp: {} };
        }
        // Fall back to public (OSS templates)
        if (fs.existsSync(this.publicPath)) {
            return readJson(this.publicPath) || { static: {}, current: {}, temp: {} };
        }
        // Initialize both directories
        if (!fs.existsSync(MODELS_PATH())) {
            fs.mkdirSync(MODELS_PATH(), { recursive: true });
        }
        return { static: {}, current: {}, temp: {} };
    }

    // Always write to private (agent's brain)
    _save() {
        writeJson(this.privatePath, this._state);
    }

    get(key) {
        const s = this._load();
        return key ? s.current?.[key] : s.current;
    }

    set(key, value) {
        if (!this._state.current) this._state.current = {};
        this._state.current[key] = value;
        this._save();
        return true;
    }

    getCurrent(key) {
        const s = this._load();
        return key ? s.current?.[key] : s.current;
    }

    // Helper: Remove dangerous keys from object using vaf
    _sanitizeObject(obj) {
        return _vaf.sanitizeObject(obj);
    }

    setCurrent(key, value) {
        if (!this._state.current) this._state.current = {};
        // Handle setCurrent({ task: 'test' }) object form
        if (typeof key === 'object' && key !== null) {
            // SECURITY: Sanitize to prevent prototype pollution
            const safe = this._sanitizeObject(key);
            Object.assign(this._state.current, safe);
        } else {
            this._state.current[key] = value;
        }
        this._save();
        return true;
    }

    getStatic(key) {
        const s = this._load();
        return key ? s.static?.[key] : s.static;
    }

    setStatic(key, value) {
        if (!this._state.static) this._state.static = {};
        // Handle setStatic({ t: 'v' }) object form
        if (typeof key === 'object' && key !== null) {
            // SECURITY: Sanitize to prevent prototype pollution
            const safe = this._sanitizeObject(key);
            Object.assign(this._state.static, safe);
        } else {
            this._state.static[key] = value;
        }
        this._save();
        return true;
    }

    getTemp(key) {
        const s = this._load();
        return key ? s.temp?.[key] : s.temp;
    }

    setTemp(key, value) {
        if (!this._state.temp) this._state.temp = {};
        this._state.temp[key] = value;
        return true;
    }

    clearTemp() {
        this._state.temp = {};
        this._save();
        return true;
    }

    getSummary() {
        const s = this._load();
        return `static=${JSON.stringify(s.static)},current=${JSON.stringify(s.current)}`;
    }
}

// ==================== CONFIG STORAGE ====================
class ConfigStorage {
    constructor(options = {}) {
        this.filePath = options.filePath || CONFIG_PATH;
        this.version = STORAGE_VERSION;
        this._config = this._load();
    }

    _load() {
        const defaultConfig = {
            version: STORAGE_VERSION,
            storage: { autoSync: false },
            github: { token: null },
            features: {}
        };

        if (!fs.existsSync(this.filePath)) return defaultConfig;

        try {
            // SECURITY (closes P0-7): evaluate config in a bare vm context -
            // no require/process/fs available. Configs are data, not code.
            const vm = require('vm');
            const sandbox = { module: { exports: {} } };
            vm.createContext(sandbox);
            vm.runInContext(fs.readFileSync(this.filePath, 'utf8'), sandbox, {
                filename: this.filePath,
                timeout: 1000
            });
            return { ...defaultConfig, ...(sandbox.module.exports || {}) };
        } catch {
            return defaultConfig;
        }
    }

    get(key) {
        const parts = key.split('.');
        let value = this._config;
        for (const p of parts) {
            value = value?.[p];
            if (value === undefined) return null;
        }
        return value;
    }

    set(key, value) {
        const parts = key.split('.');
        let obj = this._config;

        for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {};
            obj = obj[parts[i]];
        }

        obj[parts[parts.length - 1]] = value;
        this.save();
        return true;
    }

    getAll() {
        return { ...this._config };
    }

    save() {
        const content = 'module.exports = ' + JSON.stringify(this._config, null, 2);
        atomicWrite(this.filePath, content);
    }

    load() {
        this._config = this._load();
        return this._config;
    }
}

// ==================== LOCK STORAGE ====================
class LockStorage {
    constructor(options = {}) {
        this.lockDir = options.lockDir || '.locks';
        if (!fs.existsSync(this.lockDir)) {
            fs.mkdirSync(this.lockDir, { recursive: true });
        }
        this.version = STORAGE_VERSION;
    }

    _getLockPath(id) {
        return path.join(this.lockDir, '.lock-' + id + '.json');
    }

    acquire(id, options = {}) {
        const ttl = options.ttl || 60000;
        const lockPath = this._getLockPath(id);

        if (fs.existsSync(lockPath)) {
            const content = readJson(lockPath);
            if (content && Date.now() < content.expiresAt) {
                return null; // Lock held
            }
        }

        const token = crypto.randomUUID();
        const data = {
            id,
            token,
            acquiredAt: Date.now(),
            expiresAt: Date.now() + ttl
        };

        writeJson(lockPath, data);
        return token;
    }

    has(id) {
        const lockPath = this._getLockPath(id);
        if (!fs.existsSync(lockPath)) return false;

        const content = readJson(lockPath);
        return content && Date.now() < content.expiresAt;
    }

    renew(id, options = {}) {
        const ttl = options.ttl || 60000;
        const lockPath = this._getLockPath(id);

        if (!fs.existsSync(lockPath)) return false;

        const content = readJson(lockPath);
        if (!content) return false;

        content.expiresAt = Date.now() + ttl;
        writeJson(lockPath, content);
        return true;
    }

    release(id, token) {
        const lockPath = this._getLockPath(id);

        if (!fs.existsSync(lockPath)) return false;

        const content = readJson(lockPath);
        if (!content || content.token !== token) return false;

        fs.unlinkSync(lockPath);
        return true;
    }
}

// ==================== SCHEMA STORAGE ====================
class SchemaStorage {
    constructor(options = {}) {
        this.schemaDir = options.schemaDir || 'schema';
        this.version = STORAGE_VERSION;
    }

    get(name) {
        const filePath = path.join(this.schemaDir, name + '.json');
        return readJson(filePath);
    }

    set(name, schema) {
        const dir = this.schemaDir;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const filePath = path.join(dir, name + '.json');
        writeJson(filePath, schema);
        return true;
    }

    has(name) {
        const filePath = path.join(this.schemaDir, name + '.json');
        return fs.existsSync(filePath);
    }

    list() {
        if (!fs.existsSync(this.schemaDir)) return [];
        return fs.readdirSync(this.schemaDir)
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    }
}

// ==================== ISLAND STORAGE ====================
class IslandStorage {
    constructor(options = {}) {
        this.basePath = options.basePath || MODELS_PATH();
        this.version = STORAGE_VERSION;
    }

    getManifest() {
        const manifestPath = path.join(this.basePath, 'islands.json');
        const data = readJson(manifestPath) || { version: '1.0', islands: {}, loaded: [] };
        // Ensure required fields exist
        if (!data.islands) data.islands = {};
        if (!data.loaded) data.loaded = [];
        if (!data.hydrated) data.hydrated = [];
        return data;
    }

    saveManifest(manifest) {
        const manifestPath = path.join(this.basePath, 'islands.json');
        writeJson(manifestPath, manifest);
        return true;
    }

    get(name) {
        const islandPath = path.join(this.basePath, name + '.json');
        return readJson(islandPath);
    }

    set(name, data) {
        const islandPath = path.join(this.basePath, name + '.json');
        writeJson(islandPath, data);
        return true;
    }

    has(name) {
        const islandPath = path.join(this.basePath, name + '.json');
        return fs.existsSync(islandPath);
    }
}

// ==================== REPOS STORAGE ====================
class ReposStorage {
    constructor(options = {}) {
        this.reposDir = options.reposDir || MODELS_PATH() + '/repos';
        this.version = STORAGE_VERSION;
        if (!fs.existsSync(this.reposDir)) {
            fs.mkdirSync(this.reposDir, { recursive: true });
        }
    }

    _load() {
        const configPath = path.join(this.reposDir, 'config.json');
        return readJson(configPath) || { mounted: [], repos: {} };
    }

    _save(config) {
        const configPath = path.join(this.reposDir, 'config.json');
        writeJson(configPath, config);
    }

    register(name, url, options = {}) {
        const config = this._load();
        config.repos[name] = { url, ...options };
        this._save(config);
        return true;
    }

    async mount(name) {
        // WARNING: This may violate GitHub ToS if used as auto-sync database
        // See docs/reference/storage.md for GitHub ToS guidelines
        const config = this._load();
        if (!config.repos[name]) return null;
        config.mounted.push(name);
        this._save(config);
        return config.repos[name];
    }

    unmount(name) {
        const config = this._load();
        config.mounted = config.mounted.filter(n => n !== name);
        this._save(config);
        return true;
    }

    async pull(name = null) {
        // WARNING: Auto-sync may violate GitHub ToS
        // Config opt-in required: storage.autoSync
        const configStorage = getStorage('config');
        if (configStorage.get('storage.autoSync') !== true) {
            throw new errors.VantError('Auto-sync disabled. Set config storage.autoSync=true to enable.');
        }

        const config = this._load();
        const repos = name ? [name] : config.mounted;

        for (const repo of repos) {
            if (!config.repos[repo]) continue;
            // Full implementation would git clone/pull here
            audit.info('[Storage] Pull from', config.repos[repo].url);
        }

        return repos;
    }

    has(name) {
        const config = this._load();
        return !!config.repos[name];
    }

    list() {
        const config = this._load();
        return Object.keys(config.repos);
    }

    getMounted() {
        const config = this._load();
        return config.mounted;
    }
}

/**
 * RemoteStorage — FileStorage-shaped store backed by the S3-API client in
 * lib/connectors/s3.js. ONE implementation covers AWS S3, Cloudflare R2, MinIO, and
 * Backblaze B2 (all speak the S3 REST API; only endpoint shape + region vary).
 *
 * Config sources, in order: constructor options → env
 * (VANT_REMOTE_PROVIDER, VANT_REMOTE_BUCKET, VANT_REMOTE_REGION,
 * VANT_REMOTE_KEY, VANT_REMOTE_SECRET, VANT_REMOTE_PREFIX,
 * VANT_REMOTE_ENDPOINT). Credentials are NEVER echoed by remoteStatus() or
 * error paths.
 *
 * Contract deltas vs FileStorage (pinned by tests):
 * - All I/O methods are async (network store).
 * - Keys are remote-store keys; lib/remote._safeKey enforces a tighter
 *   charset than the fs (traversal/absolute/backslash refused BEFORE any
 *   network call).
 * - read() → string|null (null = 404); network/auth failures throw.
 * - list() returns store-relative keys (a remote prefix has no fs dirname);
 *   default RECURSIVE (FileStorage shallow-list is a readdir limitation,
 *   not a network contract), {recursive:false} for one-level parity.
 * - Local-only FileStorage features (WAL, mirrors, encryption-at-rest,
 *   snapshots) do not apply here; remote is a replication TARGET.
 * - Capability-gated through the same shared gate (B-2) as FileStorage;
 *   readRaw/writeRaw/deleteRaw are the explicit bypass, mirroring FileStorage.
 * - options.client injects a test double (DI point) — no network in tests.
 */
class RemoteStorage {
    constructor(options = {}) {
        this.version = STORAGE_VERSION;
        this.backend = 'remote';
        const env = process.env;
        this.provider = options.provider || env.VANT_REMOTE_PROVIDER || 's3';
        this.bucket = options.bucket || env.VANT_REMOTE_BUCKET || null;
        this.region = options.region || env.VANT_REMOTE_REGION || undefined;
        this.prefix = (options.prefix || env.VANT_REMOTE_PREFIX || '').replace(/\/+$/, '');
        this.endpoint = options.endpoint || env.VANT_REMOTE_ENDPOINT || undefined;
        this.accessKeyId = options.accessKeyId || env.VANT_REMOTE_KEY || null;
        this.secretAccessKey = options.secretAccessKey || env.VANT_REMOTE_SECRET || null;
        this.timeoutMs = options.timeoutMs;
        this._injectedClient = options.client || null;

        // Pseudo-path for metrics/debug display (never a real fs location):
        // remote://provider/bucket[/prefix]
        this.basePath = 'remote://' + this.provider + '/' + (this.bucket || '?') +
            (this.prefix ? '/' + this.prefix : '');

        // Lazy client: a misconfigured remote must not break module load or
        // unrelated factory calls — the error surfaces on first use.
        this._client = null;
        this._lazyError = null;
        if (!this.bucket || !this.accessKeyId || !this.secretAccessKey) {
            this._lazyError = 'remote storage not configured (need bucket + access key id + secret)';
        }
    }

    _getClient() {
        if (this._injectedClient) return this._injectedClient;
        if (this._lazyError) {
            throw new errors.VantError(this._lazyError, { code: 'STORAGE_REMOTE_NOT_CONFIGURED', retryable: false });
        }
        if (!this._client) {
            const remote = require('./connectors/s3');
            this._client = remote.createClient({
                provider: this.provider,
                bucket: this.bucket,
                region: this.region,
                endpoint: this.endpoint,
                prefix: this.prefix,
                accessKeyId: this.accessKeyId,
                secretAccessKey: this.secretAccessKey,
                timeoutMs: this.timeoutMs
            });
        }
        return this._client;
    }

    // Store-relative key → remote key (prefix + key).
    // HARDENING (contract symmetry with FileStorage): absolute and
    // backslash-bearing keys are refused BEFORE any mapping/network call,
    // on every path including the raw bypass.
    _remoteKey(k) {
        const s = String(k || '');
        if (s.startsWith('/') || s.includes('\\') || s.split('/').some(p => p === '.' || p === '..')) {
            throw new errors.VantError('Security: absolute/backslash/traversal remote key refused', { code: errors.CODES.SECURITY_PATH_ESCAPE, retryable: false });
        }
        return this.prefix ? this.prefix + '/' + s : s;
    }

    // Remote key → store-relative key (strip prefix; pass through unknowns)
    _fromRemoteKey(rk) {
        return this.prefix && String(rk).startsWith(this.prefix + '/')
            ? String(rk).slice(this.prefix.length + 1)
            : String(rk);
    }

    _vafCheck(k) {
        const vaf = _getVaf();
        if (vaf?.checkPathTraversal) {
            const check = vaf.checkPathTraversal(k);
            if (check.blocked) {
                throw new errors.VantError('Security: Path blocked', { code: 'VAF_PATH_BLOCKED', retryable: false });
            }
        }
    }

    async read(k) {
        _checkReadSafe();
        this._vafCheck(k);
        const _t0 = process.hrtime.bigint();
        try {
            const out = await this._getClient().get(this._remoteKey(k));
            _recordStoreOp(this.basePath, 'read', true, out ? out.length : 0, _t0);
            return out;
        } catch (e) {
            _recordStoreOp(this.basePath, 'read', false, undefined, _t0);
            throw e;
        }
    }

    // Explicit bypass (caller has validated inputs) — mirrors FileStorage.readRaw.
    async readRaw(k) {
        const _t0 = process.hrtime.bigint();
        try {
            const out = await this._getClient().get(this._remoteKey(k));
            _recordStoreOp(this.basePath, 'read', true, out ? out.length : 0, _t0, true);
            return out;
        } catch (e) {
            _recordStoreOp(this.basePath, 'read', false, undefined, _t0, true);
            throw e;
        }
    }

    async write(k, content, opts = {}) {
        _checkWriteSafe();
        this._vafCheck(k);

        let finalContent = content;
        if (opts.format && typeof content === 'object') {
            const format = _getFormat();
            finalContent = format?.serialize
                ? format.serialize(content, opts.format, opts)
                : JSON.stringify(content, null, 2);
        }
        if (typeof finalContent !== 'string' && !Buffer.isBuffer(finalContent)) {
            finalContent = String(finalContent);
        }

        const _t0 = process.hrtime.bigint();
        try {
            await this._getClient().put(this._remoteKey(k), finalContent);
            _recordStoreOp(this.basePath, 'write', true,
                typeof finalContent === 'string' ? finalContent.length : Buffer.byteLength(finalContent), _t0);
            return true;
        } catch (e) {
            _recordStoreOp(this.basePath, 'write', false, undefined, _t0);
            throw e;
        }
    }

    // Explicit bypass — mirrors FileStorage.writeRaw.
    async writeRaw(k, content) {
        const _t0 = process.hrtime.bigint();
        try {
            await this._getClient().put(this._remoteKey(k), content);
            _recordStoreOp(this.basePath, 'write', true,
                typeof content === 'string' ? content.length : Buffer.byteLength(content), _t0, true);
            return true;
        } catch (e) {
            _recordStoreOp(this.basePath, 'write', false, undefined, _t0, true);
            throw e;
        }
    }

    async has(k) {
        _checkReadSafe();
        this._vafCheck(k);
        try {
            const st = await this._getClient().stat(this._remoteKey(k));
            // Not-found is a normal has() outcome — record ok with flag in bytes slot.
            _recordStoreOp(this.basePath, 'has', true, st ? 1 : 0);
            return st !== null;
        } catch (e) {
            _recordStoreOp(this.basePath, 'has', false);
            throw e;
        }
    }

    async delete(k) {
        _checkReadSafe();
        _checkWriteSafe();
        this._vafCheck(k);
        try {
            const deleted = await this._getClient().delete(this._remoteKey(k));
            if (deleted) _emit('storage:deleted', { path: this.basePath + '/' + k, remote: true, timestamp: Date.now() });
            _recordStoreOp(this.basePath, 'delete', true);
            return deleted;
        } catch (e) {
            _recordStoreOp(this.basePath, 'delete', false);
            throw e;
        }
    }

    // Explicit bypass — mirrors FileStorage.deleteRaw.
    async deleteRaw(k) {
        const deleted = await this._getClient().delete(this._remoteKey(k));
        _recordStoreOp(this.basePath, 'delete', true);
        return deleted;
    }

    // list(): FileStorage.list's shallow one-level semantics are a local
    // readdir limitation, not a contract worth carrying over a network
    // store — remote list defaults to RECURSIVE (whole key tree under the
    // pattern's "directory"), with {recursive:false} for shallow parity.
    async list(pattern, opts = {}) {
        _checkReadSafe();
        const pat = String(pattern || '');
        let dir = '', base = '';
        if (pat === '') {
            dir = '';
        } else if (!pat.includes('/')) {
            // 'a' means "everything under a/" over the network — a bare
            // basename filter would be near-useless remotely.
            dir = pat + '/';
        } else {
            const cut = pat.lastIndexOf('/');
            dir = pat.slice(0, cut + 1);
            base = pat.slice(cut + 1).replace(/\*/g, '');
        }
        let keys;
        if (opts.recursive === false) {
            keys = (await this._getClient().list(dir)).map(r => r.key);
        } else {
            keys = await this._listRecursive(dir);
        }
        return keys
            .filter(k => !k.endsWith('/')) // CommonPrefix markers are not objects
            .map(k => this._fromRemoteKey(k))
            .filter(k => {
                if (opts.recursive === false) {
                    if (k.slice(dir.length).includes('/')) return false; // direct children only
                }
                return !base || k.slice(dir.length).split('/').pop().includes(base);
            });
    }

    async _listRecursive(sub) {
        const out = [];
        for (const r of await this._getClient().list(sub || '')) {
            if (r.key.endsWith('/')) out.push(...(await this._listRecursive(r.key)));
            else out.push(r.key);
        }
        return out;
    }

    /** Head an object → {key,size,etag,lastModified} | null (no gate — metadata only). */
    async stat(k) {
        return this._getClient().stat(this._remoteKey(k));
    }

    /** Connectivity/config summary for CLI + tests. Never includes secrets. */
    remoteStatus() {
        return {
            configured: !this._lazyError,
            provider: this.provider,
            bucket: this.bucket,
            region: this.region || null,
            prefix: this.prefix || null,
            endpoint: this.endpoint || null,
            basePath: this.basePath
        };
    }

    /**
     * Push a local FileStorage tree into this remote store.
     * files: explicit rel list, or localStore._walkRel() when omitted.
     * Returns {pushed, skipped, errors, dryRun}.
     */
    async pushFrom(localStore, opts = {}) {
        const files = opts.files || (typeof localStore._walkRel === 'function' ? localStore._walkRel() : []);
        const r = { pushed: 0, skipped: 0, errors: 0, dryRun: opts.dryRun === true };
        for (const rel of files) {
            try {
                if (opts.dryRun) { r.pushed++; continue; }
                const content = localStore.read(rel);
                if (content === null) { r.skipped++; continue; }
                await this.write(rel, content);
                r.pushed++;
            } catch (e) { r.errors++; }
        }
        return r;
    }

    /**
     * Pull remote objects into a local FileStorage store.
     * files: explicit rel list, or this.list() when omitted.
     * Returns {pulled, skipped, errors, dryRun}.
     */
    async pullTo(localStore, opts = {}) {
        const files = opts.files || (await this.list(''));
        const r = { pulled: 0, skipped: 0, errors: 0, dryRun: opts.dryRun === true };
        for (const rel of files) {
            try {
                if (opts.dryRun) { r.pulled++; continue; }
                const content = await this.read(rel);
                if (content === null) { r.skipped++; continue; }
                localStore.write(rel, content);
                r.pulled++;
            } catch (e) { r.errors++; }
        }
        return r;
    }
}

// ==================== STORAGE FACTORY ====================
const _instances = {};

function getStorage(type, options = {}) {
    // Handle invalid type gracefully
    if (!type || typeof type !== 'string') {
        return null;  // Return null instead of throwing for null/undefined
    }

    // Singleton per type
    const key = type + JSON.stringify(options);

    if (_instances[key]) {
        return _instances[key];
    }

    let instance;
    switch (type) {
        case 'file':
            instance = new FileStorage(options);
            break;
        case 'brain':
            instance = new BrainStorage(options);
            break;
        case 'vector':
            instance = new VectorStorage(options);
            break;
        case 'state':
            instance = new StateStorage(options);
            break;
        case 'config':
            instance = new ConfigStorage(options);
            break;
        case 'lock':
            instance = new LockStorage(options);
            break;
        case 'schema':
            instance = new SchemaStorage(options);
            break;
        case 'island':
            instance = new IslandStorage(options);
            break;
        case 'repos':
            instance = new ReposStorage(options);
            break;
        case 'remote':
            instance = new RemoteStorage(options);
            break;
        default:
            throw new errors.VantError('Unknown storage type: ' + type, { code: errors.CODES.STORAGE_TYPE_UNKNOWN, retryable: false });
    }

    _instances[key] = instance;
    return instance;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * List files across all brains in the stack
 * @param {string} pattern - File pattern
 * @returns {Array} Combined file list from all brains
 */
function listStack(pattern = '*') {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const files = getStorage('file').list(pattern);
            if (Array.isArray(files)) {
                files.forEach(f => {
                    results.push({ ...f, brain: brainName });
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
 * Read a file from any brain in stack
 * @param {string} path - File path
 * @param {Object} options - Options
 * @returns {string|null} File content
 */
function readStack(path, options = {}) {
    const brain = require('./brain');

    // If brain specified in options, try that first
    if (options.brain) {
        try {
            brain.pushBrain(options.brain);
            const content = getStorage('file').read(path);
            if (content !== null) {
                brain.removeBrain();
                return content;
            }
        } catch (e) {
            // Try next brain
        } finally {
            brain.removeBrain();
        }
    }

    // Otherwise search all brains in stack
    const stack = brain.getStack();
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const content = getStorage('file').read(path);
            if (content !== null) {
                brain.removeBrain();
                return content;
            }
        } catch (e) {
            // Try next brain
        } finally {
            brain.removeBrain();
        }
    }

    return null;
}

/**
 * Check if file exists in any brain in stack
 * @param {string} path - File path
 * @returns {Object} Result with brain info
 */
function existsStack(path) {
    const brain = require('./brain');
    const stack = brain.getStack();

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            if (getStorage('file').has(path)) {
                brain.removeBrain();
                return { exists: true, brain: brainName };
            }
        } catch (e) {
            // Try next brain
        } finally {
            brain.removeBrain();
        }
    }

    return { exists: false, brain: null };
}

/**
 * Get storage stats across all brains in stack
 * @returns {Object} Combined stats
 */
function getStackStats() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        totalFiles: 0,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const storage = getStorage('file');
            // Get brain path to count files
            const brainPath = brain.getBrainPath();
            const fs = require('fs');

            let fileCount = 0;
            if (fs.existsSync(brainPath)) {
                const files = fs.readdirSync(brainPath);
                fileCount = files.length;
            }

            results.byBrain[brainName] = { path: brainPath, files: fileCount };
            results.totalFiles += fileCount;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

// ==================== EXPORTS ====================
module.exports = {
    // Factory
    get: getStorage,

    // Shortcuts to FileStorage for convenience (SANS-100 style).
    // read/write/delete/list are SAFE BY DEFAULT (capability + VAF inline).
    // readRaw/writeRaw/deleteRaw/listRaw are explicit unsafe bypass for
    // the rare caller that has already validated inputs and needs to skip
    // the inline checks. readSecured/writeSecured/deleteSecured/listSecured
    // (below) are the async full-pipeline variants (sandbox+vaf+qos+escrow).
    read: (path) => getStorage('file').read(path),
    write: (path, data) => getStorage('file').write(path, data),
    delete: (path) => getStorage('file').delete(path),
    has: (path) => getStorage('file').has(path),
    list: (pattern) => getStorage('file').list(pattern),

    // v0.9.0-axolotl: explicit RAW BYPASS — RAW BY DESIGN (R-4 audit).
    // History: the P1-17 security pass removed these from the module exports,
    // but the factory shortcuts remained and in-module callers (lock.js
    // race-sensitive lock files, brain.js bootstrap window) legitimately need
    // no-op-free variants that cannot deadlock on the pipeline. Contract:
    // callers MUST have validated inputs (vaf/containment) before calling —
    // enforcement is at the call site, documented per caller. writeRaw still
    // uses atomicWrite (temp+rename).
    readRaw: (path) => getStorage('file').readRaw(path),
    writeRaw: (path, data, opts) => getStorage('file').writeRaw(path, data, opts),
    deleteRaw: (path) => getStorage('file').deleteRaw(path),
    listRaw: (pattern) => getStorage('file').listRaw(pattern),

    // Shared low-level utilities (also used by binary-artifact modules like
    // stego.js that stay on fs by design - prd-storage.md standard #7)
    atomicWrite,
    readJson,
    writeJson,
    // (P2 #27) shared fs-only atomic writer from error.js — one door for any
    // module outside the storage layer that needs crash-safe writes without
    // adding a storage dependency (cycle-safe by construction).
    atomicWriteFile: require('./primitives').atomicWriteFile,

    // (prd-storage: metrics) aggregated per-store op/bytes/error counters
    // + shared registry snapshot. In-process by design; the WAL is the
    // durable on-disk counterpart.
    getStorageMetrics,

    // (prd-storage: WAL) crash-recovery journal — class + CLI status helper
    Wal,
    getWalStatus,

    // Classes (for extension)
    FileStorage,
    BrainStorage,
    VectorStorage,
    StateStorage,
    ConfigStorage,
    LockStorage,
    SchemaStorage,
    IslandStorage,
    ReposStorage,
    RemoteStorage,

    // Version
    version: STORAGE_VERSION,

    // Framework interface
    getLayerStatus: () => ({ name: 'Storage', type: 'storage', version: STORAGE_VERSION, enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true }),

    // Multibrain Stack
    listStack,
    readStack,
    existsStack,
    getStackStats
};
