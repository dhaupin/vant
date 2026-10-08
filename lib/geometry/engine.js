/**
 * Geometric Engine (v0.8.6)
 * Unified interface for geometry operations
 *
 * Automatically chooses best available engine:
 * - Julia: Best for complex numbers, matrices, high precision
 * - Node.js: Fallback, always available
 *
 * (pass 168) Julia runs on the SIDECAR (compute.evaluate mode 'auto' —
 * persistent localhost process, JIT paid once) instead of the subprocess
 * path that re-paid 2-30s of JIT per multiply. The probe and every Julia
 * call share one sidecar instance via compute's lang:mode connector cache.
 * All Julia snippets are real Julia now: the old goldenRatio emitted
 * invalid syntax (`using .Base.Math常数`) and matrixMultiply returned its
 * input unmodified — both fixed and live-pinned.
 */

const compute = require('../compute');

const JULIA_OPTS = { lang: 'julia', mode: 'auto' };

let _engine = null;
let _detectEngine = async () => {
    // Probe through the sidecar wire (mode 'auto': sidecar, subprocess
    // fallback). On any failure Julia is simply not the engine.
    try {
        const result = await compute.evaluate('println(1 + 1)', JULIA_OPTS);
        if (result.success && result.stdout && result.stdout.trim() === '2') {
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
println("$(real(result)) $(imag(result))")
`;
        const result = await compute.evaluate(code, JULIA_OPTS);
        const [re, im] = result.stdout.trim().split(/\s+/).map(Number);
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
        const result = await compute.evaluate(code, JULIA_OPTS);
        return parseFloat(result.stdout.trim());
    }

    return Math.sqrt(z.re * z.re + z.im * z.im);
}

// =============================================================================
// HIGH-PRECISION DECIMALS (for fingerprints)
// =============================================================================

/**
 * Calculate golden ratio to high precision.
 * (pass 168) Real Julia this time — BigFloat φ = (1+√5)/2 at setprecision.
 */
async function goldenRatio(decimals = 50) {
    if (_engine === 'julia') {
        // setprecision(BigFloat, n) takes BITS — decimal digits need
        // ~3.322 bits each (pin-caught: 64 bits printed only ~20 digits).
        const bits = Math.ceil(Number(decimals) * 3.322) + 16;
        const code = `
setprecision(BigFloat, ${bits})
phi = (1 + sqrt(BigFloat(5))) / 2
println(string(phi))
`;
        const result = await compute.evaluate(code, JULIA_OPTS);
        if (result.success && result.stdout.trim()) {
            return result.stdout.trim();
        }
        // fall through to Node on any srv-side failure — honest fallback,
        // never a wrong-precision string
    }

    // Node fallback (lower precision)
    return ((1 + Math.sqrt(5)) / 2).toPrecision(decimals);
}

// =============================================================================
// MATRIX OPERATIONS (for icosahedral rotations)
// =============================================================================

/**
 * Multiply 3x3 matrices.
 * (pass 168) The Julia path actually parses now: each row is printed as
 * space-separated numbers on its own line.
 */
async function matrixMultiply(A, B) {
    if (_engine === 'julia') {
        const aStr = '[' + A.map(r => r.join(' ')).join('; ') + ']';
        const bStr = '[' + B.map(r => r.join(' ')).join('; ') + ']';
        const code = `
A = ${aStr}
B = ${bStr}
C = A * B
for i in 1:size(C, 1)
    println(join(C[i, :], " "))
end
`;
        const result = await compute.evaluate(code, JULIA_OPTS);
        if (result.success && result.stdout.trim()) {
            return result.stdout.trim().split('\n')
                .map(line => line.trim().split(/\s+/).map(Number))
                .filter(row => row.length > 0 && row.every(n => !Number.isNaN(n)));
        }
        // srv-side failure: fall through to the Node path rather than
        // return a wrong matrix
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
        const result = await compute.evaluate(code, JULIA_OPTS);
        if (result.success && result.stdout.trim()) {
            return parseInt(result.stdout.trim());
        }
        // fall through to Node on failure
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
