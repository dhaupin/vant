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

// (pass 209 containment ruling; pass 209b simplification per owner: NO
// legacy migration — this keeper was built and contained in the same
// unreleased cycle, nothing ever shipped on the old models/leisure/ path,
// so there is nothing to migrate) The want-list is SOUL, not process
// truth — it lives INSIDE the brain: models/private/<brain>/.leisure.json
// (the .audit.json precedent: brain-scoped, dotted, runtime JSON). That
// path is inside the horcrux/backup gather walk, so a restored stone
// carries its wants; and it is under the gitignored private tree, so the
// keeper never generates sync traffic.
function _privateBase() {
    try {
        const mod = require('./brain');
        if (mod.getBrainPath) {
            // getBrainPath() is <private root>/<current brain> — the ROOT
            // is its dirname; the (possibly different, test-scoped) brain
            // name is appended below from the SAME resolver contract.
            return path.dirname(path.resolve(mod.getBrainPath()));
        }
    } catch (e) { /* fallback below */ }
    return path.join('models', 'private');
}

function _cleanBrainname(brain) {
    return _brainSafe(brain) || _brainName();
}

function _ledgerPath(brain) {
    return path.join(_privateBase(), _cleanBrainname(brain) || 'vant', '.leisure.json');
}

function _brainSafe(brain) {
    // Path-safety: only [a-z0-9_-] survives into a filename. Anything else
    // (slashes, dots, traversal) collapses to the default brain — a want
    // must never be able to escape models/private/.
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

// ---------- the autonomy gate (#196, pass 209 — kernel-driven option A) ----------
//
// Owner ruling: leisure.autoPursue — config-gated, DEFAULT OFF. The keeper
// SURFACES wants on the seams (consult-only); PURSUING them autonomously
// is a deliberate operator opt-in that still rides every protective layer
// this repo already carries:
//
//   kill switch     leisure.autoPursue (config or env alias) — default false
//   window cap      leisure.autoPursueMaxWindowMs — default 15 min per pursuit
//   daily cap       leisure.autoPursueDailyMs — default 30 min per day
//                   (usage accrues in the ledger's .auto meta; day-rolls over)
//   QoS breaker     circuit OPEN → no pursuit (qos.getCircuitStatus)
//   work precedence an open era (working) or a live tempo budget → no play
//   provider        an EXECUTABLE step provider must be attached by the
//                   runware runtime (registerAutoStepProvider) — the kernel
//                   never executes prose. The attached provider names the
//                   skills-chain entry it rides (default 'vant-skill-rest')
//                   so the chain spec (lib/skills.js chain loading) stays
//                   the single behavior source.
//   escrow          a provider declaring tokenCost must pass
//                   escrow.canSpend() before the first slice — refused
//                   otherwise with zero tokens spent (free play lane: a
//                   zero-budget agent can still pursue local, non-token
//                   steps).
//
// A refused or skipped auto-pursuit is an EVENT (leisure:auto_refused /
// leisure:auto_pursued), never an exception into the host.

const AUTO_KEYS = {
    enabled: { config: 'leisure.autoPursue',             env: 'VANT_LEISURE_AUTO_PURSUE',      dflt: false },
    window:  { config: 'leisure.autoPursueMaxWindowMs',  env: 'VANT_LEISURE_AUTO_MAX_WINDOW_MS', dflt: 15 * 60 * 1000 },
    daily:   { config: 'leisure.autoPursueDailyMs',      env: 'VANT_LEISURE_AUTO_DAILY_MS',      dflt: 30 * 60 * 1000 }
};

function _autoCfg(kind) {
    const k = AUTO_KEYS[kind];
    let v = null;
    try { v = require('./config').get(k.config, null); } catch (e) { v = null; }
    if (v === null || v === undefined || String(v).trim() === '') {
        const raw = process.env[k.env];
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') v = raw;
    }
    if (v === null || v === undefined || String(v).trim() === '') return k.dflt;
    if (typeof k.dflt === 'boolean') return /^(true|1|on|yes)$/i.test(String(v).trim());
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : k.dflt;
}

// executable-step registry for auto mode (the agent runtime attaches)
let _autoStepProvider = null;
function registerAutoStepProvider(fn, meta = {}) {
    if (typeof fn === 'function') _autoStepProvider = { fn, ...meta };
    else _autoStepProvider = null;
    return _autoStepProvider;
}

function _todayKey() {
    return new Date().toISOString().split('T')[0];
}

function _autoUsage(ledger) {
    if (!ledger.auto) ledger.auto = {};
    if (ledger.auto.day !== _todayKey()) { ledger.auto.day = _todayKey(); ledger.auto.usedMs = 0; }
    return ledger.auto;
}

/**
 * The gate + autonomous pursuit. Default OFF (silent no-op so a stock
 * idle consult costs nothing and spams nothing). Returns
 * { ok, want?, windowMs?, reason?, controller?, silent? }.
 */
function maybeAutoPursue(opts = {}) {
    const b = _brainSafe(opts.brain) || _brainName();

    // 1. kill switch (default OFF — the silent foundation)
    if (!_autoCfg('enabled')) return { ok: false, reason: 'autoPursue is OFF (set leisure.autoPursue true to opt in)', silent: true };

    // 2. empty want-list before anything else (nothing held, nothing to pursue)
    const top = suggestResolver(opts);
    if (!top) return { ok: false, reason: 'the want-list is empty', silent: true };

    // 3. executable provider (the kernel executes no prose)
    if (!_autoStepProvider || typeof _autoStepProvider.fn !== 'function') {
        return refused('no play-step provider attached - the agent runtime must register one (leisure.registerAutoStepProvider)');
    }

    // 4. QoS circuit breaker
    try {
        const st = require('./qos').getCircuitStatus();
        if (st && st.open) return refused('circuit breaker open - the host is degraded; no play now');
    } catch (e) { /* breaker unreachable = not its gate to fail on */ }

    // 5. work precedence: an open era with live intent or a running tempo budget owns the attention
    try {
        const era = require('./era').current();
        if (era && era.open) return refused('an era is open - work owns this attention');
    } catch (e) { /* era unreachable = not its gate to fail on */ }
    try {
        const live = require('./tempo').budgetActive();
        if (live) return refused('a tempo budget is already live (' + live.label + ')');
    } catch (e) { /* tempo unreachable = not its gate to fail on */ }

    // 6. escrow for token-declaring steps (free-lane steps skip)
    // 6. escrow for token-declaring steps (free-lane steps skip). The probe
    //    instance uses defaultBudget: 0 — that means ONLY identities the
    //    operator EXPLICITLY funded (a persisted escrow budget row, via
    //    escrow's setBudget/grant path) pass. The cool-then-decay helper
    //    default (1000 units for any unknown id) would let a default install
    //    grant token play silently, which is exactly the "agent runs up the
    //    operator's bill" posture this gate exists to prevent.
    if ((_autoStepProvider.tokenCost || opts.tokenCost) === true) {
        try {
            const escrow = require('./escrow');
            const probe = escrow.create ? escrow.create({ defaultBudget: 0 }) : new escrow.Escrow({ defaultBudget: 0 });
            const verdict = probe.canSpend('brain:' + b, 1);
            if (!verdict.allowed) {
                return refused('no escrow budget - token-cost play needs explicit funding (escrow.setBudget for identity brain:' + b + '); free-lane steps only');
            }
        } catch (e) {
            return refused('escrow unreachable - token-cost play refuses closed');
        }
    }

    // 7. caps: window shrink-to-fit, daily exhaustion refusal
    const capWin = _autoCfg('window');
    const capDaily = _autoCfg('daily');
    const ledger = _useLedger(b);
    const usage = _autoUsage(ledger);
    const room = capDaily - (usage.usedMs || 0);
    if (room < 60000) return refused('daily auto-pursue budget exhausted (' + capDaily + 'ms today)');
    const windowMs = Math.max(1000, Math.min(capWin, room, opts.windowMs ? parseInt(opts.windowMs, 10) : capWin));

    // 8. arm the pursuit (the same pursue seam a human invocation uses)
    //     — sliceMs shrinks with the window: tempo refuses a slice longer
    //     than its budget, so capped short windows keep sampling honestly.
    const out = pursue({
        ...opts,
        want: top.want,
        windowMs: undefined, // duration is the gate's call, not the caller's
        duration: windowMs,
        sliceMs: Math.min(120000, windowMs),
        step: _autoStepProvider.fn
    });
    if (!out.ok) return refused('pursuit failed to arm: ' + (out.error || (out.pace && out.pace.error) || 'unknown'));

    // 9. record the day-usage + ledger line (the audit trail did not stop)
    usage.usedMs = (usage.usedMs || 0) + windowMs;
    _writeLedger(b, ledger);
    _emit('leisure:auto_pursued', {
        want: out.want, windowMs, dailyUsed: usage.usedMs, dailyCap: capDaily,
        skill: _autoStepProvider.skill || null,
        chain: Array.isArray(_autoStepProvider.chain) ? _autoStepProvider.chain : null,
        stale: null,
        brain: b
    });

    return { ...out, windowMs, dailyUsedMs: usage.usedMs };

    function refused(reason) {
        _emit('leisure:auto_refused', { reason, brain: b });
        return { ok: false, reason };
    }

    function suggestResolver(_opts) {
        return suggest(_opts);
    }
}

module.exports = { want, wantsToDo, markPursued, forget, suggest, pursue, consultBreath, dreamReview, status, maybeAutoPursue, registerAutoStepProvider, _ledgerPath };
