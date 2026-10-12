/**
 * Vant Era — the resumable incarnation ledger (issues #177/#178/#179).
 *
 * One record per wake: WHY this agent got up (intent), WHAT happened
 * (threads/spend/social/stones/memory line-items folded from the event
 * bus), and the one sentence the NEXT wake should start with (next).
 * Stored in the arch-A state store (WAL + atomic rename + brain lock),
 * exactly like node-registry/universe — cross-process persistence is the
 * regression class this module is BUILT to pin (#172/#173 were all
 * memory-only state that died with the process).
 *
 * House rules honored:
 * - stateStore.persist()/hydrate() shapes copied from lib/node-registry.js
 *   / lib/state/genesis-snapshot.js (the proven live patterns).
 * - Subscriber is a NO-OP when no era is open: zero behavior change to any
 *   existing subsystem pre-`era start` (#178 acceptance criterion).
 * - Fail-closed reads: a state file that EXISTS but is unreadable is a
 *   typed E_STATE_READ denial, never a silent fresh start.
 * - Checksums via ONE hash source (lib/hash) — signed rollup, keyed to the
 *   era id (the #177 checksum row).
 *
 * Lifecycle:
 *   era.start('why I woke')            → opens the era (E_ERA_ALREADY_OPEN if one is open)
 *   ... any subscribed event folds in ...
 *   era.close({ next: 'sentence' })    → compact rollup + checksum, archive, clear current
 *   era.verify(<rollupId>)             → recompute the checksum over the archived record
 *
 * Slots are scoped out deliberately to the appendix issue (#179): org/mesh
 * sign-off, horcrux auto-refresh, namescope. This file implements Phases
 * 0–2 (skeleton + subscriber + persistence) and the A4 `next` hook surface.
 *
 * Usage:
 *   const era = require('./lib/era');
 *   await era.start('QC sweep');
 *   era.current();      // in-memory view (hydrated state)
 *   await era.close({ next: 'check the market suite first' });
 */

const stateStore = require('./state-store');
const hash = require('./hash');
const encrypt = require('./encrypt');

const CURRENT_FILE = 'state/era-current.json';
const ARCHIVE_FILE = 'state/era-eras.json';

// Line-item caps per field (#178 step 5): append-only within the era, the
// rollup compacts at close. At cap, further items flip the field's
// `overflow:true` flag and are dropped — never unbounded growth.
const MAX_LINES = 250;

// Era record shape (v1): every field optional at write time, typed on read.
const ERA_V = 1;

/**
 * The event→era-field catalogue (#178 step 4). Matched by PREFIX
 * (longest prefix wins) so subsystem subtypes ride along without this map
 * listing every emission name. One place, one map — the "pull it all
 * together" contract: NO subsystem changes to write into Era.
 */
const FIELD_FOR_EVENT = {
    'brain:':        'memory',     // brain load/layer events = orientation
    'memory:':       'memory',
    'sync:':         'threads',    // brain sync work
    'node-registry:':'social',     // peer contact
    'agent:':        'threads',    // spawn/complete = work threads
    'task:':         'threads',
    'escrow:':       'spend',      // holds/releases/debits
    'market:':       'spend',
    'forum:':        'social',
    'consensus:':    'social',     // votes/deliberation
    'msg:':          'social',
    'succession:':   'stones',
    'horcrux:':      'stones',
    'universe:':     'stones',
    'audit:':        'stones',     // audit ledger anchors = onboarding stones
    'era:':          null          // never self-fold (recursion guard)
};

let _hydrated = false;
let _current = null;   // open era record (null = NO ERA OPEN → subscriber no-op)
let _archive = [];     // closed rollups, newest last; FIFO cap below
const ARCHIVE_CAP = 200;

function _hydrate() {
    if (_hydrated) return;
    _hydrated = true;
    try {
        stateStore.hydrate({
            moduleName: 'era',
            stateFile: CURRENT_FILE,
            apply: (snapshot) => {
                if (snapshot && snapshot.era && typeof snapshot.era === 'object') {
                    if (_era(snapshot.era)) _current = snapshot.era;
                }
            }
        });
    } catch (e) {
        if (e && e.code === stateStore.STATE_READ_CODE) {
            // Denial, not absence — surface loudly instead of waking blank.
            console.error('[era] current-era state unreadable — denied, not absent: ' + e.message);
            throw e;
        }
        // corrupt/unmarked falls through as fresh (hydrate already warned).
    }
    try {
        stateStore.hydrate({
            moduleName: 'era',
            stateFile: ARCHIVE_FILE,
            apply: (snapshot) => {
                if (snapshot && Array.isArray(snapshot.eras)) {
                    _archive = snapshot.eras.filter(_era).slice(-ARCHIVE_CAP);
                }
            }
        });
    } catch (e) {
        if (e && e.code === stateStore.STATE_READ_CODE) {
            console.error('[era] era archive unreadable — denied, not absent: ' + e.message);
        }
    }
    if (_current) _subscribe(); // an era survived the process boundary — resume folding
}

function _persistCurrent() {
    stateStore.persist({
        moduleName: 'era',
        stateFile: CURRENT_FILE,
        data: { era: _current }
    });
}

function _persistArchive() {
    stateStore.persist({
        moduleName: 'era',
        stateFile: ARCHIVE_FILE,
        data: { eras: _archive.slice(-ARCHIVE_CAP) }
    });
}

/** Type-check an era record (typed on read per #178 step 1). */
function _era(e) {
    return !!(e && typeof e === 'object'
        && typeof e.id === 'string' && e.id
        && typeof e.startedAt === 'number'
        && (e.closedAt === undefined || e.closedAt === null || typeof e.closedAt === 'number'));
}

function _emit(era_event, data) {
    try {
        require('./event').emit(era_event, data);
    } catch (e) { /* bus unavailable — lifecycle still returns its result */ }
}

// ==================== CHECKSUM (ONE hash source) ====================

function _stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(_stableStringify).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + _stableStringify(value[k])).join(',') + '}';
}

/** The signed part of a record: everything EXCEPT checksum. */
function _checksumPayload(record) {
    const out = {};
    for (const k of Object.keys(record).sort()) {
        if (k === 'checksum') continue;
        out[k] = record[k];
    }
    return hash.sha256(_stableStringify(out));
}

function _stampChecksum(record) {
    record.checksum = _checksumPayload(record);
    return record;
}

// ==================== CORE VERBS ====================

/**
 * Open a new era. One era is open at a time (#178: E_ERA_ALREADY_OPEN).
 * The `intent` argument is REQUIRED — an era without a why defeats the
 * whole ledger.
 */
async function start(intent, opts = {}) {
    _hydrate();
    const text = typeof intent === 'string' ? intent.trim() : '';
    if (!text) {
        return { ok: false, error: 'era start requires an intent: era.start("why this wake exists")', code: 'E_ERA_INTENT' };
    }
    if (_current) {
        return {
            ok: false,
            error: 'an era is already open (' + _current.id.slice(0, 16) + ') — close it first',
            code: 'E_ERA_ALREADY_OPEN',
            openEraId: _current.id
        };
    }
    const record = {
        v: ERA_V,
        id: 'era-' + encrypt.generateId(),
        intent: text,
        startedAt: Date.now(),
        closedAt: null,
        threads: [],
        spend: [],
        social: [],
        stones: [],
        memory: [],
        next: null,
        overflow: {}
    };
    _stampChecksum(record);
    _current = record;
    _persistCurrent();
    _subscribe();
    _emit('era:started', { id: record.id, intent: record.intent, startedAt: record.startedAt });
    return { ok: true, era: _current };
}

/** Fold one folded-verbatim line-item into the open era (subscriber + manual). */
function fold(type, data) {
    _hydrate();
    if (!_current) return null; // subscriber contract: NO-OP when no era is open
    if (typeof type !== 'string') return null;
    if (type.startsWith('era:')) return null; // never self-fold
    // Event prefixes end in ':' — the catalogue keys are regex-prefix
    // MATCHERS, not literal event names. Split on the FIRST ':', so
    // 'escrow:hold' → 'escrow', not a whole-map miss.
    let prefixHit = null;
    if (FIELD_FOR_EVENT[type] !== undefined) prefixHit = type;
    else {
        const family = type.split(':')[0] + ':';  // the catalogue keys END in ':'
        if (family in FIELD_FOR_EVENT) prefixHit = family;
    }
    if (prefixHit === null || FIELD_FOR_EVENT[prefixHit] === null) return null;
    const field = FIELD_FOR_EVENT[prefixHit];
    if (!field) return null;
    const bucket = Array.isArray(_current[field]) ? _current[field] : (_current[field] = []);
    if (bucket.length >= MAX_LINES) {
        _current.overflow[field] = true;
        _persistCurrent();
        return null;
    }
    const item = {
        type,
        at: Date.now(),
        data: (data && typeof data === 'object') ? data : { value: data === undefined ? null : data }
    };
    bucket.push(item);
    _stampChecksum(_current);
    _persistCurrent();
    _emit('era:logged', { id: _current.id, field, type, count: bucket.length });
    return true;
}

function fieldFor(type) {
    if (typeof type !== 'string') return null;
    if (FIELD_FOR_EVENT[type] !== undefined) return FIELD_FOR_EVENT[type] ?? null;
    const family = type.split(':')[0] + ':';
    return (family in FIELD_FOR_EVENT) ? (FIELD_FOR_EVENT[family] ?? null) : null;
}

/** The CURRENT era (open one) or typed absence. */
function current() {
    _hydrate();
    if (!_current) return { open: false, code: 'E_ERA_NONE' };
    return { open: true, era: _current, integrity: _checksumPayload(_current) === _current.checksum };
}

/** Close the open era: sign the rollup, archive it, clear current. */
async function close(opts = {}) {
    _hydrate();
    if (!_current) {
        return { ok: false, error: 'no era is open — nothing to close', code: 'E_ERA_NONE' };
    }
    const record = _current;
    record.closedAt = Date.now();
    if (opts.next !== undefined && opts.next !== null) {
        const nextText = String(opts.next).trim();
        if (nextText) record.next = nextText.slice(0, 400);
    }
    // Compact rollup (#178 step 5): cap-trimmed buckets + first/last types
    // + per-field counts. Line-items inside stay (contiguous first N);
    // overflow flag survives into the archive.
    const sections = ['threads', 'spend', 'social', 'stones', 'memory'];
    for (const f of sections) {
        const bucket = Array.isArray(record[f]) ? record[f] : [];
        const counts = {};
        for (const it of bucket) counts[it.type] = (counts[it.type] || 0) + 1;
        record[f] = {
            count: bucket.length,
            byType: counts,
            ...(record.overflow[f] ? { overflow: true } : {})
        };
    }
    delete record.overflow;
    _stampChecksum(record);
    _archive.push(record);
    _archive = _archive.slice(-ARCHIVE_CAP);
    _persistArchive();
    _current = null;
    // Clearing the current file ON DISK: empty snapshot, next wake is blank
    // until a new `era start` — never a resurrected era.
    stateStore.persist({ moduleName: 'era', stateFile: CURRENT_FILE, data: {} });
    _emit('era:closed', { id: record.id, checksum: record.checksum, closedAt: record.closedAt });
    // (A3) the missing hand-off event: next wake inherits the record, and
    // mesh consumers can key on era:succession even before sign-off (A2).
    _emit('era:succession', { previous: record.id, next: record.next || null, rollup: record });
    return { ok: true, rollup: record, archiveFile: ARCHIVE_FILE };
}

/** Re-verify an archived rollup's checksum by id or prefix. */
function verify(id) {
    _hydrate();
    const want = String(id || '').trim();
    if (!want) return { ok: false, error: 'verify requires an era id', code: 'E_ERA_MANIFEST' };
    const hits = _archive.filter(r => r.id === want || r.id.startsWith(want));
    if (hits.length === 0) return { ok: false, error: 'no archived era matches ' + want.slice(0, 16), code: 'E_ERA_ABSENT' };
    if (hits.length > 1) return { ok: false, error: 'ambiguous id prefix matches ' + hits.length + ' eras', code: 'E_ERA_AMBIGUOUS' };
    const r = hits[0];
    const fresh = _checksumPayload(r);
    return { ok: true, id: r.id, match: fresh === r.checksum, expected: r.checksum, actual: fresh };
}

/** List archived eras (light: id/intent/next/timestamps/integrity). */
function list() {
    _hydrate();
    return _archive.map(r => ({
        id: r.id,
        intent: r.intent,
        startedAt: r.startedAt,
        closedAt: r.closedAt,
        next: r.next || null,
        checksum: r.checksum,
        integrity: _checksumPayload(r) === r.checksum
    }));
}

// ==================== SUBSCRIBER (#178 Phase 1) ====================

let _subscribed = false;
function _subscribe() {
    if (_subscribed) return;
    _subscribed = true;
    try {
        const event = require('./event');
        for (const prefix of Object.keys(FIELD_FOR_EVENT)) {
            event.on(prefix + '*', (data) => {
                if (prefix === 'era:') return;          // never self-fold
                if (!_current) return;                  // no-op without an open era
                try { fold(prefix.slice(0, -1), data); } catch (e) { /* folding must never break the emitter */ }
            });
        }
    } catch (e) { /* bus unavailable — manual fold() still works */ }
}

// Subscriber lives from module load (the era must resume folding even for
// events the waker never runs a CLI verb for). No-op without an open era.
_hydrate();
_subscribe();

// ==================== EXPORTS ====================

module.exports = {
    FIELD_FOR_EVENT,
    MAX_LINES,
    CURRENT_FILE,
    ARCHIVE_FILE,
    start,
    fold,
    close,
    current,
    verify,
    list,
    fieldFor,
    /** Test hooks (same shape as node-registry's _resetHydration). */
    _resetHydration: () => { _hydrated = false; _current = null; _archive = []; _subscribed = false; },
    _resetSubscriber: () => { _subscribed = false; }
};
