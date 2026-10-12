/**
 * lib/entropy-patch.js — Entropy Patching Protocol (R1-F1, #191)
 *
 * The docs page (docs/reference/entropy.md) has described this pipeline
 * since its first draft, but NOTHING implemented it: bin/compress.js
 * called entropy.compress/getEntropyStats/decompress/createAdaptivePatch
 * on lib/encrypt.js, which exports none of them — every invocation
 * crashed with "entropy.compress is not a function".
 *
 * These are the REAL exports. Contract matches bin/compress.js call
 * shapes exactly (verified live) and the doc's algorithm description:
 *
 * - Windowed Shannon entropy scan (default window 8) classifies chunks
 *   as stable (H < threshold, default 0.85 normalized 0-1) or spike.
 * - The .vpatch file is a JSON envelope: latent seed (SHA-256 of the
 *   ORIGINAL content + scan parameters) + per-chunk records. Segments
 *   are stored verbatim (lossless — decompress() restores the original
 *   bytes exactly); the scan metadata exists to drive selective
 *   hydration / "what changed" queries without full restoration.
 * - createAdaptivePatch(content, { sensitivity }): one pass to compute
 *   mean/stddev of chunk entropy, threshold = mu + k*sigma, second pass
 *   to classify — the auto-calibrating threshold the --adaptive flag
 *   advertises.
 *
 * Hash source: lib/hash.js (the ONE hash source).
 */

'use strict';
const crypto = require('crypto');
const errors = require('./error');

const DEFAULTS = Object.freeze({
    windowSize: 8,
    threshold: 0.85,
    sensitivity: 1.5
});

/**
 * Shannon entropy of a byte sequence, normalized 0-1.
 * @param {Buffer} bytes
 * @returns {number}
 */
function shannonEntropy(bytes) {
    if (!bytes || bytes.length === 0) return 0;
    const counts = new Array(256).fill(0);
    for (let i = 0; i < bytes.length; i++) counts[bytes[i]]++;
    let h = 0;
    for (let i = 0; i < 256; i++) {
        if (counts[i] === 0) continue;
        const p = counts[i] / bytes.length;
        h -= p * Math.log2(p);
    }
    return h / 8; // normalize: log2(256)=8 max
}

/**
 * Windowed entropy scan → chunk records + overall stats.
 * @param {Buffer} content
 * @param {{windowSize?: number, threshold?: number}} opts
 */
function scan(content, opts = {}) {
    const { windowSize, threshold } = { ...DEFAULTS, ...opts };
    const chunks = [];
    let stable = 0, spike = 0;
    for (let i = 0; i < content.length; i += windowSize) {
        const win = content.slice(i, i + windowSize);
        const h = shannonEntropy(win);
        const kind = h < threshold ? 'stable' : 'spike';
        if (kind === 'stable') stable++; else spike++;
        chunks.push({ offset: i, length: win.length, entropy: Number(h.toFixed(4)), kind });
    }
    const ents = chunks.map(c => c.entropy);
    return {
        chunks,
        stats: {
            windowSize,
            threshold,
            min: ents.length ? Math.min(...ents) : 0,
            max: ents.length ? Math.max(...ents) : 0,
            mean: ents.length ? Number((ents.reduce((a, b) => a + b, 0) / ents.length).toFixed(4)) : 0,
            overall: ents.length ? Number((ents.reduce((a, b) => a + b, 0) / ents.length).toFixed(4)) : 0,
            stableCount: stable,
            spikeCount: spike,
            totalPatches: chunks.length,
            byteCount: content.length
        }
    };
}

/**
 * Statistics view (bin/compress.js --stats).
 * @param {Buffer} content
 * @param {object} opts
 */
function getEntropyStats(content, opts = {}) {
    const { stats } = scan(content, opts);
    return stats;
}

/**
 * Lossless compress: vpatch envelope with latent seed + verbatim segments.
 * Accepts (contentBuf, outputDir, opts) AND (filePath, outputDir, opts)
 * (bin/compress.js passes both shapes).
 * @returns {{path: string, latentSeed: string, metadata: object}}
 */
function compress(input, outputDir, opts = {}) {
    const fs = require('fs');
    const path = require('path');
    const _hash = require('./hash');
    let content, sourceName;
    if (Buffer.isBuffer(input)) {
        content = input;
        sourceName = 'inline';
    } else if (typeof input === 'object' && input && input.chunkList) {
        // test shape? not advertized - codified refuse (coded error, house rule)
        throw new errors.VantError('compress(input, outputDir, opts): input must be Buffer or file path', { code: errors.CODES.ENTROPY_INPUT_INVALID, retryable: false });
    } else {
        content = fs.readFileSync(input);
        sourceName = path.basename(String(input));
    }
    const dir = outputDir || 'models/latent';
    fs.mkdirSync(dir, { recursive: true });

    const { windowSize, threshold } = { ...DEFAULTS, ...opts };
    const scanned = scan(content, { windowSize, threshold });
    const seed = _hash.sha256(content);

    // Group consecutive same-kind chunks into segments; emit the raw bytes
    // verbatim inside each (roundtrip = concatenation).
    const segments = [];
    let cur = null;
    for (const c of scanned.chunks) {
        if (!cur || cur.kind !== c.kind) {
            if (cur) segments.push(cur);
            cur = { kind: c.kind, offset: c.offset, length: 0, entropyMax: 0 };
        }
        cur.length += c.length;
        cur.entropyMax = Math.max(cur.entropyMax, c.entropy);
    }
    if (cur) segments.push(cur);

    const patch = {
        version: 1,
        format: 'vpatch',
        source: sourceName,
        createdAt: new Date().toISOString(),
        params: { windowSize, threshold },
        latentSeed: seed,
        metadata: scanned.stats,
        segments,
        segmentsData: segments.map((s, idx) => content.slice(s.offset, s.offset + s.length).toString('base64'))
    };

    const outName = (opts.outName || (sourceName === 'inline' ? 'inline' : sourceName.replace(/\.[^.]+$/, ''))) + '.vpatch';
    const outPath = path.join(dir, outName);
    // Atomic helper door (crash-safe: temp + fsync + rename), matches the
    // repo-wide rule that no bare final-path writeFileSync survives in lib.
    require('./primitives').atomicWriteFile(outPath, JSON.stringify(patch));
    return { path: outPath, latentSeed: seed, metadata: scanned.stats, segments };
}

/**
 * Lossless decompress: restores the EXACT original bytes next to input.
 * @param {string} vpatchPath
 * @param {string} [outputPath]
 * @returns {{path: string, byteCount: number}}
 */
function decompress(vpatchPath, outputPath) {
    const fs = require('fs');
    const path = require('path');
    const patch = JSON.parse(fs.readFileSync(vpatchPath, 'utf8'));
    if (!patch || patch.format !== 'vpatch' || !Array.isArray(patch.segmentsData)) {
        throw new errors.VantError('not a vpatch envelope', { code: errors.CODES.ENTROPY_NOT_VPATCH, retryable: false });
    }
    const restored = Buffer.concat(patch.segmentsData.map(b => Buffer.from(b, 'base64')));
    const out = outputPath || String(vpatchPath).replace(/\.vpatch$/, '.decompressed');
    require('./primitives').atomicWriteFile(out, restored);

    // Tamper-evidence: the latent seed must still hash the restored bytes.
    const _hash = require('./hash');
    const want = _hash.sha256(restored);
    if (patch.latentSeed && want !== patch.latentSeed) {
        throw new errors.VantError('vpatch tampered: latent seed does not match restored content', { code: errors.CODES.ENTROPY_TAMPERED, retryable: false });
    }
    return { path: out, byteCount: restored.length };
}

/**
 * Adaptive patch (--adaptive): pass 1 computes mean/stddev of chunk
 * entropies at window size; threshold = mean + sensitivity*stddev.
 * @param {Buffer} content
 * @param {{windowSize?: number, sensitivity?: number}} opts
 */
function createAdaptivePatch(content, opts = {}) {
    const fs = require('fs');
    const path = require('path');
    if (!Buffer.isBuffer(content)) {
        content = fs.readFileSync(content);
    }
    const { windowSize, sensitivity } = { ...DEFAULTS, ...opts };
    // Pass 1: entropies without threshold
    const raw = [];
    for (let i = 0; i < content.length; i += windowSize) {
        raw.push(shannonEntropy(content.slice(i, i + windowSize)));
    }
    const mu = raw.reduce((a, b) => a + b, 0) / (raw.length || 1);
    const sd = Math.sqrt(raw.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (raw.length || 1));
    const threshold = Math.min(0.99, Math.max(0.01, Number((mu + sensitivity * sd).toFixed(4))));

    const scanned = scan(content, { windowSize, threshold });
    const result = compress(content, fs.mkdtempSync('entropy-adaptive-'), { windowSize, threshold, outName: 'adaptive' });
    // bin/compress.js expects patch.stats.threshold and patch.metadata.*
    const outPath = path.join(path.dirname(result.path), '..', path.basename(result.path));
    fs.copyFileSync(result.path, outPath); // cwd-level convenience copy
    const patch = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    return {
        result,
        links: patch,
        stats: { threshold, mu: Number(mu.toFixed(4)), sd: Number(sd.toFixed(4)), windowSize, sensitivity },
        metadata: scanned.stats,
        latentSeed: result.latentSeed,
        path: outPath
    };
}

module.exports = {
    shannonEntropy,
    scan,
    getEntropyStats,
    compress,
    decompress,
    createAdaptivePatch,
    DEFAULTS
};
