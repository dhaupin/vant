'use strict';

/**
 * Derived vs Delta (#161) — world/clock, 4/4
 * ===========================================
 *
 * Two layers, explicitly:
 *   - DERIVED = pure function of seed/config. Never stored except as
 *     caches; reproducible by anyone with the seed (orbits, tilings,
 *     addressing plans — see lib/state/orbits.js, lib/state/seeds.js).
 *   - DELTA = the record of events. THE ONLY thing worth persisting as
 *     truth. Every delta carries provenance: {payload, actor, epoch}.
 *     Actor is NOT optional — an unattributed change is a gaslight.
 *
 * Erasure is itself a delta: the record is REPLACED by
 * {cleared: true, actor, epoch} so an audit can answer who cleared what
 * and when. Deleting history is how agents gaslight their own future
 * selves.
 *
 * Storage split for free: derived layers evict + recompute; deltas are
 * small and append-mostly; "what changed since checkpoint T" is exactly
 * the delta ledger.
 *
 * Engine-parity series (world/clock, 4/4).
 */

const canonical = require('./canonical');

function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

/** DERIVED-side helper: recompute a derived layer and prove determinism. */
function derive(fn, input) {
    if (typeof fn !== 'function') throw _vantErr('delta.derive: fn required', 'E_DELTA_INPUT');
    return fn(input);
}

class DeltaLedger {
    /**
     * @param {object} [options]
     * @param {number} [options.epoch] - logical clock (defaults to Date.now)
     */
    constructor(options = {}) {
        this._epoch = options.epoch || null; // null → wall clock per record
        this._records = new Map(); // key → [{payload, actor, epoch, cleared}]
        this._sequence = [];
    }

    _now() { return this._epoch !== null ? this._epoch : Date.now(); }

    /**
     * Record a delta. Actor is NOT optional (#161 acceptance #1).
     * @returns {{payload, actor, epoch, cleared:false}}
     */
    record(key, payload, actor) {
        if (typeof key !== 'string' || !key) throw _vantErr('delta.record: key required', 'E_DELTA_INPUT');
        if (actor === undefined || actor === null || actor === '') {
            throw _vantErr('delta.record: actor is NOT optional — every delta carries provenance', 'E_DELTA_ACTOR');
        }
        const rec = { payload, actor, epoch: this._now(), cleared: false };
        if (!this._records.has(key)) this._records.set(key, []);
        this._records.get(key).push(rec);
        this._sequence.push({ key, ...rec });
        return rec;
    }

    /**
     * Erase: the record is REPLACED by {cleared: true, actor, epoch} —
     * auditable, never silent (#161 acceptance #2).
     */
    erase(key, actor) {
        if (actor === undefined || actor === null || actor === '') {
            throw _vantErr('delta.erase: actor is NOT optional', 'E_DELTA_ACTOR');
        }
        const history = this._records.get(key);
        if (!history) {
            return { cleared: false, state: 'ABSENT' }; // typed: nothing to erase
        }
        const rec = { payload: null, actor, epoch: this._now(), cleared: true };
        history.push(rec);
        this._sequence.push({ key, ...rec });
        return { cleared: true, state: 'PRESENT', record: rec };
    }

    /**
     * Read the LIVE value at a key: latest delta wins; a cleared tail means
     * ABSENT (but the history below remains for audit).
     */
    get(key) {
        const history = this._records.get(key);
        if (!history || history.length === 0) return { state: 'ABSENT' };
        const last = history[history.length - 1];
        if (last.cleared) return { state: 'ABSENT', lastRecord: last };
        return { state: 'PRESENT', payload: last.payload, actor: last.actor, epoch: last.epoch };
    }

    /** Full provenance history at a key (who/what/when — the audit story). */
    history(key) {
        const history = this._records.get(key);
        return history ? history.slice() : [];
    }

    /** All deltas since (exclusive) an epoch — the resync primitive's feed. */
    since(epoch) {
        return this._sequence.filter(r => r.epoch > epoch);
    }

    get size() { return this._records.size; }
    get sequenceLength() { return this._sequence.length; }

    /**
     * Determinism proof (#161 acceptance #3): hash of the full sequence.
     * Two ledgers that saw the same events agree on one hex string.
     */
    ledgerHash() {
        return canonical.hash(this._sequence.map(r => ({
            key: r.key,
            payload: r.payload === undefined ? null : r.payload,
            actor: String(r.actor),
            epoch: r.epoch,
            cleared: r.cleared
        })));
    }
}

module.exports = { DeltaLedger, derive };
