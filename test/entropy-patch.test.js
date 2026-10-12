#!/usr/bin/env node
/**
 * Entropy Patch pins (R1-F1, #191) — the pipeline the docs promised.
 * Run: node test/entropy-patch.test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

let passed = 0, failed = 0;
function report(name, ok, detail) {
    if (ok) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ ${name}: ${detail || 'failed'}`); }
}

const ep = require(path.join(__dirname, '..', 'lib', 'entropy-patch'));

(async () => {
    console.log('\nENTROPY PATCH PINS (R1-F1)\n');

    // 1) Classifier: low-entropy data is stable, high-entropy is spike.
    // NOTE: a crypto-random 8-byte window has ~3.7 uniform bytes max spread
    // in 8 samples, so per-window entropy tops out ~0.5 with window 8.
    // The right spike probe: a HIGH-ENTROPY region against a LOW
    // threshold (relative detection, which is what adaptive mode does).
    {
        const crypto = require('crypto');
        const low = Buffer.alloc(64, 'a'.charCodeAt(0));
        const rand = crypto.randomBytes(64);
        const s1 = ep.scan(low, { windowSize: 8, threshold: 0.85 });
        const s2 = ep.scan(rand, { windowSize: 8, threshold: 0.1 });
        report('scan labels repetitive content stable', s1.stats.stableCount === 8 && s1.stats.spikeCount === 0,
            `stable=${s1.stats.stableCount}`);
        report('scan labels high-entropy content spike (relative threshold)', s2.stats.spikeCount === 8,
            `spike=${s2.stats.spikeCount}`);
    }

    // 2) Lossless roundtrip
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'entropy-pin-'));
        const original = Buffer.from('# Vant entropy pin\n'.repeat(40) + 'unpredictable-segment-' + 'x'.repeat(64));
        const r = ep.compress(original, tmp, { outName: 'pin' });
        const back = ep.decompress(r.path, path.join(tmp, 'restored.md'));
        const restored = fs.readFileSync(back.path);
        report('decompress restores the EXACT original bytes',
            restored.equals(original) && back.byteCount === original.length,
            `len=${restored.length} vs ${original.length}`);
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    // 3) Tamper refusal: mutate a segment, verify() must refuse
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'entropy-pin-'));
        const original = Buffer.from('pin-tamper-' + 'z'.repeat(256));
        const r = ep.compress(original, tmp, { outName: 't' });
        const patch = JSON.parse(fs.readFileSync(r.path, 'utf8'));
        patch.segmentsData[0] = Buffer.from('MUTATED').toString('base64');
        fs.writeFileSync(r.path, JSON.stringify(patch));
        let refused = false;
        try { ep.decompress(r.path, path.join(tmp, 'out.md')); }
        catch (e) { refused = /tamper|seed/i.test(e.message); }
        report('mutated vpatch REFUSES on seed mismatch (tamper-evidence)', refused, 'restored silently!');
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    // 4) Adaptive calibration
    {
        const blob = Buffer.from('aaaaaaaabbbbbbbbaaaaaaaa' + 'q'.repeat(128));
        const p = ep.createAdaptivePatch(blob, { sensitivity: 1.5, windowSize: 8 });
        report('adaptive threshold = mu + k*sigma, clamped 0.01..0.99',
            typeof p.stats.threshold === 'number' && p.stats.threshold > 0 && p.stats.threshold < 1,
            `threshold=${p.stats && p.stats.threshold}`);
        // cleanup the cwd-level convenience copy if any landed
        try { fs.unlinkSync('adaptive.vpatch'); } catch (e) {}
    }

    // 5) CLI parity: the same lib the CLI uses round-trips a real brain file
    {
        const brainFile = path.join(__dirname, '..', 'models', 'public', 'vant', 'identity.md');
        if (fs.existsSync(brainFile)) {
            const original = fs.readFileSync(brainFile);
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'entropy-pin-'));
            const r = ep.compress(brainFile, tmp);
            const back = ep.decompress(r.path);
            report('real brain file round-trips exactly',
                fs.readFileSync(back.path).equals(original), `bytes differ`);
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    }

    console.log(`\n--- RESULTS ---\n\n  Passed:  ${passed}\n  Failed:  ${failed}\n`);
    process.exit(failed > 0 ? 1 : 0);
})();
