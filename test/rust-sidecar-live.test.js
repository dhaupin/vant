#!/usr/bin/env node
/**
 * Live Rust sidecar pin (pass 168).
 *
 * Live-smokes the REAL rust-srv (compiled by lib/sidecar.js on first use)
 * through lib/sidecar.js + SidecarConnector:
 *   1. cargo build + spawn + health (compile cached across runs)
 *   2. real eval through the token-checked wire
 *   3. SidecarConnector round-trip (sidecar mode)
 *   4. amortization: warm evals average < 2s each (rustc snippet compile
 *      is the floor — the sidecar still amortizes toolchain supervision
 *      and makes repeated evals one short compile, not a cold toolchain
 *      dance per call)
 *   5. clean /stop shutdown (exit 0)
 *
 * SKIPS (exit 0) when `rustc`/`cargo` are not on PATH — CI and foreign
 * machines without the toolchain are a supported configuration; the wire
 * contract itself is pinned protocol-level in test/sidecar.test.js
 * (fake srv on the identical wire).
 */

const { execFileSync } = require('child_process');

let rustcBin = null;
try {
    rustcBin = execFileSync('which', ['rustc'], { encoding: 'utf8' }).trim();
} catch (e) { /* not installed */ }

if (!rustcBin) {
    console.log('  ⊘ SKIP: rustc not on PATH (wire contract is pinned in test/sidecar.test.js)');
    process.exit(0);
}

const { spawnAndWait, evalOn, stop, buildCompiledSpec } = require('../lib/sidecar');
const { SidecarConnector } = require('../lib/connectors/sidecar');

(async () => {
    console.log('  rustc at ' + rustcBin);

    // First start pays the cargo build (bounded well above a cold build).
    const { proc, spec } = await spawnAndWait(
        buildCompiledSpec('rust', { startTimeout: 300000 }));
    console.log('  ✓ build + spawn + health (sidecar on :' + spec.port + ', pid ' + proc.pid + ')');

    const r1 = await evalOn(spec, 'println!("RUST-LIVE: {}", 2 + 2);', 60000);
    if (!(r1.success && r1.stdout.includes('RUST-LIVE: 4'))) {
        console.error('  ✗ live eval — ' + JSON.stringify(r1));
        proc.kill(); process.exit(1);
    }
    console.log('  ✓ live eval through the token-checked wire');

    const c = new SidecarConnector({ lang: 'rust', mode: 'sidecar' });
    c._handle = { proc, spec };
    const r2 = await c.eval('println!("{}", 3 * 7);', 60000);
    if (!(r2.success && r2.stdout === '21')) {
        console.error('  ✗ connector round-trip — ' + JSON.stringify(r2));
        proc.kill(); process.exit(1);
    }
    console.log('  ✓ SidecarConnector round-trip (sidecar mode)');

    const t0 = Date.now();
    for (let i = 0; i < 3; i++) {
        const r = await evalOn(spec, 'println!("{}", ' + i + ' * ' + i + ');', 60000);
        if (!r.success) {
            console.error('  ✗ warm eval — ' + JSON.stringify(r));
            proc.kill(); process.exit(1);
        }
    }
    const perCall = (Date.now() - t0) / 3;
    if (perCall >= 2000) {
        console.error('  ✗ amortization: warm per-call ' + perCall.toFixed(0) + 'ms >= 2000ms');
        proc.kill(); process.exit(1);
    }
    console.log('  ✓ amortization: warm per-call average ' + perCall.toFixed(0) + 'ms (< 2000ms)');

    await stop(spec);
    await new Promise(r => setTimeout(r, 500));
    if (proc.exitCode !== 0) {
        console.error('  ✗ clean stop: exitCode ' + proc.exitCode);
        process.exit(1);
    }
    console.log('  ✓ clean /stop shutdown (exit 0)');

    console.log('  All live pins passed.');
    process.exit(0);
})().catch((e) => {
    console.error('UNEXPECTED:', (e && e.stack) || e);
    process.exit(1);
});
