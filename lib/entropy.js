/**
 * Entropy-Patch Protocol
 * Token-aware latent transport for Vant
 * 
 * Transforms Vant from a "Context Storage" system into a "Latent Transport" system
 * by detecting high-entropy regions in binary data and separating them from
 * stable (low-entropy) content.
 * 
 * Usage:
 *   const entropy = require('./entropy');
 *   const patches = await entropy.generatePatches(buffer);
 *   const hydrated = entropy.hydratePatches(patches);
 */

const { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } = require('fs');
const path = require('path');
const vaf = require('./vaf');

const LATENT_DIR = 'models/latent';
const DEFAULT_WINDOW_SIZE = 8;
const DEFAULT_THRESHOLD = 0.85; // Normalized entropy threshold 0-1

/**
 * Calculate Shannon entropy for a buffer
 * H = -Σ P(x) log₂ P(x) normalized to 0-1
 * @param {Buffer|Uint8Array} buffer - Data to analyze
 * @returns {number} Normalized entropy 0-1
 */
function calculateShannonEntropy(buffer) {
    const frequencies = new Array(256).fill(0);
    for (const byte of buffer) {
        frequencies[byte]++;
    }
    
    let entropy = 0;
    const len = buffer.length;
    
    for (const freq of frequencies) {
        if (freq === 0) continue;
        const p = freq / len;
        entropy -= p * Math.log2(p);
    }
    
    // Normalize to 0-1 (max entropy is 1.0 for uniform distribution)
    return entropy / 8;
}

/**
 * Generate entropy patches from binary data
 * Splits data into stable (low-entropy) and spike (high-entropy) regions
 * 
 * @param {Buffer|Uint8Array|string} input - Input data (Buffer, Uint8Array, or file path)
 * @param {object} options - Configuration options
 * @param {number} options.windowSize - Sliding window size (default: 8)
 * @param {number} options.threshold - Entropy threshold 0-1 (default: 0.85)
 * @param {boolean} options.isFile - Whether input is a file path
 * @returns {Array} Array of patch objects
 */
function generatePatches(input, options = {}) {
    const { 
        windowSize = DEFAULT_WINDOW_SIZE, 
        threshold = DEFAULT_THRESHOLD,
        isFile = false
    } = options;
    
    // Basic range validation
    if (windowSize < 1 || windowSize > 1024 || !Number.isInteger(windowSize)) {
        throw new Error('Invalid windowSize: must be integer between 1-1024');
    }
    if (threshold < 0 || threshold > 1) {
        throw new Error('Invalid threshold: must be between 0-1');
    }
    
    let buffer;
    
    if (isFile) {
        vaf.check(input, { type: 'path', name: 'inputFile' });
        buffer = readFileSync(input);
    } else if (typeof input === 'string') {
        buffer = Buffer.from(input, 'utf8');
    } else {
        buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
    }
    
    const patches = [];
    let currentStart = 0;
    
    for (let i = 0; i <= buffer.length - windowSize; i++) {
        const window = buffer.slice(i, i + windowSize);
        const entropy = calculateShannonEntropy(window);
        
        if (entropy > threshold) {
            // SPIKE DETECTED: Close the current stable patch and start a new spike
            if (i > currentStart) {
                patches.push({
                    type: 'stable',
                    data: buffer.slice(currentStart, i).toString('base64'),
                    start: currentStart,
                    end: i
                });
            }
            
            // Capture the high-entropy spike
            patches.push({
                type: 'spike',
                data: buffer.slice(i, i + windowSize).toString('base64'),
                entropy: entropy,
                start: i,
                end: i + windowSize
            });
            
            currentStart = i + windowSize;
            i += windowSize - 1; // Jump ahead
        }
    }
    
    // Capture remaining stable data
    if (currentStart < buffer.length) {
        patches.push({
            type: 'stable',
            data: buffer.slice(currentStart).toString('base64'),
            start: currentStart,
            end: buffer.length
        });
    }
    
    return patches;
}

/**
 * Generate a Vant Patch file (.vpatch)
 * Contains the latent seed and deltas
 * 
 * @param {Buffer|Uint8Array|string} input - Input data
 * @param {string} outputPath - Output file path
 * @param {object} options - Generation options
 * @returns {object} Patch metadata
 */
async function generateVPatch(input, outputPath, options = {}) {
    // VAF validate output path
    vaf.check(outputPath, { type: 'path', name: 'outputPath' });
    
    const patches = generatePatches(input, options);
    
    // Calculate latent seed (semantic summary)
    const latentSeed = generateLatentSeed(patches);
    
    const vpatch = {
        version: '1.0.0',
        created: new Date().toISOString(),
        type: 'vant-patch',
        latentSeed,
        patches,
        metadata: {
            totalPatches: patches.length,
            spikeCount: patches.filter(p => p.type === 'spike').length,
            stableCount: patches.filter(p => p.type === 'stable').length
        }
    };
    
    writeFileSync(outputPath, JSON.stringify(vpatch, null, 2));
    console.log(`[Entropy] Generated .vpatch: ${outputPath}`);
    
    return vpatch;
}

/**
 * Generate a latent seed (semantic summary of patches)
 * @param {Array} patches - Patch array
 * @returns {string} Latent seed
 */
function generateLatentSeed(patches) {
    const spikes = patches.filter(p => p.type === 'spike');
    
    if (spikes.length === 0) {
        // All stable data - use first/last chars as seed
        return patches.length > 0 ? 
            `stable:${patches[0].data.substring(0, 8)}...${patches[patches.length - 1].data.slice(-8)}` :
            'empty';
    }
    
    // Generate seed from spike entropy values
    const entropyValues = spikes.map(s => s.entropy.toFixed(2));
    return `spikes:${entropyValues.join(',')}`;
}

/**
 * Hydrate patches back to original binary
 * @param {Array} patches - Patch array
 * @returns {Buffer} Reconstructed data
 */
function hydratePatches(patches) {
    if (!Array.isArray(patches)) {
        throw new Error('Invalid patches: expected array');
    }
    
    const chunks = [];
    
    for (const patch of patches) {
        const decoded = Buffer.from(patch.data, 'base64');
        chunks.push(decoded);
    }
    
    return Buffer.concat(chunks);
}

/**
 * Load and hydrate a .vpatch file
 * @param {string} vpatchPath - Path to .vpatch file
 * @returns {Buffer} Hydrated data
 */
function hydrateVPatch(vpatchPath) {
    vaf.check(vpatchPath, { type: 'path', name: 'vpatchPath' });
    
    const content = readFileSync(vpatchPath, 'utf8');
    const vpatch = JSON.parse(content);
    
    if (vpatch.type !== 'vant-patch') {
        throw new Error('Invalid .vpatch format');
    }
    
    return hydratePatches(vpatch.patches);
}

/**
 * Compress a file or folder to .vpatch
 * CLI entry point
 * 
 * @param {string} inputPath - Input file or folder path
 * @param {string} outputDir - Output directory
 * @param {object} options - Compression options
 */
async function compress(inputPath, outputDir = LATENT_DIR, options = {}) {
    vaf.check(inputPath, { type: 'path', name: 'inputPath' });
    vaf.check(outputDir, { type: 'path', name: 'outputDir' });
    
    const { windowSize, threshold } = options;
    
    // Ensure output directory exists
    try {
        mkdirSync(outputDir, { recursive: true });
    } catch (e) {
        // Directory exists
    }
    
    const stats = statSync(inputPath);
    const inputName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(outputDir, `${inputName}.vpatch`);
    
    if (stats.isDirectory()) {
        // Compress each file in directory
        const files = readdirSync(inputPath);
        const results = [];
        
        for (const file of files) {
            const filePath = path.join(inputPath, file);
            const fileStats = statSync(filePath);
            
            if (fileStats.isFile()) {
                const result = await generateVPatch(filePath, 
                    path.join(outputDir, `${file}.vpatch`), 
                    { windowSize, threshold, isFile: true }
                );
                results.push(result);
            }
        }
        
        console.log(`[Entropy] Compressed ${files.length} files to ${outputDir}`);
        return results;
    } else {
        // Single file
        return generateVPatch(inputPath, outputPath, { 
            windowSize, 
            threshold, 
            isFile: true 
        });
    }
}

/**
 * Decompress a .vpatch file back to original
 * @param {string} vpatchPath - Path to .vpatch file
 * @param {string} outputPath - Output file path (optional, returns buffer)
 * @returns {Buffer|string} Decompressed data or file
 */
function decompress(vpatchPath, outputPath = null) {
    const hydrated = hydrateVPatch(vpatchPath);
    
    if (outputPath) {
        writeFileSync(outputPath, hydrated);
        console.log(`[Entropy] Decompressed to: ${outputPath}`);
        return outputPath;
    }
    
    return hydrated;
}

/**
 * Get entropy statistics for a buffer
 * @param {Buffer|Uint8Array|string} input - Input data
 * @returns {object} Entropy statistics
 */
function getEntropyStats(input) {
    let buffer;
    
    if (typeof input === 'string') {
        buffer = Buffer.from(input, 'utf8');
    } else {
        buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
    }
    
    const overall = calculateShannonEntropy(buffer);
    
    // Calculate chunk-by-chunk for distribution
    const chunkSize = Math.max(1, Math.floor(buffer.length / 10));
    const chunkEntropies = [];
    
    for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.slice(i, Math.min(i + chunkSize, buffer.length));
        chunkEntropies.push(calculateShannonEntropy(chunk));
    }
    
    return {
        overall,
        min: Math.min(...chunkEntropies),
        max: Math.max(...chunkEntropies),
        mean: chunkEntropies.reduce((a, b) => a + b, 0) / chunkEntropies.length,
        chunkCount: chunkEntropies.length,
        byteCount: buffer.length
    };
}

/**
 * Create the latent directory if it doesn't exist
 */
class AdaptiveEntropy {
    constructor(options = {}) {
        this.windowSize = options.windowSize || 64;
        this.sensitivity = options.sensitivity || 1.5;
        this.historyLimit = options.historyLimit || 1000;
        this.history = [];
        this.stats = { count: 0, sum: 0, sumSq: 0, min: Infinity, max: -Infinity };
    }
    _addToHistory(entropy) {
        this.history.push(entropy);
        if (this.history.length > this.historyLimit) this.history.shift();
        this.stats.count++;
        this.stats.sum += entropy;
        this.stats.sumSq += entropy * entropy;
        this.stats.min = Math.min(this.stats.min, entropy);
        this.stats.max = Math.max(this.stats.max, entropy);
    }
    _mean() { return this.stats.count > 0 ? this.stats.sum / this.stats.count : 0; }
    _std() {
        if (this.stats.count < 2) return 0;
        const variance = (this.stats.sumSq - (this.stats.sum * this.stats.sum) / this.stats.count) / (this.stats.count - 1);
        return Math.sqrt(Math.max(0, variance));
    }
    getThreshold() { return Math.min(1, Math.max(0, this._mean() + (this.sensitivity * this._std()))); }
    isSpike(entropy) { return entropy > this.getThreshold(); }
    calculate(buffer) { return calculateShannonEntropy(buffer); }
    deassemble(buffer) {
        const patches = [];
        let currentStart = 0;
        const winSize = Math.min(this.windowSize, buffer.length);
        for (let i = 0; i <= buffer.length - winSize; i++) {
            const window = buffer.slice(i, i + winSize);
            const entropy = this.calculate(window);
            this._addToHistory(entropy);
            if (this.isSpike(entropy)) {
                if (i > currentStart) patches.push({ type: "stable", data: buffer.slice(currentStart, i).toString("base64"), start: currentStart, end: i });
                patches.push({ type: "spike", data: buffer.slice(i, i + winSize).toString("base64"), entropy, threshold: this.getThreshold(), start: i, end: i + winSize });
                currentStart = i + winSize;
                i += winSize - 1;
            }
        }
        if (currentStart < buffer.length) patches.push({ type: "stable", data: buffer.slice(currentStart).toString("base64"), start: currentStart, end: buffer.length });
        return patches;
    }
    getStats() { return { mean: this._mean(), std: this._std(), threshold: this.getThreshold(), count: this.stats.count, min: this.stats.min, max: this.stats.max }; }
}
function createAdaptivePatch(input, options = {}) {
    const adaptive = new AdaptiveEntropy(options);
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
    const patches = adaptive.deassemble(buffer);
    return { version: "1.0.0", adaptive: true, created: new Date().toISOString(), type: "vant-patch", patches, stats: adaptive.getStats(), metadata: { windowSize: adaptive.windowSize, sensitivity: adaptive.sensitivity, totalPatches: patches.length, spikeCount: patches.filter(p => p.type === "spike").length } };
}
function initLatentDir() {
    try {
        mkdirSync(LATENT_DIR, { recursive: true });
        console.log(`[Entropy] Initialized latent directory: ${LATENT_DIR}`);
    } catch (e) {
        // Already exists
    }
}

module.exports = {
    generatePatches,
    generateVPatch,
    hydratePatches,
    hydrateVPatch,
    compress,
    decompress,
    getEntropyStats,
    calculateShannonEntropy,
    generateLatentSeed,
    initLatentDir,
    // Constants
    LATENT_DIR,
    DEFAULT_WINDOW_SIZE,
    DEFAULT_THRESHOLD,
    // Aliases
    createPatch: generateVPatch,
    extractPatch: generatePatches,
    hydrate: hydratePatches,
    AdaptiveEntropy,
    createAdaptivePatch
};