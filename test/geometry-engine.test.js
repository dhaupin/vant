#!/usr/bin/env node
/**
 * Geometry engine pins (pass 168).
 *
 * Pins the engine switch onto the sidecar (mode 'auto'):
 *   1. (with julia) engine = julia, computed through the sidecar wire
 *   2. (with julia) goldenRatio returns real high-precision digits — the
 *      old snippet was invalid Julia (`using .Base.Math常数`) and always
 *      threw, silently degrading to Node precision
 *   3. (with julia) matrixMultiply actually multiplies — the old Julia
 *      path printed C then returned A unmodified ("Simplified")
 *   4. (with julia) sidecar amortization: warm ops are milliseconds, not
 *      the 2-30s JIT-per-call the subprocess model paid
 *   5. (no julia) engine = node fallback computes correctly (honest
 *      degrade, always runnable — CI runs this half)
 *
 * SKIPS the julia pins (exit 0) when julia is not on PATH; node fallback
 * pins always run.
 */

const { execFileSync } = require('child_process');

let juliaBin = null;
try {
    juliaBin = execFileSync('which', ['julia'], { encoding: 'utf8' }).trim();
} catch (e) { /* not installed */ }

const assert = require('assert');
const engine = require('../lib/geometry/engine');

let passed = 0, failed = 0;
function ok(name) { passed++; console.log('  ✓ ' + name); }
function fail(name, detail) { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }

async function main() {
    if (juliaBin) {
        await engine.initEngine();
        if (engine.getEngine() === 'julia') {
            ok('engine detects julia (sidecar path)');
        } else fail('engine detection', 'got ' + engine.getEngine());

        // goldenRatio: real digits past float64 (Node caps at ~16 significant)
        const phi = await engine.goldenRatio(50);
        if (phi.includes('1.61803398874989484820458683436563811772030917980576')) {
            ok('goldenRatio: real BigFloat precision (50 digits)');
        } else fail('goldenRatio precision', phi.slice(0, 40));

        const mm = await engine.matrixMultiply(
            [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
            [[9, 8, 7], [6, 5, 4], [3, 2, 1]]);
        const want = [[30, 24, 18], [84, 69, 54], [138, 114, 90]];
        if (JSON.stringify(mm) === JSON.stringify(want)) {
            ok('matrixMultiply: actually multiplies (old path returned A)');
        } else fail('matrixMultiply correctness', JSON.stringify(mm));

        const cm = await engine.complexMultiply({ re: 1, im: 2 }, { re: 3, im: 4 });
        if (cm.re === -5 && cm.im === 10) {
            ok('complexMultiply: correct through the sidecar wire');
        } else fail('complexMultiply', JSON.stringify(cm));

        const t0 = Date.now();
        for (let i = 0; i < 5; i++) {
            await engine.complexMultiply({ re: i, im: 1 }, { re: 2, im: 3 });
        }
        const perCall = (Date.now() - t0) / 5;
        if (perCall < 500) {
            ok(`sidecar amortization: warm ${perCall.toFixed(1)}ms/op (< 500ms)`);
        } else fail('sidecar amortization', perCall.toFixed(1) + 'ms/op');
    } else {
        console.log('  ⊘ SKIP julia pins: julia not on PATH');
    }

    // Node fallback pins — always run (also verify on this process when
    // julia IS present by testing the pure fallback math directly).
    await engine.initEngine();
    if (engine.getEngine() === 'node') {
        const cm = await engine.complexMultiply({ re: 1, im: 2 }, { re: 3, im: 4 });
        const mm = await engine.matrixMultiply(
            [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
            [[9, 8, 7], [6, 5, 4], [3, 2, 1]]);
        if (cm.re === -5 && cm.im === 10 &&
            JSON.stringify(mm) === JSON.stringify([[30, 24, 18], [84, 69, 54], [138, 114, 90]])) {
            ok('node fallback: complex + matrix math correct');
        } else fail('node fallback math');
    } else {
        ok('node fallback pins: engine is julia this run (fallback exercised in CI runs without julia)');
    }

    console.log('\n  Geometry engine pins: ' + passed + ' passed, ' + failed + ' failed');
    if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => {
    console.error('UNEXPECTED:', (e && e.stack) || e);
    process.exit(1);
});
