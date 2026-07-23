/**
 * Embed (v0.8.6-resonance)
 * WITH EVENT EMISSIONS - embedding generation emits globally
 * Semantic embedding layer for Vant
 * 
 * Pluggable embedders - real semantics when available
 * Default: TF-IDF baseline, swaps to transformers when deps added
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

// Embedder registry
const _embedders = new Map();

// Auto-chain through sandbox for capability + RLS
function _getSandbox() {
    let s = null;
    try { s = require('./sandbox'); } catch (e) {}
    return s;
}

function _checkWrite(userCtx, resource) {
    const sandbox = _getSandbox();
    // Capability check
    if (sandbox && sandbox.can && !sandbox.can('canWrite')) {
        throw new Error('ECAP: write not allowed');
    }
    // Auto-chain to RLS
    if (userCtx && sandbox && sandbox._rls) {
        sandbox._rls.checkWrite(userCtx, resource, 'write');
    }
}

function _checkRead(userCtx, resource) {
    const sandbox = _getSandbox();
    // Capability check
    if (sandbox && sandbox.can && !sandbox.can('canRead')) {
        throw new Error('ECAP: read not allowed');
    }
    // Auto-chain to RLS
    if (userCtx && sandbox && sandbox._rls) {
        sandbox._rls.checkRead(userCtx, resource, 'read');
    }
}


// Current embedder
let _currentEmbedder = null;

// Dimensions for compatibility
const EMBED_DIM = 384;

/**
 * Register an embedder
 */
function register(name, embedder) {
    _embedders.set(name, embedder);
}

/**
 * Set the active embedder
 */
function setEmbedder(name) {
    if (!_embedders.has(name)) {
        throw new Error(`Unknown embedder: ${name}. Available: ${[..._embedders.keys()].join(', ')}`);
    }
    _currentEmbedder = _embedders.get(name);
    return { embedder: name };
}

/**
 * Get current embedder info
 */
function getEmbedder() {
    return _currentEmbedder;
}

/**
 * List available embedders
 */
function listEmbedders() {
    return [..._embedders.keys()];
}

/**
 * Generate embedding from text
 * @param {string} text - Text to embed
 * @param {Object} options - Options: userCtx, brain (for multibrain context)
 */
async function embed(text, options = {}) {
    // Auto-chain through sandbox (capability + RLS)
    _checkWrite(options.userCtx, '_embed:vector');

    // MULTIBRAIN: Track brain context in events
    const brain = options.brain || (() => {
        try {
            const brainMod = require('./brain');
            return brainMod.currentBrain ? brainMod.currentBrain() : null;
        } catch (e) { return null; }
    })();

    _emit('embed:generating', { textLength: text?.length, brain, timestamp: Date.now() });
    
    if (!_currentEmbedder) {
        // Lazy load default
        setEmbedder('default');
    }
    
    const result = await _currentEmbedder.embed(text);
    
    // Normalize to consistent dimension
    if (result.length !== EMBED_DIM) {
        const normalized = _normalize(result, EMBED_DIM);
        
        _emit('embed:generated', { dimension: EMBED_DIM, brain, timestamp: Date.now() });
        
        return normalized;
    }
    
    _emit('embed:generated', { dimension: result.length, brain, timestamp: Date.now() });
    
    return result;
}

/**
 * Generate embeddings for multiple texts
 * @param {Array} texts - Array of texts to embed
 * @param {Object} options - Options: userCtx, brain (for multibrain context)
 */
async function embedBatch(texts, options = {}) {
    if (!_currentEmbedder) {
        setEmbedder('default');
    }
    
    // MULTIBRAIN: Track brain context
    const brain = options.brain || (() => {
        try {
            const brainMod = require('./brain');
            return brainMod.currentBrain ? brainMod.currentBrain() : null;
        } catch (e) { return null; }
    })();
    
    _emit('embed:batch:starting', { count: texts.length, brain, timestamp: Date.now() });
    
    if (_currentEmbedder.embedBatch) {
        const results = await _currentEmbedder.embedBatch(texts);
        _emit('embed:batch:complete', { count: texts.length, brain, timestamp: Date.now() });
        return results;
    }
    
    // Fallback to serial
    const results = [];
    for (const text of texts) {
        results.push(await embed(text, options));
    }
    
    _emit('embed:batch:complete', { count: texts.length, brain, timestamp: Date.now() });
    
    return results;
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

// ==================== DEFAULT EMBEDDER ====================

/**
 * Word-hashing embedder - projects words to fixed dim via hash
 * Captures topical similarity without training
 * Based on "Entity Profile" approach from Recall paper
 */
class DefaultEmbedder {
    constructor() {
        this.dim = EMBED_DIM;
    }
    
    /**
     * Generate embedding from text (word hashing)
     */
    async embed(text) {
        const vec = new Float32Array(this.dim);
        
        // Tokenize
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 1);
        
        // Hash each word to an index and vote
        for (const word of words) {
            const hash = this._hash(word);
            const idx = Math.abs(hash) % this.dim;
            vec[idx] += 1; // Vote for this bucket
            
            // Also adjacent bucket - smooths the hash
            vec[(idx + 1) % this.dim] += 0.5;
            vec[(idx - 1 + this.dim) % this.dim] += 0.5;
        }
        
        // Normalize vector
        return this._normalize(Array.from(vec));
    }
    
    /**
     * Hash string to integer
     */
    _hash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h = h | h; // Convert to 32-bit int
        }
        return h;
    }
    
    _normalize(vec) {
        let mag = 0;
        for (const v of vec) {
            mag += v * v;
        }
        mag = Math.sqrt(mag);
        
        if (mag === 0) return vec;
        
        for (let i = 0; i < vec.length; i++) {
            vec[i] /= mag;
        }
        
        return vec;
    }
}

const defaultEmbedder = new DefaultEmbedder();

register('default', defaultEmbedder);
register('tfidf', defaultEmbedder);

// ==================== ZERO-DEPENDENCY CORE ====================
// Default TF-IDF embedder works out of the box
// To upgrade: npm install @xenova/transformers and register your own embedder
//
// Example:
//   const embed = require('./embed');
//   // Create transformers embedder and register it
//   embed.register('transformers', yourEmbedderInstance);
//   embed.setEmbedder('transformers');

module.exports = {
    register,
    setEmbedder,
    getEmbedder,
    listEmbedders,
    embed,
    embedBatch,
    cosineSimilarity,
    EMBED_DIM
};