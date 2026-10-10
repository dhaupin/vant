'use strict';

/**
 * Fold Capacity Law (#149) — storage, 1/5
 * ========================================
 *
 * A cell folds into 4 children (connect edge midpoints of the triangle):
 * a complete 4-ary heap. Complete-heap addressing guarantees no child ever
 * collides with another cell, depth is closed-form arithmetic (O(1), no
 * allocation), and the layout packs contiguously per depth ring.
 *
 * A bounded fold depth (MAX_FOLD_DEPTH = 11 → 4^11 ≈ 4.2M cells/facet,
 * ~5.6M total addresses < 2^24) keeps every address inside a fixed budget —
 * the shape REFUSES to overrun past the cap (an address space that can
 * overrun is a stress generator, not a stress solver).
 *
 * Ring offsets: cells at depth d occupy [offset(d), offset(d+1)) where
 * offset(d) = (4^d - 1) / 3 (sum of 4^0..4^(d-1)).
 *
 * children(p) = {4p+1, 4p+2, 4p+3, 4p+4}
 */

const { VantError } = require('../error');

const FANOUT = 4;
const MAX_FOLD_DEPTH = 11;

/** offset(d) = (4^d - 1)/3 — first cell index at depth d. Exact (integers). */
function ringOffset(depth) {
    if (!Number.isInteger(depth) || depth < 0) {
        throw new VantError('fold.ringOffset: depth must be a non-negative integer', { code: 'E_FOLD_DEPTH' });
    }
    // (4^d - 1)/3; use BigInt-safe path only up to MAX depth where 4^11 fits
    // comfortably in a double (4194304).
    return ((Math.pow(FANOUT, depth) - 1) / 3);
}

/**
 * Closed-form cell depth: O(1), no allocation. Inverts the ring offset.
 * depth(p) = floor(log_4(3p + 1)).
 */
function cellDepth(p) {
    if (!Number.isInteger(p) || p < 0) {
        throw new VantError('fold.cellDepth: cell index must be a non-negative integer', { code: 'E_FOLD_CELL' });
    }
    // 3p+1 ∈ [4^d, 4^(d+1)) exactly on ring boundaries; log4 via log2/2.
    const d = Math.floor(Math.log2(3 * p + 1) / 2 + 1e-12);
    // guard against float drift at ring boundaries (e.g. p = offset(d+1)-1)
    return Math.min(d, MAX_FOLD_DEPTH);
}

/** Children of cell p: {4p+1 .. 4p+4} — always disjoint across parents. */
function children(p) {
    if (!Number.isInteger(p) || p < 0) {
        throw new VantError('fold.children: cell index must be a non-negative integer', { code: 'E_FOLD_CELL' });
    }
    const d = cellDepth(p);
    if (d >= MAX_FOLD_DEPTH) {
        // overflow refusal is an ERROR, not a wrap (#149 acceptance #3)
        throw new VantError(
            'fold.children: cell ' + p + ' is at max fold depth ' + MAX_FOLD_DEPTH +
            ' — the shape refuses to overrun past the cap', { code: 'E_FOLD_OVERFLOW' });
    }
    return [FANOUT * p + 1, FANOUT * p + 2, FANOUT * p + 3, FANOUT * p + 4];
}

/** Parent of cell p (0 is the root, parentless). */
function parent(p) {
    if (!Number.isInteger(p) || p < 0) {
        throw new VantError('fold.parent: cell index must be a non-negative integer', { code: 'E_FOLD_CELL' });
    }
    if (p === 0) return null;
    return Math.floor((p - 1) / FANOUT);
}

/** Total addressable cells at fold depth ≤ cap: (4^(cap+1) - 1)/3. */
function foldCapacity(cap = MAX_FOLD_DEPTH) {
    return (Math.pow(FANOUT, cap + 1) - 1) / 3;
}

/**
 * The capacity law: depth() and fold_capacity() agree at every ring
 * boundary. fold_capacity(d) = offset(d+1) — the count through depth d
 * equals the first index of depth d+1.
 */
function capacityLawHolds(cap = MAX_FOLD_DEPTH) {
    for (let d = 0; d <= cap; d++) {
        if (foldCapacity(d) !== ringOffset(d + 1)) return false;
        if (cellDepth(ringOffset(d)) !== d) return false;           // first of ring
        if (cellDepth(ringOffset(d + 1) - 1) !== d) return false;   // last of ring
    }
    return true;
}

/**
 * Exhaustive disjointness over all cells at depth ≤ cap (used by the test
 * pin; not called on hot paths). Returns true iff every parent's child set
 * is pairwise disjoint from every other's — which the complete-heap layout
 * guarantees by construction, but the law is TESTED, not assumed.
 */
function assertDisjointAtCap(cap) {
    const seen = new Set();
    for (let p = 0; p <= foldCapacity(cap - 1); p++) {
        if (cellDepth(p) >= cap) break;
        for (const c of children(p)) {
            if (seen.has(c)) return false;
            seen.add(c);
        }
    }
    return seen.size === foldCapacity(cap) - 1; // every cell except root claimed exactly once
}

module.exports = {
    FANOUT,
    MAX_FOLD_DEPTH,
    ringOffset,
    cellDepth,
    children,
    parent,
    foldCapacity,
    capacityLawHolds,
    assertDisjointAtCap
};
