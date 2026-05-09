/**
 * Vector Store (v0.8.6)
 * Local embedding-based semantic memory
 * 
 * NOT connected to GitHub - avoids ToS issues
 * Uses local SIMD-style encoding + cosine similarity
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');

const VECTORS_FILE = 'vectors.json';
const DIMENSION = 128; // Local fixed dimension

// In-memory vectors
let _vectors = null;
let _dirty = false;

/**
 * Simple hash to vector (local encoding)
 * Not ML-based - avoids external deps
 */
function hashToVector(text) {
    const hash = simpleHash(text);
    const vec = new Float32Array(DIMENSION);
    
    // Fill with hash-derived values
    for (let i = 0; i < DIMENSION; i++) {
        const seed = hash + i * 31;
        vec[i] = Math.sin(seed % 1000) * Math.cos(seed * 0.01);
    }
    
    // Normalize
    const mag = Math.sqrt(vec.reduce((a, v) => a + v * v, 0));
    if (mag > 0) vec.forEach((v, i) => vec[i] = v / mag);
    
    return Array.from(vec);
}

function simpleHash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

/**
 * Cosine similarity between vectors
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

/**
 * Load vectors from disk
 */
function loadVectors() {
    if (_vectors) return _vectors;
    
    const p = path.join(__dirname, '..', 'models', VECTORS_FILE);
    if (fs.existsSync(p)) {
        _vectors = JSON.parse(fs.readFileSync(p, 'utf8'));
    } else {
        _vectors = { embeddings: [], version: '0.8.6' };
    }
    return _vectors;
}

/**
 * Save vectors to disk
 */
function saveVectors() {
    if (!_dirty) return;
    
    const p = path.join(__dirname, '..', 'models');
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    
    fs.writeFileSync(path.join(p, VECTORS_FILE), JSON.stringify(_vectors, null, 2));
    _dirty = false;
}

/**
 * Add embedding
 */
function add(id, text, metadata = {}) {
    vaf.check(id, { type: 'string', maxLength: 100 });
    vaf.check(text, { type: 'string', maxLength: 10000 });
    
    const vectors = loadVectors();
    const embedding = hashToVector(text);
    
    vectors.embeddings.push({
        id,
        text: text.slice(0, 500), // Store preview
        vector: embedding,
        metadata,
        created: Date.now()
    });
    
    _vectors = vectors;
    _dirty = true;
    saveVectors();
    
    return { id, dimension: DIMENSION };
}

/**
 * Search similar
 */
function search(query, options = {}) {
    const { topK = 5, minScore = 0.1 } = options;
    
    const vectors = loadVectors();
    if (vectors.embeddings.length === 0) {
        return { results: [], count: 0 };
    }
    
    const queryVec = hashToVector(query);
    const results = [];
    
    for (const emb of vectors.embeddings) {
        const score = cosineSimilarity(queryVec, emb.vector);
        if (score >= minScore) {
            results.push({
                id: emb.id,
                text: emb.text,
                score,
                metadata: emb.metadata
            });
        }
    }
    
    // Sort by score
    results.sort((a, b) => b.score - a.score);
    
    return {
        results: results.slice(0, topK),
        count: results.length,
        dimension: DIMENSION
    };
}

/**
 * Get by ID
 */
function get(id) {
    const vectors = loadVectors();
    return vectors.embeddings.find(e => e.id === id) || null;
}

/**
 * Delete
 */
function remove(id) {
    const vectors = loadVectors();
    const idx = vectors.embeddings.findIndex(e => e.id === id);
    if (idx >= 0) {
        vectors.embeddings.splice(idx, 1);
        _vectors = vectors;
        _dirty = true;
        saveVectors();
        return true;
    }
    return false;
}

/**
 * Count
 */
function count() {
    return loadVectors().embeddings.length;
}

/**
 * Clear all
 */
function clear() {
    _vectors = { embeddings: [], version: '0.8.6' };
    _dirty = true;
    saveVectors();
    return true;
}

module.exports = {
    add,
    search,
    get,
    remove,
    clear,
    count,
    hashToVector,
    cosineSimilarity,
    
    getLayerStatus: () => ({ name: 'VectorStore', type: 'vector', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, count: count() })
};
