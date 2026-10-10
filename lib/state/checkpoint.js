'use strict';

/**
 * WAL ↔ Snapshot Interplay (#151) — storage, 3/5
 * ===============================================
 *
 * The WAL grows; recovery replays an unbounded log with no fast-forward.
 * The relationship should be mechanical: SNAPSHOTS ARE LOG CHECKPOINTS.
 *
 *   - every N log entries, snapshot the state root (hash + node set),
 *   - recovery: load latest snapshot, replay only entries after it,
 *   - snapshots are content-addressed (hash of the node set), so two
 *     processes compare "same checkpoint?" with one string,
 *   - BOUNDED snapshot history (last K); the log truncates past the oldest
 *     retained snapshot.
 *
 * Storage-agnostic: the caller supplies (a) applyRecord(record) to fold a
 * log entry into state, (b) serialize()/restore(cp) for the state payload.
 * Works with lib/wal.js's journal or any append-only record source.
 *
 * Engine-parity series (storage, 3/5).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// atomic writes route through the one shared helper (the atomic-writes
// structural gate enforces this for every final-path write)
const atomicWriteFile = require('../primitives').atomicWriteFile;

function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

/** Deterministic checkpoint id: hash of the serialized state (via lib/hash.js, Wave C). */
function checkpointId(serialized) {
    return require('../hash').sha256(serialized);
}

class SnapshottedLog {
    /**
     * @param {object} opts
     * @param {string} opts.dir - directory for wal.log + snapshots/
     * @param {(record:object)=>void} opts.applyRecord - fold one log record into state
     * @param {()=>string} opts.serialize - full state → deterministic string
     * @param {(s:string)=>void} opts.restore - string → state (replaces)
     * @param {number} [opts.everyN] - snapshot interval (records), default 100
     * @param {number} [opts.keepK] - snapshot history bound, default 3
     */
    constructor(opts) {
        if (!opts || typeof opts.dir !== 'string' || !opts.dir) {
            throw _vantErr('checkpoint: dir required', 'E_CHECKPOINT_DIR');
        }
        for (const [k, t] of [['applyRecord', 'function'], ['serialize', 'function'], ['restore', 'function']]) {
            if (typeof opts[k] !== t) throw _vantErr('checkpoint: ' + k + ' required', 'E_CHECKPOINT_INPUT');
        }
        this.dir = opts.dir;
        this.logPath = path.join(this.dir, 'wal.log');
        this.snapDir = path.join(this.dir, 'snapshots');
        this._applyRecord = opts.applyRecord;
        this._serialize = opts.serialize;
        this._restore = opts.restore;
        this.everyN = opts.everyN > 0 ? opts.everyN : 100;
        this.keepK = opts.keepK > 0 ? opts.keepK : 3;
        this._seq = 0;
        this._sinceSnapshot = 0;
    }

    _ensure() {
        fs.mkdirSync(this.snapDir, { recursive: true });
    }

    _snapshotPaths() {
        try {
            return fs.readdirSync(this.snapDir)
                .filter(f => f.endsWith('.snap') && /^[0-9]+-[0-9a-f]{64}\.snap$/.test(f))
                .sort((a, b) => parseInt(a.split('-')[0], 10) - parseInt(b.split('-')[0], 10));
        } catch (e) { return []; }
    }

    /** Append one record to the log; snapshot when the interval elapses.
     * The record is folded into the LIVE state via applyRecord first — the
     * log is the source of truth and append must not leave state stale
     * (a snapshot taken here would otherwise checkpoint an old world). */
    append(record) {
        this._ensure();
        this._seq++;
        const line = JSON.stringify({ seq: this._seq, ...record }) + '\n';
        fs.appendFileSync(this.logPath, line);
        this._applyRecord(record);
        this._sinceSnapshot++;
        let snapshotted = null;
        if (this._sinceSnapshot >= this.everyN) {
            snapshotted = this.snapshot('interval(' + this.everyN + ')');
        }
        return { seq: this._seq, snapshotted };
    }

    /**
     * Take a snapshot NOW. Content-addressed: the id is the hash of the
     * serialized state, so two processes compare checkpoints with one
     * string. Deterministic boundary: the snapshot records the log seq it
     * covers, given the same log the boundary is identical.
     */
    snapshot(cause) {
        this._ensure();
        const serialized = this._serialize();
        const id = checkpointId(serialized);
        const file = path.join(this.snapDir, this._seq + '-' + id + '.snap');
        atomicWriteFile(file, JSON.stringify({
            id,
            seq: this._seq,
            cause: String(cause || '').slice(0, 120),
            ts: Date.now(),
            state: serialized
        }));
        this._sinceSnapshot = 0;
        this._pruneSnapshots();
        this._truncateLogPastOldest();
        return { id, seq: this._seq, file };
    }

    _pruneSnapshots() {
        const snaps = this._snapshotPaths();
        const excess = snaps.length - this.keepK;
        for (let i = 0; i < excess; i++) {
            try { fs.unlinkSync(path.join(this.snapDir, snaps[i])); } catch (e) { /* best effort */ }
        }
    }

    /** Log truncates past the oldest retained snapshot (bounded recovery). */
    _truncateLogPastOldest() {
        const snaps = this._snapshotPaths();
        if (snaps.length === 0) return;
        const oldestSeq = parseInt(snaps[0].split('-')[0], 10);
        try {
            const lines = fs.readFileSync(this.logPath, 'utf8').split('\n').filter(Boolean);
            const kept = lines.filter(line => {
                try { return JSON.parse(line).seq > oldestSeq; } catch (e) { return true; }
            });
            atomicWriteFile(this.logPath, kept.length ? kept.join('\n') + '\n' : '');
        } catch (e) { /* log missing = nothing to truncate */ }
    }

    /**
     * Recovery: load latest snapshot (fast-forward), replay ONLY entries
     * after it. Deterministic: same log → same boundary → same state.
     *
     * DENIAL ≠ ABSENCE (#163): an unreadable log is E_LOG_DENIED, not
     * "empty log, fresh state". Only a provably missing log starts clean.
     */
    recover() {
        this._ensure();
        const snaps = this._snapshotPaths();
        let state = null;
        let fromSeq = 0;
        if (snaps.length > 0) {
            const newest = snaps[snaps.length - 1];
            try {
                const cp = JSON.parse(fs.readFileSync(path.join(this.snapDir, newest), 'utf8'));
                this._restore(cp.state);
                state = cp.id;
                fromSeq = cp.seq;
            } catch (e) {
                throw _vantErr('checkpoint: latest snapshot unreadable — refusing fresh start: ' + e.message, 'E_SNAPSHOT_DENIED');
            }
        }
        let logLines;
        try {
            if (!fs.existsSync(this.logPath)) {
                // ABSENT: provably missing — a legit fresh start, loudly noted
                return { recovered: true, fromSnapshot: state, replayed: 0, fromSeq, freshStart: snaps.length === 0 };
            }
            logLines = fs.readFileSync(this.logPath, 'utf8');
        } catch (e) {
            throw _vantErr('checkpoint: log unreadable — DENIED, not absent (#163): ' + e.message, 'E_LOG_DENIED');
        }
        let replayed = 0;
        for (const line of logLines.split('\n').filter(Boolean)) {
            let rec;
            try { rec = JSON.parse(line); } catch (e) {
                // torn tail write: a partial LAST line is expected crash debris;
                // anything mid-log is corruption and refuses
                if (rec === undefined && line !== logLines.split('\n').filter(Boolean).slice(-1)[0]) {
                    throw _vantErr('checkpoint: corrupt log record mid-file', 'E_LOG_DENIED');
                }
                continue; // torn tail: skip
            }
            if (rec.seq <= fromSeq) continue; // covered by snapshot — fast-forwarded
            this._applyRecord(rec);
            replayed++;
        }
        return { recovered: true, fromSnapshot: state, replayed, fromSeq, freshStart: false };
    }

    /** "Are we at the same checkpoint?" — one string comparison. */
    currentCheckpointId() {
        return checkpointId(this._serialize());
    }
}

module.exports = { SnapshottedLog, checkpointId };
