/**
 * Embed (v0.9.0-axolotl)
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

const fs = require('fs');
const path = require('path');
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

    return await pipeline.run(ctx, operation, { mode: pipeline.PRIVATE });
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
            throw new errors.Error('Unknown provider: ' + providerName, {
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
            throw new errors.Error('Unknown provider: ' + providerName, {
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

/**
 * Get embed status
 */
function getStatus() {
    return {
        name: 'Embed',
        version: '0.9.0-axolotl',
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

    // Provider management
    getProviderInfo,
    setProvider,
    listProviders,
    getProvider: embedders.getProvider,

    // Constants
    EMBED_DIM: 384,

    // Utilities
    cosineSimilarity,
    getStatus,

    // Aliases for compatibility
    embed: generate,
    embedBatch: generateBatch
};
