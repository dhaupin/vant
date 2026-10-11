'use strict';

/**
 * Precision Contract (#157) — geometry/iso, 4/4
 * ==============================================
 *
 * `lib/geometry/engine.js` computes with mixed precision paths:
 * decimal-string math (goldenRatio), float64 (complex ops, matrices),
 * escape-time iteration — and a sidecar engine whose floats WILL disagree
 * with JS in the last ulps. If any address derivation consumes these
 * outputs, near-miss addresses become silent collisions.
 *
 * The contract, written down and testable:
 *   - EXACT functions: goldenRatio (decimal-string) — bit-identical across
 *     engines by construction.
 *   - APPROXIMATE functions: complex ops, escape iteration — float64 with
 *     a stated relative tolerance (|Δ| < 1e-12 relative).
 *   - FIXED-POINT RULE: engine outputs that become ADDRESSES must pass
 *     through the deterministic quantizer below (round to a stated grid)
 *     so both computation paths land on the same cell.
 *   - CROSS-RUN DETERMINISM: same input via JS path and sidecar path →
 *     same QUANTIZED output (parity harness over golden vectors).
 *
 * Engine-parity series (geometry/iso, 4/4).
 */

function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

/** The per-function contract table (#157 acceptance #3). */
const PRECISION_CONTRACT = Object.freeze({
    goldenRatio:     { class: 'EXACT',       repr: 'decimal-string', quantizer: null,    tolerance: 0 },
    complexMultiply: { class: 'APPROXIMATE', repr: 'float64',        quantizer: 'grid',  tolerance: 1e-12 },
    complexSquare:   { class: 'APPROXIMATE', repr: 'float64',        quantizer: 'grid',  tolerance: 1e-12 },
    complexMagnitude:{ class: 'APPROXIMATE', repr: 'float64',        quantizer: 'grid',  tolerance: 1e-12 },
    escapeTime:      { class: 'APPROXIMATE', repr: 'float64',        quantizer: 'grid',  tolerance: 1e-12 }
});

const DEFAULT_GRID = 1e-9;

/**
 * THE deterministic quantizer. Rounds a float to the stated grid and
 * returns an exact integer-grid value (so "same cell" is a === compare,
 * not a tolerance compare). Both JS and sidecar paths MUST call this
 * before their output becomes an address.
 *
 * Grid steps are powers of ten so round(x/g) is exact in binary float
 * for reasonable magnitudes — no double-rounding hazard.
 */
function quantize(value, grid = DEFAULT_GRID) {
    if (!Number.isFinite(value)) {
        throw _vantErr('precision.quantize: non-finite value cannot become an address', 'E_QUANT_INPUT');
    }
    if (!Number.isFinite(grid) || grid <= 0) {
        throw _vantErr('precision.quantize: grid must be positive finite', 'E_QUANT_INPUT');
    }
    return Math.round(value / grid); // exact integer on the grid
}

/** Quantize a {re, im} complex to grid coordinates. */
function quantizeComplex(z, grid = DEFAULT_GRID) {
    return { re: quantize(z.re, grid), im: quantize(z.im, grid) };
}

/**
 * Parity harness (#157 acceptance #2): run the JS fn and the sidecar fn on
 * golden vectors, quantize both, assert identical cells. Returns the
 * mismatch list (empty = parity holds). Callers wire the sidecar fn via
 * lib/geometry/engine.js's engine choice; the harness itself is pure.
 */
function parityHarness(vectors, jsFn, sidecarFn, { grid = DEFAULT_GRID, tolerance = 1e-12 } = {}) {
    if (typeof jsFn !== 'function' || typeof sidecarFn !== 'function') {
        throw _vantErr('precision.parityHarness: jsFn and sidecarFn required', 'E_QUANT_INPUT');
    }
    const mismatches = [];
    for (let i = 0; i < vectors.length; i++) {
        const v = vectors[i];
        const a = jsFn(v);
        const b = sidecarFn(v);
        const qa = Array.isArray(a) ? a.map(x => quantize(x, grid))
            : (typeof a === 'object' && a !== null ? quantizeComplex(a, grid) : quantize(a, grid));
        const qb = Array.isArray(b) ? b.map(x => quantize(x, grid))
            : (typeof b === 'object' && b !== null ? quantizeComplex(b, grid) : quantize(b, grid));
        const rawDelta = Array.isArray(a)
            ? Math.max(...a.map((x, j) => Math.abs(x - b[j])))
            : (typeof a === 'object' && a !== null
                ? Math.max(Math.abs(a.re - b.re), Math.abs(a.im - b.im))
                : Math.abs(a - b));
        const rel = Math.max(Math.abs(a), Math.abs(b)) > 0
            ? rawDelta / Math.max(Math.abs(a), Math.abs(b)) : rawDelta;
        if (JSON.stringify(qa) !== JSON.stringify(qb) || rel > tolerance) {
            mismatches.push({ index: i, quantizedA: qa, quantizedB: qb, rawDelta, rel });
        }
    }
    return mismatches;
}

module.exports = { PRECISION_CONTRACT, quantize, quantizeComplex, parityHarness, DEFAULT_GRID };
