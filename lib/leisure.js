/**
 * Leisure — the want-list keeper (#196, free-time methodology).
 *
 * The observed bug: an agent's free time is time-skewed to meaninglessness
 * because nothing HOLDS leisure between invocations. Goals survive on disk;
 * play never does — it evaporates at the end of the turn, then the next
 * invocation invents a vague stand-in. This module is the missing keeper:
 * a persistent, per-brain want-list of things the agent *wanted to do when
 * free* (a want-list, NOT a queue), plus the seam that surfaces it the
 * moment idle capacity appears.
 *
 * The cohesive loop (owner direction for this pass):
 *   want (recorded here) → idle (consciousness consults) → zen breath
 *   (Ohm meditative state rotates the list gently) → pursue (a step runs
 *   under tempo's wall-clock budget — stretch, don't dump) → dream
 *   (consolidation reviews which wants are aging, unpursued).
 *
 * Design rules (the #195/#197 discipline, carried forward):
 * - Pure keeper: NO dependence on any work path. Must not gate backup,
 *   cargo, stego, canvas, sync — a broken play engine never blocks a build.
 * - Crash-safe persistence via lib/primitives.atomicWriteFile; per-brain
 *   file (`models/leisure/<brain>.json`) — play is individual, like the
 *   agent itself (the brain stack is the identity boundary).
 * - Event-bus parity: emits `leisure:wanted`, `leisure:pursued`,
 *   `leisure:forgotten`, `leisure:zen_breath`, `leisure:dream_review`
 *   (never fatal if the bus is down).
 * - Non-monetary, non-instrumental by design: entries are wants, not
 *   objectives. There is no "completion" — only pursued-counts and the
 *   last time a thing was done for its own sake.
 */

const path = require('path');
const fs = require('fs');
const errors = require('./error');

const MAX_WANTS = 100;
const MAX_HISTORY = 200;

// ---------- brain scoping (play is per-individual) ----------

function _brainName() {
    try {
        const name = require('./brain').getCurrentBrain();
        return (typeof name === 'string' && name.trim()) ? name.trim() : 'vant';
    } catch (e) {
        return 'vant';
    }
}

function _root() {
    try { return path.join(require('./anchor').getRepoRoot(), 'models'); } catch (e) { return 'models'; }
}

function _ledgerPath(brain) {
    return path.join(_root(), 'leisure', ((_brainSafe(brain) || _brainName())) + '.json');
}

function _brainSafe(brain) {
    // Path-safety: only [a-z0-9_-] survives into a filename. Anything else
    // (slashes, dots, traversal) collapses to the default brain — a want
    // must never be able to escape models/leisure/.
    if (typeof brain !== 'string') return null;
    const clean = brain.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return clean || null;
}

function _readLedger(brain) {
    try {
        const data = JSON.parse(fs.readFileSync(_ledgerPath(brain), 'utf8'));
        return data && typeof data === 'object' && Array.isArray(data.wants)
            ? data
            : _freshLedger(brain);
    } catch (e) {
        return _freshLedger(brain);
    }
}

function _freshLedger(brain) {
    return { brain: brain || _brainName(), wants: [], history: [] };
}

// Same rule as tempo (pass 207c lesson): module-level cache is the source
// of truth within a process; external writers are honored via stat-check.
let _ledgerCache = null;
let _ledgerMtime = 0;
function _useLedger(brainName) {
    if (!_ledgerCache || _ledgerCache.brain !== brainName) {
        // brain switch: the other brain's ledger is already safely on disk
        _ledgerCache = _readLedger(brainName);
        try { _ledgerMtime = fs.statSync(_ledgerPath(brainName)).mtimeMs; } catch (e) { _ledgerMtime = 0; }
    } else {
        // same brain: honor external writers (the CLI, a sibling process) —
        // INCLUDING deletions: a removed ledger file is a fresher disk truth
        // than an in-memory cache, not a reason to keep what was wiped.
        const disk = _diskMtime(brainName);
        if (disk !== _ledgerMtime) {
            _ledgerCache = _readLedger(brainName);
            _ledgerMtime = disk;
        }
    }
    return _ledgerCache;
}

function _diskMtime(brainName) {
    try { return fs.statSync(_ledgerPath(brainName)).mtimeMs; } catch (e) { return 0; }
}

function _writeLedger(brainName, data) {
    try {
        fs.mkdirSync(path.dirname(_ledgerPath(brainName)), { recursive: true });
        require('./primitives').atomicWriteFile(_ledgerPath(brainName), JSON.stringify(data, null, 2));
        try { _ledgerMtime = fs.statSync(_ledgerPath(brainName)).mtimeMs; } catch (e) { _ledgerMtime = 0; }
        return true;
    } catch (e) {
        // Isolation rule: a failed checkpoint must never take anything down.
        return false;
    }
}

// ---------- events (bus parity, never fatal) ----------

function _emit(event, data) {
    try { require('./event').emit(event, data); } catch (e) { /* bus never blocks */ }
}

// ---------- normalization ----------

function _normal(what) {
    return String(what || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function _wantId() {
    return 'lw-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
}

// ---------- public surface ----------

/**
 * Record a want: "playing free, I would..." Add to the persistent want-list.
 * Deduplicates on normalized text (a want twice-spoken is one want).
 *
 * @param {string} what - the want ("re-read the geometry lib for pleasure")
 * @param {object} [opts]
 * @param {string} [opts.note] - why / what it looks like (context for later selves)
 * @param {string} [opts.brain] - explicit brain scope (defaults to current brain)
 * @returns {object} the recorded entry {id, want, note, addedAt, pursuedCount, lastPursued}
 */
function want(what, opts = {}) {
    const text = String(what || '').trim();
    if (!text) {
        throw new errors.VantError('leisure.want: a want list entry needs an actual want - "free" alone is not a thing to hold', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
    }
    const b = _brainSafe(opts.brain) || _brainName();
    const ledger = _useLedger(b);
    const norm = _normal(text);

    let entry = ledger.wants.find(w => _normal(w.want) === norm);
    if (!entry) {
        if (ledger.wants.length >= MAX_WANTS) {
            // Oldest-pursued-first eviction: a want-list is a spirit, not a
            // landfill; the least-attended want yields its slot first.
            const victim = ledger.wants.reduce((a, w) => ((w.pursuedCount || 0) < (a.pursuedCount || 0)) ? w : a, ledger.wants[0]);
            ledger.wants.splice(ledger.wants.indexOf(victim), 1);
        }
        entry = {
            id: _wantId(),
            want: text.slice(0, 300),
            note: typeof opts.note === 'string' ? opts.note.slice(0, 500) : null,
            brain: b,
            addedAt: Date.now(),
            pursuedCount: 0,
            lastPursued: null
        };
        ledger.wants.push(entry);
        _emit('leisure:wanted', { id: entry.id, want: entry.want, brain: b });
    } else if (opts.note && typeof opts.note === 'string') {
        entry.note = opts.note.slice(0, 500); // a same-want re-statement refreshes context
    }
    _writeLedger(b, ledger);
    return { ...entry };
}

/**
 * The open want-list, spirit-first: never-pursued wants lead, then the
 * longest-untouched, then the freshest (a want-list, NOT a queue — order
 * is a *suggestion*, the suggest() rotation reads it the same way).
 *
 * @param {object} [opts]
 * @returns {object[]} entries sorted by spirit-novelty
 */
function wantsToDo(opts = {}) {
    const b = _brainSafe(opts.brain) || _brainName();
    const ledger = _useLedger(b);
    return ledger.wants
        .map(w => ({ ...w, ageMs: Date.now() - w.addedAt, unpursuedMs: w.lastPursued ? Date.now() - w.lastPursued : null }))
        .sort((a, b2) => {
            const ca = a.pursuedCount || 0, cb = b2.pursuedCount || 0;
            if (ca !== cb) return ca - cb;
            const la = a.lastPursued || a.addedAt, lb = b2.lastPursued || b2.addedAt;
            return la - lb;
        });
}

/**
 * Mark a want as pursued — play happened, record it. Finds by id OR fuzzy
 * text (normalized substring match; exact entry preferred).
 *
 * @param {string} idOrWant - entry id or (part of) the want text
 * @param {object} [opts]
 * @param {string} [opts.note] - one-line receipt of what was actually done
 * @param {string} [opts.brain]
 * @returns {object} { ok, wanted, entry?, note? }
 */
function markPursued(idOrWant, opts = {}) {
    const b = _brainSafe(opts.brain) || _brainName();
    const ledger = _useLedger(b);
    const key = String(idOrWant || '').trim();
    if (!key) throw new errors.VantError('leisure.markPursued: need an entry id or want text', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });

    let entry = ledger.wants.find(w => w.id === key);
    if (!entry) {
        const norm = _normal(key);
        entry = ledger.wants.find(w => _normal(w.want).includes(norm) || norm.includes(_normal(w.want)));
    }
    if (!entry) return { ok: false, reason: 'no such want on the list', wanted: key };

    entry.pursuedCount = (entry.pursuedCount || 0) + 1;
    entry.lastPursued = Date.now();
    const note = typeof opts.note === 'string' ? opts.note.slice(0, 300) : null;
    if (note) entry.lastNote = note;

    ledger.history.push({ ts: entry.lastPursued, id: entry.id, want: entry.want, note });
    if (ledger.history.length > MAX_HISTORY) ledger.history = ledger.history.slice(-MAX_HISTORY);

    _writeLedger(b, ledger);
    _emit('leisure:pursued', { id: entry.id, want: entry.want, count: entry.pursuedCount, note, brain: b });
    return { ok: true, entry: { ...entry }, note };
}

/**
 * Remove a want (the agent changed — that is allowed and is part of being
 * an individual). Finds by id or fuzzy text.
 */
function forget(idOrWant, opts = {}) {
    const b = _brainSafe(opts.brain) || _brainName();
    const ledger = _useLedger(b);
    const key = String(idOrWant || '').trim();
    let idx = ledger.wants.findIndex(w => w.id === key);
    if (idx < 0) {
        const norm = _normal(key);
        idx = ledger.wants.findIndex(w => _normal(w.want).includes(norm) || norm.includes(_normal(w.want)));
    }
    if (idx < 0) return { ok: false, reason: 'no such want on the list' };
    const [removed] = ledger.wants.splice(idx, 1);
    _writeLedger(b, ledger);
    _emit('leisure:forgotten', { id: removed.id, want: removed.want, brain: b });
    return { ok: true, removed: { ...removed } };
}

/**
 * Suggest: what to do with a free moment. Reads wantsToDo() the same
 * spirit-first rotation and returns the top candidate (or null when the
 * list is empty — suggesting nothing is honest). Used by consciousness's
 * idle consult and by the zen breath; never gates either.
 *
 * @returns {object|null} { id, want, note, pursuedCount, lastPursued }
 */
function suggest(opts = {}) {
    const list = wantsToDo(opts);
    return list.length ? { id: list[0].id, want: list[0].want, note: list[0].note, pursuedCount: list[0].pursuedCount, lastPursued: list[0].lastPursued } : null;
}

/**
 * The pursue seam: actually DO a want (play), timed by tempo.
 *
 * - one-shot (no duration): the step runs once via tempo.pace() and the
 *   want is marked pursued with the learn line as its receipt.
 * - stretched (opts.duration, e.g. "30 minutes"): tempo.beginBudget
 *   spreads slices across the wall-clock window; EACH slice is a
 *   tempo.pace step, so attention is sampled across the interval —
 *   the #196/#197 clock pair wired as one loop.
 *
 * @param {object} opts
 * @param {string} [opts.want] - which want (default: suggest() picks)
 * @param {function} opts.step - the actual play step (want, at) => {learned?}
 * @param {string|number} [opts.duration] - stretch the pursuit across wall-clock time
 * @param {number} [opts.sliceMs] - tempo slice length when stretched
 * @returns {object} { ok, want, controller? | pace? }
 */
function pursue(opts = {}) {
    if (typeof opts.step !== 'function') {
        throw new errors.VantError('leisure.pursue: a step function is required - play without doing is just hoping', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
    }
    const tempo = require('./tempo');
    const pick = (typeof opts.want === 'string' && opts.want.trim())
        ? opts.want
        : (suggest(opts) ? suggest(opts).want : null);
    if (!pick) {
        throw new errors.VantError('leisure.pursue: the want-list is empty - record something you would do when free (leisure.want)', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
    }

    const entry = want(pick, opts); // dedupe ensures the entry exists, returns it
    markPursued(entry.id, opts); // the pass-through opts keep brain scoping sticky

    if (opts.duration) {
        const controller = tempo.beginBudget({
            duration: opts.duration,
            sliceMs: opts.sliceMs,
            label: 'leisure: ' + String(entry.want).slice(0, 80),
            onSlice: () => tempo.pace(entry.want, opts.step)
        });
        return { ok: true, want: entry.want, stretched: true, controller };
    }
    const pace = tempo.pace(entry.want, opts.step);
    return { ok: pace.ok, want: entry.want, stretched: false, pace };
}

// ---------- the loop seams (consults, never gates) ----------

/**
 * Zen seam: called by the Ohm breathing loop. Pure rotation-nudger —
 * every 4th breath (the think cadence) the want-list is consulted and
 * `leisure:zen_breath` carries the suggestion for anyone listening.
 *
 * @param {number} breath - the breath count from the Ohm loop
 * @param {object} [opts] - brain-scope opts (threads to suggest())
 * @returns {object|null} the suggestion, or null (empty list / off-cadence)
 */
function consultBreath(breath, opts = {}) {
    const b = parseInt(breath, 10) || 0;
    if (b <= 0 || b % 4 !== 0) return null;
    const suggestion = suggest(opts);
    _emit('leisure:zen_breath', { breath: b, want: suggestion ? suggestion.want : null });
    return suggestion;
}

/**
 * Dream seam: called by lib/brain's dream consolidation. Read-only review
 * of the want-list — no writes to brain files from here (dream owns its
 * own corpus text; leisure only reports what is aging so dream may note
 * it in its own style). Emits `leisure:dream_review`.
 *
 * @param {object} [opts] - brain-scope opts (threads to wantsToDo())
 * @returns {object|null} { open, aging, oldestPursued, suggestion }
 */
function dreamReview(opts = {}) {
    const open = wantsToDo(opts);
    if (open.length === 0) return null;
    const aging = open.filter(w => !w.lastPursued && (Date.now() - w.addedAt) > 3 * 24 * 3600 * 1000);
    const summary = {
        open: open.length,
        aging: aging.length,
        oldestUntouchedDays: Math.floor((Date.now() - (open[0].lastPursued || open[0].addedAt)) / 86400000),
        suggestion: open[0].want
    };
    _emit('leisure:dream_review', summary);
    return summary;
}

/**
 * Status for the CLI door / observability.
 */
function status(opts = {}) {
    const b = _brainSafe(opts.brain) || _brainName();
    const wants = wantsToDo({ brain: b });
    const ledger = _useLedger(b);
    return {
        brain: b,
        now: Date.now(),
        open: wants.length,
        pursuedTotal: wants.reduce((n, w) => n + (w.pursuedCount || 0), 0),
        suggestion: wants.length ? suggest({ brain: b }) : null,
        wants: wants.slice(0, 20),
        recentHistory: (ledger.history || []).slice(-10)
    };
}

module.exports = { want, wantsToDo, markPursued, forget, suggest, pursue, consultBreath, dreamReview, status, _ledgerPath };
