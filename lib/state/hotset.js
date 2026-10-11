'use strict';

/**
 * Bounded Hot Set (#153) — storage, 5/5
 * ======================================
 *
 * Two layers, explicit:
 *   - cell store: content-addressed, durable, unbounded by design (that's
 *     what snapshots/archival are for) — the caller's CellStore,
 *   - hot set: bounded LRU over recently touched hashes; eviction touches
 *     ONLY the cache, never durability.
 *
 * A cache miss MUST fall through to the cell store and be correct; a hot
 * set of size 0 changes nothing but speed. Metrics {hits, misses,
 * evictions, store_size} readable in one call.
 *
 * Engine-parity series (storage, 5/5).
 */

class HotSet {
    /**
     * @param {object} backing - object with get(hash) → {state:'PRESENT',...}|{state:'ABSENT'} (the durable layer)
     * @param {number} cap - max hot entries (hard cap, enforced)
     */
    constructor(backing, cap = 1024) {
        if (!backing || typeof backing.get !== 'function') {
            throw new (require('../error').VantError)('hotset: backing store with get() required', { code: 'E_HOTSET_BACKING' });
        }
        if (!Number.isInteger(cap) || cap < 0) {
            throw new (require('../error').VantError)('hotset: cap must be a non-negative integer', { code: 'E_HOTSET_CAP' });
        }
        this._backing = backing;
        this._cap = cap;
        this._map = new Map(); // hash → value (insertion-ordered = LRU order)
        this._hits = 0;
        this._misses = 0;
        this._evictions = 0;
    }

    get cap() { return this._cap; }

    /**
     * Read: hot set first, durable fall-through on miss. An evicted key
     * returns the CORRECT value via the fallback path (#153 acceptance #1).
     */
    get(hash) {
        if (this._map.has(hash)) {
            this._hits++;
            // touch = refresh recency
            const v = this._map.get(hash);
            this._map.delete(hash);
            this._map.set(hash, v);
            return { state: 'PRESENT', value: v, source: 'hot' };
        }
        this._misses++;
        const res = this._backing.get(hash);
        if (res && res.state === 'PRESENT') {
            this._insert(hash, res.value);
            return { state: 'PRESENT', value: res.value, source: 'store' };
        }
        return { state: 'ABSENT' };
    }

    /**
     * Hot-set insert. DURABILITY IS THE CALLER'S JOB: the hot set is a
     * read cache over the backing store, never the write path (#153 —
     * eviction must never touch durability, so this layer does not
     * auto-write-through; write to the backing store, then here).
     */
    put(hash, value) {
        this._insert(hash, value);
    }

    _insert(hash, value) {
        if (this._map.has(hash)) this._map.delete(hash);
        this._map.set(hash, value);
        while (this._map.size > this._cap) {
            // evict OLDEST (first key in insertion order) — counted, never silent
            const oldest = this._map.keys().next().value;
            this._map.delete(oldest);
            this._evictions++;
        }
    }

    /** One-call metrics (#153 acceptance #3). */
    metrics() {
        return {
            hits: this._hits,
            misses: this._misses,
            evictions: this._evictions,
            hot_size: this._map.size,
            cap: this._cap,
            hit_ratio: (this._hits + this._misses) === 0 ? 0 : this._hits / (this._hits + this._misses),
            store_size: typeof this._backing.size === 'number' ? this._backing.size : undefined
        };
    }
}

module.exports = { HotSet };
