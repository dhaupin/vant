// Extracted verbatim from lib/storage.js (Wave D split — factory lib/storage.js re-exports). Requires flow through lib/storage/shared.js so the SECURITY PLUMBING stays single-source.
'use strict';
const _ = require('./shared');
const { fs, path, sudo, errors, metrics, STORAGE_VERSION, _recordStoreOp, _getVaf, _getPipeline, _getFormat, _checkWriteSafe, _checkReadSafe, _emit, atomicWrite, readJson, writeJson, Wal } = require('./shared');

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
        // 0.8.6: SECURE BY DEFAULT. Capability check inline before
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
        // 0.8.6: explicit bypass. Caller asserts they have
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
        // 0.8.6: SECURE BY DEFAULT. Capability check inline.
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
        // 0.8.6: SECURE BY DEFAULT.
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
        // 0.8.6: SECURE BY DEFAULT.
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
            if (!Array.isArray(parsed.files)) throw new errors.VantError('manifest.files missing', { code: 'STORAGE_SNAPSHOT_CORRUPT', retryable: false });
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

    // ==================== 0.8.6 RAW (UNSAFE) BYPASS ====================
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

    // ==================== 0.8.6 PIPELINE-BACKED VARIANTS ====================
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


module.exports = { FileStorage: FileStorage };
