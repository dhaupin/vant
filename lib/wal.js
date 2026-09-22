/**
 * Vant WAL — write-ahead intent journal (prd-storage: crash recovery)
 *
 * Per-store intent journal for FileStorage write/delete operations. Before a
 * mutation lands, an intent record is appended (append-only, fsync'd); after
 * it lands, a matching DONE record is appended. On the next store open the
 * journal is replayed: an intent with no DONE and no ABORT whose target file
 * is OLDER than the intent (or missing) is re-applied; a target newer than
 * the intent means the write fully landed before the crash — the record is
 * marked done and dropped.
 *
 * Layout (inside the store's basePath, fully contained):
 *   <basePath>/.wal/            journal dir
 *   <basePath>/.wal/wal.log     one JSON record per line
 *   <basePath>/.wal/blobs/      spilled intent blobs (sha256-named)
 *
 * Record:
 *   { seq, op:'write'|'delete', file, ts,
 *     blob?:'sha256hex', inline?:string, done?:bool, abort?:bool }
 *
 * Contract:
 *   - FileStorage ops NEVER throw because of WAL activity: every public
 *     entry point swallows its own errors (best-effort durability aid).
 *   - Replay rule (idempotent): re-apply only when target mtime < intent ts
 *     (or target missing). A newer target = write landed; drop the record.
 *   - ABORT tombstones mark an intent as rolled back; replay skips them.
 *   - delete-intent replay re-deletes a resurrected file (mtime check skips
 *     files deleted before the intent landed).
 *   - Compaction: DONE/ABORT-only journals are truncated to zero lines.
 *
 * Enable per store with `wal: true` or env VANT_WAL=1.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WAL_DIR = '.wal';
const LOG_FILE = 'wal.log';
const BLOBS_DIR = 'blobs';
const MAX_INLINE = 64 * 1024;      // spill larger payloads to .wal/blobs
const MAX_LOG_BYTES = 4 * 1024 * 1024; // compact above this
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._\/ -]{0,200}$/; // relative store paths only
const BLOB_RE = /^[0-9a-f]{64}$/; // spilled blob names are sha256 hex only

class Wal {
    constructor(basePath, options = {}) {
        this.basePath = basePath;
        this.enabled = options.enabled === true;
        this.dir = path.join(basePath, WAL_DIR);
        this.logPath = path.join(this.dir, LOG_FILE);
        this.blobsDir = path.join(this.dir, BLOBS_DIR);
        this._seq = 0;
        this._replayed = false;
    }

    /** Resolve a store-relative path; refuses escaping or absolute paths. */
    _resolveRel(file) {
        if (typeof file !== 'string' || !NAME_RE.test(file) || path.isAbsolute(file)) return null;
        const full = path.resolve(this.basePath, file);
        const rel = path.relative(this.basePath, full);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
        return rel;
    }

    _ensureDirs() {
        fs.mkdirSync(this.dir, { recursive: true });
        fs.mkdirSync(this.blobsDir, { recursive: true });
    }

    _append(record) {
        this._ensureDirs();
        const fd = fs.openSync(this.logPath, 'a');
        try {
            fs.writeSync(fd, JSON.stringify(record) + '\n');
            try { fs.fsyncSync(fd); } catch (e) { /* best effort */ }
        } finally {
            fs.closeSync(fd);
        }
    }

    _nextSeq() { return ++this._seq; }

    /**
     * Replay the journal at (re)open. Idempotent via the mtime rule:
     * re-apply only when the target is missing or older than the intent.
     * Returns { scanned, replayed, aborted, dropped } (null when disabled).
     */
    replay(applyFn) {
        if (!this.enabled || this._replayed) return null;
        this._replayed = true;
        const stats = { scanned: 0, replayed: 0, aborted: 0, dropped: 0 };
        try {
            if (!fs.existsSync(this.logPath)) return stats;

            const lines = fs.readFileSync(this.logPath, 'utf8').split('\n').filter(Boolean);
            // last state per rel path
            const last = new Map();
            for (const line of lines) {
                let rec;
                try { rec = JSON.parse(line); } catch (e) { stats.dropped++; continue; }
                // done/abort markers carry no `op` — they still participate
                // in per-file last-state resolution (they supersede intents)
                if (!rec || typeof rec.file !== 'string' || (typeof rec.op !== 'string' && !rec.done && !rec.abort && !rec.resolved)) {
                    stats.dropped++;
                    continue;
                }
                last.set(rec.file, rec);
            }

            for (const rec of last.values()) {
                stats.scanned++;
                if (rec.abort) { stats.aborted++; continue; }
                // Journal contents are data, not trust: rel-path containment is
                // re-validated here (a crafted wal.log must not escape basePath),
                // and blob names must be bare sha256 hex (no `..`/absolute reads).
                const rel = this._resolveRel(rec.file);
                if (!rel) { stats.dropped++; continue; }
                if (rec.blob !== undefined && !BLOB_RE.test(String(rec.blob))) { stats.dropped++; continue; }
                const target = path.resolve(this.basePath, rel);
                let targetMtime = 0;
                try { targetMtime = fs.statSync(target).mtimeMs; } catch (e) { targetMtime = 0; }
                const intentTs = Number(rec.ts) || 0;
                if (targetMtime > intentTs + 1) {
                    stats.dropped++; // landed before crash
                    this._append({ seq: rec.seq, file: rel, resolved: true, ts: Date.now() });
                    continue;
                }
                if (rec.done) { stats.dropped++; continue; } // explicit ack
                try {
                    const payload = rec.blob
                        ? fs.readFileSync(path.join(this.blobsDir, rec.blob), 'utf8')
                        : (rec.inline !== undefined ? rec.inline : undefined);
                    applyFn(rec.op, rel, payload);
                    stats.replayed++;
                    // resolved marker (append-only, crash-safe): status/compaction
                    // and future replays see this intent as handled
                    this._append({ seq: rec.seq, file: rel, resolved: true, ts: Date.now() });
                } catch (e) {
                    stats.dropped++; // missing blob etc. — never throw out of replay
                }
            }
            this.compact();
        } catch (e) {
            // journal unreadable — the store still opens
        }
        return stats;
    }

    /** Before a mutation lands: append intent (spilling large payloads). */
    intent(op, file, content) {
        try {
            if (!this.enabled) return null;
            const rel = this._resolveRel(file);
            if (!rel) return null;
            const rec = { seq: this._nextSeq(), op, file: rel, ts: Date.now() };
            if (op === 'write') {
                const s = typeof content === 'string' ? content : JSON.stringify(content);
                if (typeof s !== 'string') { rec.inline = null; }
                else if (s.length <= MAX_INLINE) { rec.inline = s; }
                else {
                    this._ensureDirs();
                    const digest = crypto.createHash('sha256').update(s).digest('hex');
                    fs.writeFileSync(path.join(this.blobsDir, digest), s);
                    rec.blob = digest;
                }
            }
            this._append(rec);
            return rec.seq;
        } catch (e) { return null; }
    }    /** After the mutation landed: append DONE ack (empty record, compacts away).
     * Carries the file so per-file last-state scans (status/compaction) work. */
    done(seq, file) {
        try {
            if (!this.enabled || !seq) return false;
            this._append({ seq, done: true, file, ts: Date.now() });
            return true;
        } catch (e) { return false;
        }
    }    

    /** Mark an intent as rolled back; replay skips it. Carries the file. */
    abort(seq, file) {
        try {
            if (!this.enabled || !seq) return false;
            this._append({ seq, abort: true, file, ts: Date.now() });
            return true;
        } catch (e) { return false;
        }
    }

    /** Drop the journal entirely (after a verified-clean replay or explicit reset). */
    reset() {
        try {
            if (!fs.existsSync(this.dir)) return true;
            fs.rmSync(this.dir, { recursive: true, force: true });
            return true;
        } catch (e) { return false; }
    }

    /** Truncate the log when it is DONE/ABORT-only or oversized. */
    compact() {
        try {
            if (!fs.existsSync(this.logPath)) return { compacted: false, reason: 'missing' };
            const size = fs.statSync(this.logPath).size;
            if (size <= MAX_LOG_BYTES) return { compacted: false, reason: 'under-limit' };

            const lines = fs.readFileSync(this.logPath, 'utf8').split('\n').filter(Boolean);
            // keep only the latest record per file when ALL of them are ack'd
            const last = new Map();
            for (const line of lines) {
                try {
                    const rec = JSON.parse(line);
                    if (rec && typeof rec.file === 'string') last.set(rec.file, rec);
                } catch (e) { /* skip corrupt */ }
            }
            const pending = [...last.values()].filter(r => !r.done && !r.abort);
            if (pending.length === 0) {
                fs.writeFileSync(this.logPath, '');
                return { compacted: true, kept: 0 };
            }
            return { compacted: false, reason: 'pending-intents', pending: pending.length };
        } catch (e) {
            return { compacted: false, reason: 'error' };
        }
    }

    /** Best-effort fsync of the journal file (called after acks). */
    sync() {
        try {
            if (!this.enabled || !fs.existsSync(this.logPath)) return false;
            const fd = fs.openSync(this.logPath, 'r+');
            try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
            return true;
        } catch (e) { return false; }
    }
}

module.exports = { Wal, WAL_DIR, MAX_INLINE, MAX_LOG_BYTES, NAME_RE };
