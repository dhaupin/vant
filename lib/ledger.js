/**
 * Ledger (wave E, vant#337) — the credit side of the economy's books.
 *
 * lib/settlement.js's header is candid: credit-side accounting is the
 * missing half — its claims ledger records THAT a settlement happened
 * (evidence), but nothing answers the listing owner's most basic economic
 * question: "what have I earned, and what am I holding?" This module is
 * that half, and its law is the one settlement's header wrote: **the
 * owner's record is evidence, not income.** A credit is a DERIVED row
 * over an existing, referenced record — never an independently minted
 * number.
 *
 *   credit(principal, { kind, amount, ref })  — append a credit row onto a
 *       settlement/trade reference (refs are UNIQUE: economy.events ride
 *       the bus; integrators meter without scraping)
 *   balance(principal) / history(principal, opts) — read-only reads
 *
 * Fail-closed everywhere: an amount must be a positive finite number
 * under the cap; a ref must be present, unique (no double-credit), and
 * string-typed. Merge-only adoption with the settlement _seenSettlements
 * pattern: hydrate merges peer rows prev without clobbering hot state,
 * seen-but-absent rows are tombstoned (local deletes stay dead), and
 * nothing here mints value on its own.
 *
 * Persistence rides the state spine exactly like siblings:
 *   state/ledger.json, per-brain, written at the mutation point.
 */

const crypto = require('crypto');
const stateStore = require('./state-store');

const LEDGER_STATE_FILE = 'state/ledger.json';
const MAX_AMOUNT = 1000000;      // a single credit's cap (mirrors settlement MAX_PRICE discipline at ledger scale)
const MAX_MEMO = 200;

let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) _event.emit(event, data);
}

const _ledger = new Map();            // id -> entry
const _refs = new Map();              // ref -> id (a ref settles ONCE)
const _seenIds = new Set();           // merge tombstone set (pass-99 law)
let _hydrated = false;

// ==================== EVENTS (the typed economy event family, #337) ========

function _wireEconomyEvents() {
    _emit('economy:ledger.ready', { module: 'ledger', brands: 'credit-side' });
}
_wireEconomyEvents();

// ==================== HYDRATE / PERSIST (pass-38 pattern) ==================

function _hydrate() {
    if (_hydrated) return;
    _hydrated = true;
    // (B0, #249 inheritance) merge-only adoption, tombstone-aware:
    // hot state wins, seen-but-absent is never re-adopted.
    try {
        stateStore.hydrate({
            moduleName: 'ledger',
            stateFile: LEDGER_STATE_FILE,
            apply: (data) => {
                if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) return;
                for (const e of data.entries) {
                    if (!e || typeof e.id !== 'string' || !e.id) continue;
                    _seenIds.add(e.id); // loaded rows are "seen"
                    if (_ledger.has(e.id)) continue;   // hot wins
                    _ledger.set(e.id, { ...e });
                    if (typeof e.ref === 'string' && e.ref && !_refs.has(e.ref)) _refs.set(e.ref, e.id);
                }
            }
        });
    } catch (e) { /* hydration is opportunistic; reads still work */ }
}

function _persist() {
    try {
        stateStore.persist({
            moduleName: 'ledger',
            stateFile: LEDGER_STATE_FILE,
            data: { entries: Array.from(_ledger.values()) }
        });
    } catch (e) { /* state-capacity limits surface via the spine audit; reads stay intact */ }
}

// ==================== CREDIT ====================

/**
 * Append a credit row onto a referenced record. The ref names an
 * EXISTING settlement/trade/settlementId (evidence); the row is typed
 * and idempotent-by-ref (a ref settles once, so a double-credit is
 * structurally impossible).
 *
 * @param {string} principal  - who earned (the listing owner)
 * @param {object} opts       - { kind, amount, ref, note, refs }
 * @returns {object}          - { credited: true, id, ref, balance } | typed refusal envelope
 */
function credit(principal, opts = {}) {
    _hydrate();
    if (!principal || typeof principal !== 'string' || principal.length > 80) {
        return { error: 'principal required (who the credit belongs to)', code: 'E_LEDGER_PRINCIPAL' };
    }
    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
        return { error: 'opts must be an object', code: 'E_LEDGER_INPUT' };
    }
    const amount = typeof opts.amount === 'number' ? opts.amount : null;
    if (amount === null || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
        return { error: 'amount must be a positive finite number up to ' + MAX_AMOUNT, code: 'E_LEDGER_AMOUNT' };
    }
    if (typeof opts.ref !== 'string' || !opts.ref.trim()) {
        return { error: 'ref required - a credit names the settlement/trade row it derives from (evidence, not income)', code: 'E_LEDGER_REF_REQUIRED' };
    }
    const ref = opts.ref.trim().slice(0, 120);
    if (_refs.has(ref)) {
        return { error: 'this ref already credited (' + _refs.get(ref) + ') - a settlement becomes income exactly once', code: 'E_LEDGER_DUPLICATE' };
    }
    const kind = (typeof opts.kind === 'string' && opts.kind.trim()) ? opts.kind.trim().slice(0, 40) : 'settlement';
    const entry = {
        id: 'credit_' + crypto.randomBytes(6).toString('hex'),
        kind,
        principal,
        amount: Math.round(amount * 100) / 100,   // cents-clean, never float-noise
        ref,
        note: (typeof opts.note === 'string' && opts.note) ? opts.note.slice(0, MAX_MEMO) : null,
        refs: (Array.isArray(opts.refs) && opts.refs.length) ? opts.refs.slice(0, 5).map(String).slice(0, 200) : null,
        creditedAt: Date.now()
    };
    _ledger.set(entry.id, entry);
    _refs.set(ref, entry.id);
    _seenIds.add(entry.id);
    _persist();
    _emit('economy:ledger.credited', { id: entry.id, principal, amount: entry.amount, ref, kind });
    return { credited: true, id: entry.id, kind, amount: entry.amount, ref, balance: balance(principal) };
}

// ==================== READS ====================

function balance(principal) {
    _hydrate();
    if (!principal || typeof principal !== 'string') {
        return { error: 'principal required', code: 'E_LEDGER_PRINCIPAL' };
    }
    let total = 0;
    let count = 0;
    for (const e of _ledger.values()) {
        if (e.principal === principal) { total += e.amount; count++; }
    }
    return { principal, balance: Math.round(total * 100) / 100, credits: count };
}

/**
 * Read-only history for one principal, newest first. `since` (ms epoch)
 * bounds the window; `limit` caps the page (default 50, max 200).
 */
function history(principal, opts = {}) {
    _hydrate();
    if (!principal || typeof principal !== 'string') {
        return { error: 'principal required', code: 'E_LEDGER_PRINCIPAL' };
    }
    const since = Number.isFinite(opts.since) ? opts.since : null;
    const limit = (Number.isFinite(opts.limit) && opts.limit > 0 && opts.limit <= 200) ? Math.floor(opts.limit) : 50;
    const rows = Array.from(_ledger.values())
        .filter((e) => e.principal === principal && (since == null || (e.creditedAt || 0) >= since))
        .sort((a, b) => (b.creditedAt || 0) - (a.creditedAt || 0))
        .slice(0, limit)
        .map((e) => ({ ...e }));
    return { principal, rows, count: rows.length };
}

// ---------- tests/ops seams (sibling pattern) ----------

module.exports = {
    credit,
    balance,
    history,
    _stateFile: LEDGER_STATE_FILE,
    _seenCount: () => _seenIds.size,
    _persistNow: () => _persist(),
    _resetHydration: () => { _hydrated = false; },
    clearState: () => {
        stateStore.clear(LEDGER_STATE_FILE);
        _ledger.clear();
        _refs.clear();
        _seenIds.clear();
        _hydrated = true;
        return true;
    }
};
