'use strict';

/**
 * Intersection Rebate Cell Store (#150) — storage, 2/5
 * =====================================================
 *
 * Every space claims cells in ONE shared content-addressed store; a fact
 * lives in exactly one cell keyed by content hash. `put(space, cell, hash,
 * value)` returns true only for the claimant that PAID (first insertion);
 * everyone else "re-claims" — the rebate. Cross-space dedup becomes a
 * structural property, not a cleanup pass.
 *
 * Measure it: savings_ratio = 1 - distinct/stores_attempted, approaching
 * 1.0 as consumers converge on shared state. Stress is MEASURED, not feared.
 *
 * Engine-parity series (storage, 2/5). One addressing spine (#165): the
 * cell key is derived via lib/state/seeds.js (the single PRF), never a
 * second hash chain.
 */

const canonical = require('./canonical');

class CellStore {
    constructor() {
        this._cells = new Map();      // contentHash → { value, size, firstSpace, cell }
        this._claims = new Map();     // space → claim count (rebates counted)
        this._attempted = 0;
        this._distinct = 0;
    }

    /**
     * Claim a cell. Returns:
     *   { stored: true }            — this caller PAID (first insertion)
     *   { stored: false, rebate: true, firstSpace } — re-claim, no bytes stored
     */
    put(space, cell, value) {
        if (typeof space !== 'string' || !space) {
            throw new (require('../error').VantError)('cellstore.put: space required', { code: 'E_CELL_SPACE' });
        }
        const hash = canonical.hash(value);
        this._attempted++;
        this._claims.set(space, (this._claims.get(space) || 0) + 1);
        if (this._cells.has(hash)) {
            // REBATE: the fact already exists; claim counted, zero bytes stored
            return { stored: false, rebate: true, hash, firstSpace: this._cells.get(hash).firstSpace };
        }
        this._cells.set(hash, {
            value,
            hash,
            cell,
            firstSpace: space,
            size: canonical.encode(value).length,
            storedAt: Date.now()
        });
        this._distinct++;
        return { stored: true, hash };
    }

    /** Read by content hash. Typed absence (#163 vocabulary). */
    get(hash) {
        const cell = this._cells.get(hash);
        if (!cell) return { state: 'ABSENT' };
        return { state: 'PRESENT', value: cell.value, hash, cell: cell.cell, firstSpace: cell.firstSpace };
    }

    has(hash) { return this._cells.has(hash); }
    get size() { return this._distinct; }

    /** Claim count per space (rebates included — a claim is a claim). */
    claimsFor(space) { return this._claims.get(space) || 0; }

    /**
     * THE metric (#150 acceptance #3): dedup efficiency of the store.
     * savings_ratio = 1 - distinct/stores_attempted. 0 = every store paid;
     * →1.0 = consumers converged on shared state.
     */
    metrics() {
        return {
            stores_attempted: this._attempted,
            distinct: this._distinct,
            savings_ratio: this._attempted === 0 ? 0 : 1 - (this._distinct / this._attempted),
            bytes_stored: [...this._cells.values()].reduce((a, c) => a + c.size, 0),
            claims: Object.fromEntries(this._claims)
        };
    }
}

module.exports = { CellStore };
