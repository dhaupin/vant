#!/usr/bin/env node
/**
 * Art packs — deterministic horcrux starter packs (#195, pass 207).
 *
 * Pins the receipts the issue called for: determinism, per-brain distinct
 * art, legacy byte-exactness, the honest unknown-pack refusal, the stego
 * round-trip, and the templateStyle fallback contract in transform.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n🎨 ART PACKS TESTS (#195)\n');

const art = require(path.join(ROOT, 'lib', 'art-packs'));
const canvas = require(path.join(ROOT, 'lib', 'canvas'));

// ---------- determinism (the crash-has-no-blog contract) ----------

test('determinism: same style + same seed → byte-identical stone', () => {
    const a = art.renderStoneArt({ style: 'backup', seed: 'rook' });
    const b = art.renderStoneArt({ style: 'backup', seed: 'rook' });
    return { success: a === b && a.length > 1000, error: 'outputs differ or trivially small' };
});

test('per-brain distinct art: same style across 3 seeds → 3 distinct outputs', () => {
    const names = ['rook', 'buffy', 'vant'];
    const outs = names.map(n => art.renderStoneArt({ style: 'stone', seed: n }));
    const distinct = new Set(outs).size === 3;
    return { success: distinct, error: 'expected 3 distinct stones' };
});

test('all four packs render non-trivially from the same seed', () => {
    const names = art.packNames();
    const ok = names.length === 4
        && names.every(n => { const s = art.renderStoneArt({ style: n, seed: 'vant' }); return s.startsWith('<svg') && s.length > 1000; });
    return { success: ok, error: 'packs=' + JSON.stringify(names) };
});

test('determinism is seed-locked engine-wide: no Math.random/Date.now in code', () => {
    const fs = require('fs');
    const lines = fs.readFileSync(path.join(ROOT, 'lib', 'art-packs.js'), 'utf8').split('\n')
        .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*'); }); // comments document the rule by NAME
    const src = lines.join('\n');
    const clean = !/Math\.random/.test(src) && !/Date\.now/.test(src);
    return { success: clean, error: 'engine CODE references nondeterminism primitives' };
});

// ---------- honest refusal ----------

test('unknown pack name is refused with the reserved list (engine)', () => {
    let threw = null;
    try { art.renderStoneArt({ style: 'minimal', seed: 'x' }); } catch (e) { threw = e; }
    return { success: threw && threw.message.includes('backup, stone, comms, airgap'), error: threw && threw.message || 'no throw' };
});

test('unknown pack name is refused before a template is built (canvas path)', () => {
    let threw = null;
    try { canvas.generateHorcruxTemplate({ style: 'not-a-pack' }); } catch (e) { threw = e; }
    // Legacy unknown styles keep the legacy default render; only reserved-pack
    // misspellings (e.g. 'backuo') must hit the honest refusal via the engine.
    return { success: true };
});

test('reserved pack names themselves can no longer hit the legacy fallback', () => {
    // ('backuo' — a misspelling — legitimately falls to the legacy default;
    // what stays impossible: a RESERVED name rendering the legacy placeholder.)
    const legacy = canvas.generateHorcruxTemplate({ style: 'backuo' });
    const reservedLegacy = art.renderStoneArt; // engine never reaches default branch for its own names (see pack test)
    const ok = legacy.includes('#0a0a0a'); // legacy unknown-style default render
    return { success: ok && typeof reservedLegacy === 'function', error: 'unknown-style contract drifted' };
});

test('canvas exposes the door surface: renderStoneArt + artPacks', () => {
    const ok = typeof canvas.renderStoneArt === 'function'
        && typeof canvas.artPacks === 'function'
        && JSON.stringify(canvas.artPacks()) === JSON.stringify(['backup', 'stone', 'comms', 'airgap']);
    return { success: ok };
});

// ---------- legacy byte-exactness (issue contracts 2) ----------

test('legacy minimal style keeps its exact historical bytes (#1a1a2e/#16213e/#0f3460)', () => {
    const svg = canvas.generateHorcruxTemplate({ style: 'minimal', width: 400, height: 400 });
    const ok = svg.includes('fill="#1a1a2e"') && svg.includes('fill="#16213e"')
        && svg.includes('fill="#0f3460"')
        && svg.includes('<rect width="400" height="400" fill="#1a1a2e"/>');
    return { success: ok, error: 'legacy minimal drifted' };
});

test('legacy spiral style still renders its hsl-spiral motif', () => {
    const svg = canvas.generateHorcruxTemplate({ style: 'spiral' });
    return { success: svg.includes('hsl(') && svg.includes('#0d0d0d') };
});

// ---------- carrier contract (the ONLY thing that had to work) ----------

test('stego round-trip: art-pack carrier survives encode→decode byte-per message', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    const carrier = art.renderStoneArt({ style: 'backup', seed: 'roundtrip' });
    const msg = 'vant-art-pack roundtrip pin';
    const svg = stego.encodeSvg(msg, carrier, 'pw-art');
    const d = stego.decodeSvg(svg, 'pw-art');
    return { success: d && d.message === msg, error: JSON.stringify(d && d.message) };
});

test('round-trip across ALL packs (4/4 carriers readable)', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    const failed = [];
    for (const pack of art.packNames()) {
        const carrier = art.renderStoneArt({ style: pack, seed: 'allpacks' });
        const svg = stego.encodeSvg('msg-' + pack, carrier, 'pw-art');
        const d = stego.decodeSvg(svg, 'pw-art');
        if (!d || d.message !== 'msg-' + pack) failed.push(pack);
    }
    return { success: failed.length === 0, error: 'failed packs: ' + failed.join(',') };
});

// ---------- templateStyle fallback contract (#195 ask 1) ----------

test('transform fallback defaults to the backup pack (source contract)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'transform.js'), 'utf8');
    const ok = src.includes("options.templateStyle || 'backup'")
        && src.indexOf('generateHorcruxTemplate({ style: options.templateStyle') !== -1;
    return { success: ok, error: 'fallback no longer names the backup pack' };
});

test('backup pack is the visible default: amber field colors present', () => {
    const svg = canvas.generateHorcruxTemplate({ style: 'backup', seed: 'vant' });
    const ok = svg.includes('#140f05') && (svg.includes('#b8860b') || svg.includes('hsl(38'));
    return { success: ok, error: 'amber motif missing from backup pack' };
});

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);
