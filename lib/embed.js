/**
 * Embed (0.8.6)
 * Semantic embedding layer for Vant
 *
 * Uses embedders system with auto-detection:
 * - openai: OpenAI ada-002 (requires API key)
 * - local: Local transformers (requires @xenova/transformers)
 * - hash: Word hashing (fallback, always works)
 *
 * Security: Goes through unified pipeline:
 * - sandbox: capability checks
 * - vaf: input validation
 * - qos: rate limiting
 * - escrow: operation approval
 */

const _fs = require('fs');
const _path = require('path');
const errors = require('./error');

// Import embedders
const embedders = require('./embedders');

// Import unified pipeline
const pipeline = require('./pipeline');

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

/**
 * Execute through unified pipeline for security
 * @private
 */
async function _pipelineRun(text, options, operation) {
    const ctx = {
        input: text,
        text,
        options,
        operation: 'embed:generate',
        timestamp: Date.now()
    };

    // Embedding generation is a compute/read operation (no brain writes),
    // so it runs at PUBLIC capability level, not PRIVATE.
    return await pipeline.run(ctx, operation, { mode: pipeline.PUBLIC });
}

// ==================== EMBEDDING FUNCTIONS ====================

/**
 * Generate embedding for text using active provider
 * @param {string} text - Text to embed
 * @param {Object} options - Options: provider, dimensions
 * @returns {Promise<Array>} Embedding vector
 */
async function generate(text, options = {}) {
    return await _pipelineRun(text, options, async () => {
        const providerObj = options.provider || embedders.getProvider();
        const providerName = (providerObj?.name || providerObj);
        const capitalName = providerName.charAt(0).toUpperCase() + providerName.slice(1);
        const embedder = embedders[capitalName + 'Embedder'];

        if (!embedder) {
            throw new errors.VantError('Unknown provider: ' + providerName, {
                code: errors.CODES.EMBED_PROVIDER_INVALID
            });
        }

        // Instantiate and call
        const instance = new embedder();
        const result = await instance.generate(text);

        _emit('embed:generated', {
            provider: capitalName,
            textLength: text?.length,
            dimensions: result?.length
        });

        return result;
    });
}

/**
 * Generate embeddings for batch of texts
 * @param {Array} texts - Array of texts to embed
 * @param {Object} options - Options
 * @returns {Promise<Array>} Array of embedding vectors
 */
async function generateBatch(texts, options = {}) {
    if (!Array.isArray(texts)) {
        texts = [texts];
    }

    return await _pipelineRun(texts.join('|||'), options, async () => {
        const providerObj = options.provider || embedders.getProvider();
        const providerName = (providerObj?.name || providerObj);
        const capitalName = providerName.charAt(0).toUpperCase() + providerName.slice(1);
        const embedder = embedders[capitalName + 'Embedder'];

        if (!embedder) {
            throw new errors.VantError('Unknown provider: ' + providerName, {
                code: errors.CODES.EMBED_PROVIDER_INVALID
            });
        }

        const instance = new embedder();
        const results = await instance.generateBatch(texts);

        _emit('embed:batch', {
            provider: capitalName,
            count: texts.length
        });

        return results;
    });
}

/**
 * Generate embeddings across all brains in stack
 * @param {string} text - Text to embed
 * @param {Object} options - Options
 * @returns {Promise<Array>} Combined embeddings from all brains
 */
async function generateStack(text, options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const embedding = await generate(text, options);
            results.push({ brain: brainName, embedding });
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * Generate embeddings for batch of texts across all brains in the stack
 * @param {Array} texts - Array of texts to embed
 * @param {Object} options - Options
 * @returns {Promise<Object>} Combined embeddings by brain
 */
async function generateBatchStack(texts, options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const embeddings = await generateBatch(texts, options);
            results.byBrain[brainName] = embeddings;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

// ==================== UTILITIES ====================

/**
 * Get provider info
 */
function getProviderInfo() {
    return embedders.getInfo();
}

/**
 * Set active provider
 */
function setProvider(name) {
    embedders.setProvider(name);
}

/**
 * Get available providers
 */
function listProviders() {
    return embedders.listProviders();
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// (P4, prd-web.md 4 #18) project2d — the pod-side embedding-space
// PROJECTION the dashboard's semantic map consumes. Johnson–Lindenstrauss
// random projection to the plane with a FIXED seeded Gaussian matrix:
// same seed + same vectors = the same plot across processes and requests
// (deterministic mulberry32 PRNG + Box-Muller, no Math.random), so the
// map never jitters. Zero deps by the pod's own rule.
//
// Contract: vectors = non-empty equal-length numeric vectors; seed int
// (default 9, the NSC9 homology); returns { dims: 2, seed, points } where
// points[i]({ x, y }) pairs BY INDEX with the input vectors. Coordinates
// are scaled to a stable -1..1-ish box. Shape guards are typed: ragged
// arrays, non-numbers or NaN/Infinity in any vector answer
// E_EMBED_PROJECTION — a hostile vector never produces a silent NaN plot.
function project2d(vectors, seed = 9) {
    if (!Array.isArray(vectors) || vectors.length === 0) {
        throw new errors.VantError('project2d needs a non-empty vector array', { code: 'E_EMBED_PROJECTION' });
    }
    const dim = vectors[0].length;
    if (!Number.isInteger(dim) || dim <= 0) {
        throw new errors.VantError('project2d vectors must be non-empty numeric vectors', { code: 'E_EMBED_PROJECTION' });
    }
    for (const v of vectors) {
        if (!Array.isArray(v) || v.length !== dim) {
            throw new errors.VantError('project2d vectors must all share one length', { code: 'E_EMBED_PROJECTION' });
        }
        for (const c of v) {
            if (typeof c !== 'number' || !Number.isFinite(c)) {
                throw new errors.VantError('project2d vectors must be finite numbers', { code: 'E_EMBED_PROJECTION' });
            }
        }
    }
    let s = seed >>> 0 || 1;
    const rand = () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());
    // 2 x dim fixed projection matrix (row-major: row0 then row1)
    const probe = new Float64Array(dim * 2);
    for (let i = 0; i < dim * 2; i++) probe[i] = gauss();
    let scale = 0;
    const raw = vectors.map(vec => {
        let x = 0, y = 0;
        for (let j = 0; j < dim; j++) {
            x += vec[j] * probe[j];
            y += vec[j] * probe[dim + j];
        }
        const m = Math.max(Math.abs(x), Math.abs(y));
        if (m > scale) scale = m;
        return { x, y };
    });
    const den = scale > 0 ? scale : 1e-12;
    return {
        dims: 2,
        seed,
        points: raw.map(p => ({ x: p.x / den, y: p.y / den }))
    };
}

/**
 * Get embed status
 */
function getStatus() {
    return {
        name: 'Embed',
        version: require('./version'),
        provider: embedders.getProvider(),
        providers: embedders.listProviders(),
        pipeline: pipeline.getStatus()
    };
}

// ==================== EXPORTS ====================

module.exports = {
    // Core generation
    generate,
    generateBatch,
    generateStack,
    generateBatchStack,

    // (P4, prd-web.md #18) honest 2D projection for the dashboard map
    project2d,

    // Provider management
    getProviderInfo,
    setProvider,
    listProviders,
    getProvider: embedders.getProvider,

    // Constants
    EMBED_DIM: 384,

    // Utilities
    cosineSimilarity,
    getStatus
};
