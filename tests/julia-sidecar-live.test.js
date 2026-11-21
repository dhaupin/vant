#!/usr/bin/env node
/**
 * Live Julia sidecar pin (pass 167).
 *
 * Live-smokes the REAL julia-srv.jl through lib/sidecar.js + SidecarConnector:
 *   1. spawn + health (JIT-inclusive start, bounded by startTimeout)
 *   2. real eval through the token-checked wire
 *   3. SidecarConnector round-trip (geometry-style workload)
 *   4. JIT amortization: 10 warm evals must average < 500ms each
 *      (the subprocess model pays 2-30s per call — the sidecar's whole point)
 *   5. clean /stop shutdown (exit 0)
 *
 * SKIPS (exit 0, counted as skip) when `julia` is not on PATH — CI and
 * foreign machines without the language are a supported configuration;
 * the wire contract itself is pinned protocol-level in
 * tests/sidecar.test.js (fake srv on the identical wire).
 *
 * Version/depot note: live-verified 2026-11-21 on Julia 1.11.1 (and earlier
 * on 1.10.4). Point JULIA_DEPOT_PATH at a pre-populated depot for a hermetic
 * run; a clean depot may resolve/precompile packages on first use.
 */

const { execFileSync } = require('child_process');

let juliaBin = null;
try {
    juliaBin = execFileSync('which', ['julia'], { encoding: 'utf8' }).trim();
} catch (e) { /* not installed */ }

if (!juliaBin) {
    console.log('  ⊘ SKIP: julia not on PATH (wire contract is pinned in tests/sidecar.test.js)');
    process.exit(0);
}

const { spawnAndWait, evalOn, stop, buildSpec } = require('../lib/sidecar');
const { SidecarConnector } = require('../lib/connectors/sidecar');
const juliaConnector = require('../lib/connectors/julia');

(async () => {
    console.log('  julia at ' + juliaBin);

    const { proc, spec } = await spawnAndWait(
        buildSpec('julia', { startTimeout: 120000 }));
    console.log('  ✓ spawn + health (sidecar on :' + spec.port + ', pid ' + proc.pid + ')');

    const r1 = await evalOn(spec, 'println("JULIA-LIVE: ", 2 + 2)');
    if (!(r1.success && r1.stdout.includes('JULIA-LIVE: 4'))) {
        console.error('  ✗ live eval — ' + JSON.stringify(r1));
        proc.kill(); process.exit(1);
    }
    console.log('  ✓ live eval through the token-checked wire');

    const c = new SidecarConnector({ lang: 'julia', mode: 'sidecar' });
    c._handle = { proc, spec };
    const r2 = await c.eval('println(3 * 7)');
    if (!(r2.success && r2.stdout === '21')) {
        console.error('  ✗ connector round-trip — ' + JSON.stringify(r2));
        proc.kill(); process.exit(1);
    }
    console.log('  ✓ SidecarConnector round-trip (geometry-style workload)');

    const invokeCode = juliaConnector._funcToCode('identity', { matrix: [[1, 2], [3, 4]] });
    const r3 = await evalOn(spec, invokeCode);
    if (!(r3.success && r3.stdout.includes('matrix') && !r3.stderr)) {
        console.error('  ✗ invoke codegen — ' + JSON.stringify(r3));
        proc.kill(); process.exit(1);
    }
    console.log('  ✓ invoke codegen parses + runs (JSON -> Julia Dict)');

    const r4 = await juliaConnector.invoke('identity', { matrix: [[1, 2], [3, 4]] });
    if (!(r4.success && r4.stdout.includes('matrix') && !r4.stderr)) {
        console.error('  ✗ invoke() round-trip — ' + JSON.stringify(r4));
        proc.kill(); process.exit(1);
    }
    console.log('  ✓ invoke() subprocess round-trip uses the same Julia literal');

    const t0 = Date.now();
    for (let i = 0; i < 10; i++) {
        const r = await evalOn(spec, 'println(' + i + ' * ' + i + ')');
        if (!r.success) {
            console.error('  ✗ warm eval — ' + JSON.stringify(r));
            proc.kill(); process.exit(1);
        }
    }
    const perCall = (Date.now() - t0) / 10;
    if (perCall >= 500) {
        console.error('  ✗ JIT amortization: warm per-call ' + perCall.toFixed(1) + 'ms >= 500ms');
        proc.kill(); process.exit(1);
    }
    console.log('  ✓ JIT amortization: warm per-call average ' + perCall.toFixed(1) + 'ms (< 500ms)');

    await stop(spec);
    // (CI run 39316186493) Julia's JIT teardown on a cold 2-core runner
    // can ride past a fixed 500ms wait — the pin then read a RUNNING julia
    // (exitCode null) as a dirty stop. Poll up to 15s for the real exit;
    // a process that refuses to die in that budget is a genuine failure.
    const stopDeadline = Date.now() + 15000;
    while (proc.exitCode === null && Date.now() < stopDeadline) {
        await new Promise(r => setTimeout(r, 200));
    }
    if (proc.exitCode !== 0) {
        console.error('  ✗ clean stop: exitCode ' + proc.exitCode + ' (waited up to 15s)');
        process.exit(1);
    }
    console.log('  ✓ clean /stop shutdown (exit 0)');

    console.log('  All live pins passed.');
    process.exit(0);
})().catch((e) => {
    console.error('UNEXPECTED:', (e && e.stack) || e);
    process.exit(1);
});
