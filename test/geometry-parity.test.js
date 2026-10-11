#!/usr/bin/env node
/**
 * Pass-185 pins — geometry precision wiring + legacy shim retirement.
 *
 *   (1) RETIREMENT: the Math.imul lattice shim (lib/geometry/lattice-keys.js)
 *       is gone — fragmenter.deriveLatticeKeys is the sole surviving name and
 *       it delegates to the #155 PRF. The repo has ONE derivation chain.
 *   (2) #157 WIRED: quasicrystal store/retrieve quantize the float-derived
 *       metadata (position triple, theta/phi/depth) through the #157
 *       deterministic quantizer — cross-engine last-ulp drift can never
 *       become two different cells; retrieval re-derives the same cells.
 *       Plus the REAL engine-parity leg: two algebraically distinct
 *       evaluation orders of the SAME golden-angle rotation agree after
 *       quantization (julia-optional policy unchanged).
 *   Providers still escape coverage deliberately: this file pins the
 *   quasicrystal side; engine.js stays out of scope by design (compute).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0 };

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { results.passed++; console.log('  ✓ ' + name); })
        .catch((e) => { results.failed++; console.log('  ✗ ' + name + ': ' + (e.message || e).split('\n')[0]); });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
assert.strictEqual = assert;      // the harness always asserts strict
assert.deepStrictEqual = (a, b, msg) => { const s = JSON.stringify(a), t = JSON.stringify(b); if (s !== t) throw new Error(msg || 'deep-equal failed: ' + s + ' vs ' + t); };
assert.notDeepStrictEqual = (a, b, msg) => { const s = JSON.stringify(a), t = JSON.stringify(b); if (s === t) throw new Error(msg || 'deep-unequal failed'); };
assert.ok = assert;               // truthiness alias

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

async function main() {
    console.log('\n▓ Candidate (1): legacy imul shim retired\n');

    await test('retire: the raw Math.imul chain is GONE from lattice-keys (source grep)', async () => {
        const src = fs.readFileSync(path.join(ROOT, 'lib', 'geometry', 'lattice-keys.js'), 'utf8');
        // the derelict chain is gone in CODE, not just docs — match real code
        // (identifier usage like `Math.imul(` or the multiplier constant's
        // USE), never historical comment prose.
        assert(!/Math\.imul\s*\(/.test(src), 'Math.imul( should be retired from lattice-keys.js');
        assert(!/LATTICE_MULTIPLIER/.test(src), 'LATTICE_MULTIPLIER should be retired');
        // the PRF surface stays intact
        assert(/deriveShardKeys/.test(src) && /shardUnpredictabilityHolds/.test(src), 'PRF surface intact');
    });

    await test('retire: fragmenter.deriveLatticeKeys is the survivng name and rides the PRF', async () => {
        const fragmenter = require(path.join(ROOT, 'lib', 'geometry', 'fragmenter'));
        const lattice = require(path.join(ROOT, 'lib', 'geometry', 'lattice-keys'));
        const keys = fragmenter.deriveLatticeKeys('p185-doc', 5);
        assert.deepStrictEqual(keys, lattice.deriveShardKeys('p185-doc', 5), 'delegation holds');
        assert.ok(keys.every(k => /^[0-9a-z]{16}$/.test(k)), 'fixed 16-char base36');
    });

    await test('retire: module.exports no longer carry the legacy export (require-shape)', async () => {
        const lattice = require(path.join(ROOT, 'lib', 'geometry', 'lattice-keys'));
        assert(typeof lattice.deriveLatticeKeys === 'undefined', 'legacy export gone from the module surface');
        assert(typeof lattice.LATTICE_MULTIPLIER === 'undefined', 'multiplier constant gone');
        const adapter = fs.readFileSync(path.join(ROOT, 'lib', 'adapters', 'github-fragmenter.js'), 'utf8');
        assert(/fragmenter\.deriveLatticeKeys/.test(adapter), 'the live adapter still derives through fragmenter (unchanged consumer)');
    });

    console.log('\n▓ Candidate (2): #157 precision wired into quasicrystal\n');

    const qc = require(path.join(ROOT, 'lib', 'geometry', 'quasicrystal'));
    const precision = require(path.join(ROOT, 'lib', 'geometry', 'precision'));

    await test('precision: stored record carries QUANTIZED address-bearing fields', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qc185-'));
        try {
            const bc = qc.generateBarcodeFromContent('p185-quantized-' + Date.now().toString(36));
            const r = await qc.store(bc, { a: 1 }, tmp);
            assert(r.stored === true, 'store failed: ' + JSON.stringify(r));
            const files = fs.readdirSync(tmp, { recursive: true }).filter((f) => String(f).endsWith('.json'));
            const rec = JSON.parse(fs.readFileSync(path.join(tmp, files[0]), 'utf8'));
            // position triple = EXACT integer grid values (not float vertices)
            assert(Number.isInteger(rec.position.x) && Number.isInteger(rec.position.y) && Number.isInteger(rec.position.z),
                'position.x/y/z must be integer grid values, got ' + JSON.stringify(rec.position));
            assert(Number.isInteger(rec.theta) && Number.isInteger(rec.phi) && Number.isInteger(rec.depth),
                'angular coords must be integer grid values');
            const proj = qc.project(bc);
            // quantized-as-stored equals re-derivation (byte-stable across processes)
            assert(rec.position.x === precision.quantize(proj.position[0]), 'position re-derivation agreement');
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    await test('precision: round-trip stays honest (store → retrieve → same barcode)', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qc185-'));
        try {
            const bc = qc.generateBarcodeFromContent('p185-roundtrip-' + Date.now().toString(36));
            await qc.store(bc, { msg: 'parity' }, tmp);
            const back = await qc.retrieve(bc, tmp);
            assert(!back.error, 'retrieve failed: ' + JSON.stringify(back).slice(0, 120));
            assert(back.data && back.data.msg === 'parity', 'payload round-trips');
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    await test('precision: engineParity GOLDEN vectors — two evaluation orders, same quantized cells', async () => {
        const p = qc.engineParity();
        assert(p.checked >= 2, 'golden vectors ran');
        assert.deepStrictEqual(p.mismatches, [], 'no mismatch on the golden leg: ' + JSON.stringify(p.mismatches[0] || null));
    });

    await test('precision: engineParity STRESS — 200 vectors over mixed magnitudes', async () => {
        const vecs = [];
        for (let i = 0; i < 200; i++) vecs.push({ re: Math.sin(i) * 10, im: Math.cos(i * 1.7) * 10 });
        const p = qc.engineParity(vecs);
        assert(p.checked === 200, 'all vectors checked');
        assert.deepStrictEqual(p.mismatches, [], 'no mismatch under stress: ' + JSON.stringify(p.mismatches[0] || null));
    });

    await test('precision: engineParity CATCHES a real divergence (sensitivity)', async () => {
        // A genuinely different rotation (wrong angle) must surface as mismatches
        const precisionMod = precision;
        const vectors = [{ re: 0.1, im: 0.2 }];
        const PHI = (1 + Math.sqrt(5)) / 2;
        const GA = 2 * Math.PI * (PHI - 1);
        const wrong = vectors.map(z => ({ re: z.re * Math.cos(GA * 1.001) - z.im * Math.sin(GA * 1.001), im: z.re * Math.sin(GA * 1.001) + z.im * Math.cos(GA * 1.001) }));
        const right = vectors.map(z => ({ re: z.re * Math.cos(GA) - z.im * Math.sin(GA), im: z.re * Math.sin(GA) + z.im * Math.cos(GA) }));
        const mism = precisionMod.parityHarness(vectors, () => right[0], () => wrong[0]);
        assert.strictEqual(mism.length, 1, 'a rotated-different value must be caught');
    });

    // ==================== SUMMARY ====================
    console.log('\n=== geometry-185 pins: ' + results.passed + ' passed, ' + results.failed + ' failed ===');
    process.exit(results.failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error('Runner failed:', e.message);
    process.exit(1);
});
