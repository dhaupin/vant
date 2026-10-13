/**
 * Tempo — the time-dilation keeper (#197, loop first).
 *
 * The observed bug: an agent's experienced time is invocation-bound while
 * the human partner lives on the epoch tick. "Spend 30 minutes exploring"
 * collapses into one burst at T+0 because NOTHING says otherwise. This
 * module is the reconciliation: an owner-stated wall-clock budget becomes
 * N sampled exploration slices spread ACROSS the interval —
 * explore → learn → note → re-enter — until the epoch catches up.
 *
 * Ship order per the issue's hybrid proposal: this pass ships the LOOP
 * (fixed-slice floor, no formula); the dilation constant D is tuned later
 * from per-slice telemetry receipts once a few hundred slices exist.
 *
 * Design rules (the crash-has-no-blog contract, #195 discipline):
 * - Pure keeper: NO dependence on any work path. Must not gate backup,
 *   cargo, stego, canvas, sync — a broken play engine never blocks a
 *   build (the backup/cargo isolation rule).
 * - Crash-safe persistence via lib/primitives.atomicWriteFile (hidden
 *   same-dir temp + rename); resumable: a budget on disk re-arms on load
 *   with its REMAINING window, never restarting the clock from T+0.
 * - Determinism receipts: every slice appends one line to the ledger —
 *   a "30 min" budget ends with an auditable trail of what each slice did.
 * - Event-bus parity: emits `tempo:budget-start`, `tempo:slice`,
 *   `tempo:budget-end`, `tempo:budget-cancelled` (non-fatal if the bus is
 *   down).
 * - Agents may end early ONLY through an explicit `end(reason)` — the
 *   default drains the full window (issue open-question #3 provision:
 *   resumable persistence means an agent can also just checkpoint and
 *   come back).
 */

const path = require('path');
const fs = require('fs');
const errors = require('./error');

// ---------- parseDuration: owner phrasing → epoch delta ----------

/**
 * Parse an owner-stated duration into milliseconds. Accepts the lib/cron
 * interval grammar ("30m", "90s", "2h"), plain epoch ms integers, and the
 * natural owner phrasings ("30 min", "30 minutes", "2 hours", "1h 30m",
 * "an hour"/"half an hour").
 *
 * @param {string|number} spec - duration spec (min sensibility 5s, max 24h)
 * @returns {number} epoch delta in ms (or throws — owner intent must not be guessed)
 */
function parseDuration(spec, minMs) {
    const s = String(spec).trim().toLowerCase();
    const MIN = Math.max(1000, minMs || 5000), MAX = 24 * 3600 * 1000;
    if (/^\d+$/.test(s)) {
        const n = parseInt(s, 10);
        return clampDuration(n, Math.min(MIN, 1000), MAX, 'epoch ms');
    }

    // natural phrases first (avoid "1h 30m" collisions later)
    if (s === 'an hour' || s === '1 hour' || s === 'one hour') return 3600000;
    if (s === 'half an hour' || s === '30 min' || s === '30 minutes') return 30 * 60 * 1000;
    if (s === 'a minute' || s === '1 minute' || s === 'one minute') return 60000;

    // compound phrasing: "1h 30m", "2 hours 15 minutes", "5m 30s"
    const token = /(\d+)\s*(h|hour|hours|m|minute|minutes|min|mins|s|sec|second|seconds)\b/g;
    let ms = 0, matched = false, m;
    while ((m = token.exec(s)) !== null) {
        const n = parseInt(m[1], 10);
        const unit = m[2][0];
        ms += unit === 'h' ? n * 3600000 : unit === 'm' ? n * 60000 : n * 1000;
        matched = true;
    }
    if (matched) return clampDuration(ms, MIN, MAX, s);

    throw new errors.VantError('tempo: cannot parse duration "' + String(spec) + '" - try "30 minutes", "1h 30m", "90s", or epoch ms', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
}

function clampDuration(ms, min, max, what) {
    if (ms < min) throw new errors.VantError('tempo: budget too small (' + what + ' => ' + ms + 'ms; minimum ' + (min / 1000) + 's)', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
    if (ms > max) throw new errors.VantError('tempo: budget too large (' + what + ' => ' + ms + 'ms; maximum 24h)', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
    return ms;
}

// ---------- persistence (crash-safe, resumable, isolated) ----------

function _ledgerPath() {
    // The ledger lives OUTSIDE the brain stack: time accounting is process
    // truth, not brain content — and it must never piggyback on any work
    // path's storage chain.
    let root = 'models';
    try { root = path.join(require('./anchor').getRepoRoot(), 'models'); } catch (e) { /* cwd-relative */ }
    return path.join(root, 'tempo', 'ledger.json');
}

function _readLedger() {
    try {
        const raw = fs.readFileSync(_ledgerPath(), 'utf8');
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : { budgets: {}, receipts: [] };
    } catch (e) {
        return { budgets: {}, receipts: [] };
    }
}
let _ledgerMtime = 0;
function _writeLedger(data) {
    try {
        fs.mkdirSync(path.dirname(_ledgerPath()), { recursive: true });
        require('./primitives').atomicWriteFile(_ledgerPath(), JSON.stringify(data, null, 2));
        // the writer's data IS the ledger now — same-source truth (a cache
        // left behind was the reconcile pin's residual bug)
        if (data && typeof data === 'object' && data.budgets) {
            _ledgerCache = data;
            if (!_ledgerCache.receipts) _ledgerCache.receipts = [];
        }
        try { _ledgerMtime = fs.statSync(_ledgerPath()).mtimeMs; } catch (e) { _ledgerMtime = 0; }
        return true;
    } catch (e) {
        // Isolation rule: a failed checkpoint must never take anything down.
        return false;
    }
}

// (pass 207c fix) THE ledger lives in one module-level cache: every
// mutation (slice receipt, state flip) happens on the SAME object, so a
// checkpoint that re-reads disk can never silently drop what the just-
// fired slice appended (caught live: 6s/2s budget drained with ZERO slice
// receipts because every tick posted a fresh-read write).
//
// Cross-process truth (pass 207b): other writers DO touch the ledger
// (the `vant tempo end` CLI, a sibling process). `_ledger()` stat-checks
// before trusting the cache — an on-disk mtime change re-reads, so the
// cache is only ever invalid WITHIN a single process's own write window.
let _ledgerCache = null;
function _diskMtime() {
    try { return fs.statSync(_ledgerPath()).mtimeMs; } catch (e) { return 0; }
}
function _ledger() {
    const disk = _diskMtime();
    if (!_ledgerCache || disk !== _ledgerMtime) {
        const fresh = _readLedger();
        if (!_ledgerCache || !_ledgerCache.budgets) {
            _ledgerCache = fresh; // cold start — nothing to preserve
        } else {
            // external write arrived: disk is the newer process-level truth,
            // but in-process budgets that own their state keep it (the disk
            // copy they own has already been written by us at each step).
            for (const id of Object.keys(fresh.budgets || {})) {
                const mine = _ledgerCache.budgets[id];
                if (mine && mine.state === 'active' && (!fresh.budgets[id] || fresh.budgets[id].state === 'active')) {
                    fresh.budgets[id] = mine;
                }
            }
            for (const id of Object.keys(_ledgerCache.budgets)) {
                if (!fresh.budgets[id]) fresh.budgets[id] = _ledgerCache.budgets[id];
            }
            _ledgerCache = fresh;
        }
        _ledgerMtime = disk;
    }
    if (!_ledgerCache.budgets) _ledgerCache.budgets = {};
    if (!_ledgerCache.receipts) _ledgerCache.receipts = [];
    return _ledgerCache;
}

// ---------- events (bus parity, never fatal) ----------

function _emit(event, data) {
    try { require('./event').emit(event, data); } catch (e) { /* bus never blocks */ }
}

// ---------- public surface ----------

/**
 * Begin an owner-stated budget: spread N slices across [now, now+duration].
 *
 * @param {object} opts
 * @param {string|number} opts.duration - owner phrasing ("30 minutes")
 * @param {number} [opts.sliceMs=120000] - slice length (default: one slice
 *   per 2 wall-minutes — the fixed-slice floor from the issue)
 * @param {string} [opts.label] - what the slices are for ("exploring the web")
 * @param {function} [opts.onSlice] - the slice callback; called as
 *   (sliceInfo, ledger) at each wake. Receives the controller; return
 *   value (if object) may carry `note` for the receipt line.
 * @param {boolean} [opts.persist=true] - checkpoint for resume
 * @returns {object} controller {id, start, end, sliceMs, slicesTotal, stop(), end(reason), remaining()}
 */
function beginBudget(opts = {}) {
    const duration = parseDuration(opts.duration !== undefined ? opts.duration : '30 minutes');
    const sliceMs = opts.sliceMs ? parseDuration(opts.sliceMs) : 120000;
    if (sliceMs > duration) {
        throw new errors.VantError('tempo: sliceMs (' + sliceMs + 'ms) exceeds the stated budget (' + duration + 'ms) - slices must SAMPLE the window, not exceed it', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
    }
    const start = Date.now();
    const end = start + duration;
    const slicesTotal = Math.max(1, Math.floor(duration / sliceMs));

    const ledger = _ledger();
    const id = 'tempo-' + start.toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
    const budget = {
        id,
        label: opts.label || 'unlabeled budget',
        start, end, sliceMs, slicesTotal,
        note: typeof opts.note === 'string' ? opts.note : null,
        state: 'active',
        nextSliceK: 0,
        receipts: []
    };
    ledger.budgets[id] = budget;
    _writeLedger(ledger);
    _emit('tempo:budget-start', { id, duration, sliceMs, slicesTotal, label: budget.label, timestamp: start });

    const controller = _makeController(budget, opts);
    _armNext(controller, opts);
    return controller;
}

function _makeController(budget, opts) {
    const controller = {
        id: budget.id,
        start: budget.start,
        windowEnd: budget.end,
        sliceMs: budget.sliceMs,
        slicesTotal: budget.slicesTotal,
        label: budget.label,
        budget,
        /** epoch ms left in the window (0 once expired) */
        remaining() { return Math.max(0, budget.end - Date.now()); },
        /** stop the scheduler WITHOUT ending the budget (agent rest — re-arms on load) */
        stop() {
            if (controller._timer) clearTimeout(controller._timer);
            controller._timer = null;
            _emit('tempo:budget-stopped', { id: budget.id, timestamp: Date.now() });
        },
        /** end the window early (explicit only): closes the budget now */
        end(reason) {
            if (controller._timer) clearTimeout(controller._timer);
            controller._timer = null;
            const ledger = _ledger(); // the ONE cache (_mutate in place)
            const b = ledger.budgets[budget.id];
            if (b && b.state === 'active') {
                b.state = 'ended-early';
                b.endedAt = Date.now();
                b.endReason = String(reason || 'agent ended early');
                _appendReceipt(b, {
                    ts: b.endedAt,
                    kind: 'budget-end',
                    line: 'ended early: ' + b.endReason
                });
                _writeLedger(ledger);
            }
            _emit('tempo:budget-end', { id: budget.id, expired: false, reason: b && b.endReason, timestamp: Date.now() });
        },
        _timer: null,
        _opts: opts
    };
    return controller;
}

function _armNext(controller, opts = {}) {
    const budget = controller.budget;
    const tick = () => {
        const now = Date.now();
        if (budget.state !== 'active') return;
        if (now >= budget.end) {
            _finishExpired(budget);
            _emit('tempo:budget-end', { id: budget.id, expired: true, timestamp: now });
            return;
        }
        budget.nextSliceK += 1;
        const sliceInfo = {
            id: budget.id,
            k: budget.nextSliceK,
            of: budget.slicesTotal,
            sliceMs: budget.sliceMs,
            at: now,
            remaining: Math.max(0, budget.end - now),
            label: budget.label
        };
        let note = null;
        try {
            const out = typeof (controller._opts && controller._opts.onSlice) === 'function'
                ? controller._opts.onSlice(sliceInfo, controller) : null;
            if (out && typeof out.note === 'string') note = out.note;
        } catch (e) {
            // The slice callback failing NEVER ends the loop; it becomes
            // its own receipt line (the trail shows what misfired).
            note = 'slice callback error: ' + (e.message || e).slice(0, 120);
        }
        _appendReceipt(budget, {
            ts: now,
            kind: 'slice',
            k: sliceInfo.k,
            line: 'slice ' + sliceInfo.k + '/' + sliceInfo.of + ' (' + sliceInfo.label + ')' + (note ? ' — ' + note : '')
        });
        _writeLedger(_ledger());
        _emit('tempo:slice', { ...sliceInfo, note });
        if (budget.nextSliceK >= budget.slicesTotal) {
            // Last planned slice fires before the window's end; drain to expiry.
            _armNext(controller, opts);
            return;
        }
        if (controller.remaining() > 0) {
            controller._timer = setTimeout(tick, Math.min(budget.sliceMs, remainingSafe(budget)));
            if (controller._timer.unref) controller._timer.unref(); // a keeper must never hold the process alive
        } else {
            _finishExpired(budget);
            _emit('tempo:budget-end', { id: budget.id, expired: true, timestamp: Date.now() });
        }
    };
    const firstDelay = Math.max(1, budget.nextSliceK === 0
        ? Math.min(budget.sliceMs, budget.end - Date.now())
        : Math.min(budget.sliceMs, remainingSafe(budget)));
    controller._timer = setTimeout(tick, firstDelay);
    if (controller._timer.unref) controller._timer.unref();
}

function remainingSafe(budget) { return Math.max(1, budget.end - Date.now()); }

function _appendReceipt(budget, receipt) {
    budget.receipts.push(receipt);
    if (budget.receipts.length > 500) budget.receipts = budget.receipts.slice(-500);
}

function _finishExpired(budget) {
    const ledger = _ledger();
    const b = ledger.budgets[budget.id];
    if (b && b.state === 'active') {
        b.state = 'expired';
        b.endedAt = Date.now();
        _appendReceipt(b, { ts: b.endedAt, kind: 'budget-end', line: 'window expired (' + b.slicesTotal + ' slices planned)' });
        _writeLedger(ledger);
    }
}

/**
 * Resume-truth: any persisted ACTIVE budget that has expired while the
 * process was away is closed out; still-fresh budgets come back with
 * remaining() intact (the clock is the epoch, not the invocation).
 *
 * @returns {number} budgets closed out
 */
function reconcile() {
    const ledger = _ledger();
    let closed = 0;
    for (const id of Object.keys(ledger.budgets)) {
        const b = ledger.budgets[id];
        if (b.state === 'active' && Date.now() >= b.end) {
            b.state = 'expired';
            b.endedAt = Date.now();
            _appendReceipt(b, { ts: b.endedAt, kind: 'budget-end', line: 'expired while unsupervised (reconciled on load)' });
            closed++;
        }
    }
    if (closed > 0) _writeLedger(ledger);
    return closed;
}

/**
 * pace(wantList, step) — the convenience from the issue: wraps one
 * want-list step in the loop's shape (execute → learn → note). Virtual
 * slices for already-proven patterns; returns the receipt line.
 *
 * @param {string} want - what the agent wanted to do when free
 * @param {function} step - the actual exploration step; return value (object with
 *   `learned`) becomes the receipt's learn note
 * @returns {object} { ok, learned, at }
 */
function pace(want, step) {
    if (typeof step !== 'function') throw new errors.VantError('tempo.pace: a step function is required - play without doing is just hoping', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
    const at = Date.now();
    let learned = null, ok = true, error = null;
    try {
        const out = step(want, at);
        learned = out && out.learned !== undefined ? out.learned : String(out || '').slice(0, 200) || null;
    } catch (e) {
        ok = false; error = (e.message || e).slice(0, 200);
    }
    const line = 'pace: [' + String(want) + '] ' + (ok ? 'learned: ' + (learned || '(nothing new)') : 'misfired: ' + error);
    const ledger = _ledger();
    ledger.receipts.push({ ts: at, want: String(want), ok, learned, error });
    if (ledger.receipts.length > 500) ledger.receipts = ledger.receipts.slice(-500);
    _writeLedger(ledger);
    _emit('tempo:paced', { want: String(want), ok, at });
    return { ok, learned, error, at, line };
}

/**
 * Is any active budget alive right now? (the consciousness-idle consult:
 * `idle` state checks this instead of silently decaying to nothing)
 */
function budgetActive() {
    const ledger = _ledger();
    for (const id of Object.keys(ledger.budgets)) {
        const b = ledger.budgets[id];
        if (b.state === 'active' && Date.now() < b.end) return { id: b.id, label: b.label, remaining: b.end - Date.now(), slicesFired: b.nextSliceK };
    }
    return null;
}

/** All budgets in the ledger (for `vant tempo status`). */
function status() {
    const ledger = _ledger();
    const budgets = Object.values(ledger.budgets).map(b => ({
        id: b.id, label: b.label, state: b.state,
        start: b.start, end: b.end, sliceMs: b.sliceMs, slicesTotal: b.slicesTotal,
        slicesFired: b.nextSliceK || 0,
        remaining: b.state === 'active' ? Math.max(0, b.end - Date.now()) : 0,
        receipts: (b.receipts || []).length
    }));
    return { now: Date.now(), active: budgets.find(b => b.state === 'active') || null, budgets: budgets.slice(-20) };
}

module.exports = { parseDuration, beginBudget, pace, budgetActive, status, reconcile, _ledgerPath, _readLedger, _writeLedger };
