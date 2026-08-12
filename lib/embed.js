const errors = require('./error');
/**
 * Embed (v0.8.7-axolotl)
 * Semantic embedding layer for Vant
 * 
 * Uses embedders system with auto-detection:
 * - openai: OpenAI ada-002 (requires API key)
 * - local: Local transformers (requires @xenova/transformers)
 * - hash: Word hashing (fallback, always works)
 * 
 * Security: Goes through brain pipeline when available:
 * - sandbox: capability checks
 * - vaf: input validation
 * - qos: rate limiting
 * - escrow: operation approval
 */

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

const fs = require('fs');
const path = require('path');

// Import embedders
const embedders = require('./embedders');

// ==================== SANDBOX + QOS ====================
// Lazy load sandbox and qos for security
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

/**
 * Execute through sandbox + QoS for security and rate limiting
 * @private
 */
let _qos = null;
let _qosInstance = null;
async function _pipelineRun(text, options, operation) {
    // 1. Sandbox capability check is done in _checkWrite/_checkRead
    
    // 2. QoS: Rate limiting for embed operations
    if (!_qos) {
        try { _qos = require('./qos'); } catch (e) {}
    }
    
    // Use QoS class for rate limiting (max 60/min, 10/sec)
    if (_qos && _qos.QoS) {
        if (!_qosInstance) {
            _qosInstance = new _qos.QoS({ maxPerMinute: 60, maxPerSecond: 10 });
        }
        
        try {
            await _qosInstance.check('_embed_', 'generate');
        } catch (e) {
            _emit('embed:rate-limited', { textLength: text?.length, timestamp: Date.now() });
            throw new errors.VantError('ERATE: embed rate limit exceeded', { 
                code: errors.CODES.RATE_LIMITED,
                retryable: true 
            });
        }
    }
    
    // 3. Execute the operation
    return await operation();
}

function _checkWrite(userCtx, resource) {
    const sandbox = _getSandbox();
    // Capability check
    if (sandbox && sandbox.can && !sandbox.can('canWrite')) {
        throw new errors.VantError('ECAP: write not allowed', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }
    // Auto-chain to RLS
    if (userCtx && sandbox && sandbox.rls) {
        sandbox.rls.checkWrite(userCtx, resource, 'write');
    }
}

function _checkRead(userCtx, resource) {
    const sandbox = _getSandbox();
    // Capability check
    if (sandbox && sandbox.can && !sandbox.can('canRead')) {
        throw new errors.VantError('ECAP: read not allowed', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }
    // Auto-chain to RLS
    if (userCtx && sandbox && sandbox.rls) {
        sandbox.rls.checkRead(userCtx, resource, 'read');
    }
}

// Dimensions for compatibility (hash embedder default)
const EMBED_DIM = 384;

/**
 * Generate embedding from text
 * @param {string} text - Text to embed
 * @param {Object} options - Options: userCtx, brain (for multibrain context)
 */
async function generate(text, options = {}) {
    // Run through brain pipeline if available
    return await _pipelineRun(text, options, async () => {
        // Auto-chain through sandbox (capability + RLS)
        _checkWrite(options.userCtx, '_embed:vector');

        // MULTIBRAIN: Track brain context in events
        const brainCtx = options.brain || (() => {
            try {
                const brainMod = require('./brain');
                return brainMod.currentBrain ? brainMod.currentBrain() : null;
            } catch (e) { return null; }
        })();

        _emit('embed:generating', { textLength: text?.length, brain: brainCtx, timestamp: Date.now() });
        
        // Get provider from embedders
        const provider = embedders.getProvider();
        const result = await provider.generate(text);
        
        // Normalize to consistent dimension if needed
        if (result.length !== EMBED_DIM) {
            const normalized = _normalize(result, EMBED_DIM);
            
            _emit('embed:generated', { dimension: EMBED_DIM, brain: brainCtx, timestamp: Date.now() });
            
            return normalized;
        }
        
        _emit('embed:generated', { dimension: result.length, brain: brainCtx, timestamp: Date.now() });
        
        return result;
    });
}

/**
 * Generate embeddings for multiple texts
 * @param {Array} texts - Array of texts to embed
 * @param {Object} options - Options: userCtx, brain (for multibrain context)
 */
async function generateBatch(texts, options = {}) {
    // Run through brain pipeline if available
    return await _pipelineRun(texts.join('|||'), options, async () => {
        // MULTIBRAIN: Track brain context
        const brainCtx = options.brain || (() => {
            try {
                const brainMod = require('./brain');
                return brainMod.currentBrain ? brainMod.currentBrain() : null;
            } catch (e) { return null; }
        })();
        
        _emit('embed:batch:starting', { count: texts.length, brain: brainCtx, timestamp: Date.now() });
        
        // Get provider from embedders
        const provider = embedders.getProvider();
        const results = await provider.generateBatch(texts);
        
        _emit('embed:batch:complete', { count: texts.length, brain: brainCtx, timestamp: Date.now() });
        
        return results;
    });
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Resample/normalize vector to target dimension
 */
function _normalize(vec, targetDim) {
    const result = new Array(targetDim).fill(0);
    
    if (vec.length === 0) return result;
    
    // Simple interpolation - spread values across target dim
    const ratio = vec.length / targetDim;
    for (let i = 0; i < targetDim; i++) {
        const srcIdx = Math.floor(i * ratio);
        result[i] = vec[Math.min(srcIdx, vec.length - 1)];
    }
    
    return result;
}

// ==================== EMBEDDERS FALLBACK ====================
// Embedders are now in lib/embedders/
// This module provides generate() which uses embedders auto-detection

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Generate embeddings across all brains in the stack
 * Each brain may have different embedders
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

module.exports = {
    // Core generation functions
    generate,
    generateBatch,
    cosineSimilarity,
    EMBED_DIM,
    
    // Provider management
    setProvider: embedders.setProvider,
    getProvider: embedders.getProvider,
    listProviders: embedders.listProviders,
    getProviderInfo: embedders.getInfo,
    
    // Multibrain Stack
    generateStack,
    generateBatchStack
};