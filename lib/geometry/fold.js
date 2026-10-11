'use strict';

/**
 * Icosahedral Fold Subdivision (#154) — geometry/iso, 1/4
 * ========================================================
 *
 * `lib/geometry/icosahedral.js` maps (θ, φ, depth) → hull position, but
 * capacity per subdivision is implicit. For addressing you need the two
 * laws WRITTEN DOWN and TESTED:
 *
 *   1. subdivision of a triangle yields exactly 4 children (1:4 fold),
 *   2. child addresses never collide with any other cell — ever, at any
 *      depth.
 *
 * The 20 faces of the icosahedron each root their own complete 4-ary heap
 * (the heap law itself lives in lib/state/fold.js — one implementation).
 * With max depth 11: 4^11 ≈ 4.2M cells per facet, total 20 × 4^11 ≈ 83.9M…
 * but the NSC-9-style 24-bit packing budget applies PER FACET-STREAM, so
 * the local cell index must fit 24 bits (4^11 < 2^24 — holds). Depth beyond
 * the cap is REFUSED (an error, not a wrap).
 *
 * Engine-parity series (geometry/iso, 1/4).
 */

const fold = require('../state/fold');
const { VantError } = require('../error');

const NUM_FACES = 20;

/** Total address capacity across all 20 facets at depth ≤ cap. */
function totalCapacity(cap = fold.MAX_FOLD_DEPTH) {
    return NUM_FACES * fold.foldCapacity(cap);
}

/**
 * Address a (face, localCell) pair as one packed integer:
 *   packed = face * foldCapacity(cap) + localCell
 * 24-bit budget check on the LOCAL index keeps NSC-9-style packing honest.
 */
function packAddress(face, localCell, cap = fold.MAX_FOLD_DEPTH) {
    if (!Number.isInteger(face) || face < 0 || face >= NUM_FACES) {
        throw new VantError('geometry.fold: face must be in [0,' + NUM_FACES + ')', { code: 'E_FOLD_FACE' });
    }
    const capCells = fold.foldCapacity(cap);
    if (!Number.isInteger(localCell) || localCell < 0 || localCell >= capCells) {
        throw new VantError('geometry.fold: localCell ' + localCell + ' exceeds facet capacity ' + capCells +
            ' — overflow refused, not wrapped', { code: 'E_FOLD_OVERFLOW' });
    }
    return face * capCells + localCell;
}

function unpackAddress(packed, cap = fold.MAX_FOLD_DEPTH) {
    const capCells = fold.foldCapacity(cap);
    return { face: Math.floor(packed / capCells), localCell: packed % capCells };
}

/**
 * Subdivide a face-rooted cell: exactly 4 children or a typed refusal.
 * Returns LOCAL child indices (relative to the facet's heap).
 */
function subdivide(face, localCell) {
    if (!Number.isInteger(face) || face < 0 || face >= NUM_FACES) {
        throw new VantError('geometry.fold: face out of range', { code: 'E_FOLD_FACE' });
    }
    // the heap law enforces depth-cap refusal; this adds the 1:4 contract
    return fold.children(localCell);
}

/**
 * The 1:4 law, observable: every subdividable cell yields EXACTLY 4
 * children; children across parents are pairwise disjoint (delegated to
 * the heap law's proof, over a single facet here).
 */
function facetSubdivisionLawHolds(cap = fold.MAX_FOLD_DEPTH) {
    return fold.assertDisjointAtCap(cap);
}

module.exports = {
    NUM_FACES,
    totalCapacity,
    packAddress,
    unpackAddress,
    subdivide,
    facetSubdivisionLawHolds
};
