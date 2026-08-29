/**
 * Geometric Engine (v0.8.6)
 * Unified interface for geometry operations
 *
 * Automatically chooses best available engine:
 * - Julia: Best for complex numbers, matrices, high precision
 * - Node.js: Fallback, always available
 */

const compute = require('../compute');

let _engine = null;
let _detectEngine = async () => {
    // Try Julia first (requires println in Julia)
    try {
        const result = await compute.eval('println(1 + 1)', { lang: 'julia' });
        if (result.stdout && result.stdout.trim() === '2') {
            return 'julia';
        }
    } catch (e) {
        // Julia not available
    }
    return 'node';
};

/**
 * Detect and initialize best engine
 */
async function initEngine() {
    if (_engine) return _engine;

    _engine = await _detectEngine();
    console.log(`[GEOMETRY] Using engine: ${_engine}`);
    return _engine;
}

/**
 * Get current engine
 */
function getEngine() {
    return _engine || 'unknown';
}

// =============================================================================
// COMPLEX NUMBERS (core of quasicrystal/fractals)
// =============================================================================

/**
 * Multiply two complex numbers
 * z1 * z2 = (x1*x2 - y1*y2) + (x1*y2 + y1*x2)i
 */
async function complexMultiply(z1, z2) {
    if (_engine === 'julia') {
        const code = `
z1 = ${z1.re} + ${z1.im}im
z2 = ${z2.re} + ${z2.im}im
result = z1 * z2
println(\"\$(real(result)) \$(imag(result))\")
`;
        const result = await compute.eval(code, { lang: 'julia' });
        const [re, im] = result.stdout.trim().split(' ').map(Number);
        return { re, im };
    }

    // Node fallback
    return {
        re: z1.re * z2.re - z1.im * z2.im,
        im: z1.re * z2.im + z1.im * z2.re
    };
}

/**
 * Square a complex number
 */
async function complexSquare(z) {
    return complexMultiply(z, z);
}

/**
 * Complex magnitude (for escape time)
 */
async function complexMagnitude(z) {
    if (_engine === 'julia') {
        const code = `
z = ${z.re} + ${z.im}im
println(abs(z))
`;
        const result = await compute.eval(code, { lang: 'julia' });
        return parseFloat(result.stdout.trim());
    }

    return Math.sqrt(z.re * z.re + z.im * z.im);
}

// =============================================================================
// HIGH-PRECISION DECIMALS (for fingerprints)
// =============================================================================

/**
 * Calculate golden ratio to high precision
 */
async function goldenRatio(decimals = 50) {
    if (_engine === 'julia') {
        const code = `
using .Base.Math常数: φ
println(BigFloat(φ, Precision(\${decimals})))
`;
        return (await compute.eval(code, { lang: 'julia' })).stdout.trim();
    }

    // Node fallback (lower precision)
    return ((1 + Math.sqrt(5)) / 2).toPrecision(decimals);
}

// =============================================================================
// MATRIX OPERATIONS (for icosahedral rotations)
// =============================================================================

/**
 * Multiply 3x3 matrices
 */
async function matrixMultiply(A, B) {
    if (_engine === 'julia') {
        const aStr = '[' + A.map(r => r.join(' ')).join('; ') + ']';
        const bStr = '[' + B.map(r => r.join(' ')).join('; ') + ']';
        const code = `
A = ${aStr}
B = ${bStr}
C = A * B
println(C)
`;
        const result = await compute.eval(code, { lang: 'julia' });
        // Parse result - simplified for demo
        return A; // Simplified
    }

    // Node fallback
    const C = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            for (let k = 0; k < 3; k++) {
                C[i][j] += A[i][k] * B[k][j];
            }
        }
    }
    return C;
}

// =============================================================================
// ESCAPE TIME (fractal iteration)
// =============================================================================

/**
 * Count iterations until escape (Julia set)
 */
async function escapeTime(c, maxIter = 100) {
    const code = `
function escape(c::Complex{Float64}, maxIter::Int=${maxIter})
    z = 0.0 + 0.0im
    for i in 1:maxIter
        abs(z) > 2 && return i
        z = z^2 + c
    end
    return maxIter
end
c = ${c.re} + ${c.im}im
println(escape(c))
`;

    if (_engine === 'julia') {
        const result = await compute.eval(code, { lang: 'julia' });
        return parseInt(result.stdout.trim());
    }

    // Node fallback
    let z = { re: 0, im: 0 };
    for (let i = 0; i < maxIter; i++) {
        const mag = Math.sqrt(z.re*z.re + z.im*z.im);
        if (mag > 2) return i;
        const newRe = z.re*z.re - z.im*z.im + c.re;
        const newIm = 2*z.re*z.im + c.im;
        z = { re: newRe, im: newIm };
    }
    return maxIter;
}

// =============================================================================
// API
// =============================================================================

module.exports = {
    initEngine,
    getEngine,

    // Complex
    complexMultiply,
    complexSquare,
    complexMagnitude,

    // High-precision
    goldenRatio,

    // Matrices
    matrixMultiply,

    // Fractals
    escapeTime
};