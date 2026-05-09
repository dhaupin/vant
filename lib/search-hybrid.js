/**
 * Vant Hybrid Search - Sparse + Dense RAG
 *
 * Combines:
 * - BM25 (Sparse/keyword): "VESC v3.4" exact match
 * - Vector (Dense/semantic): "nature medicine" → "herbalism"
 * - RRF fusion: Both results combined
 *
 * Usage:
 *   const search = require('./search-hybrid');
 *   const results = await search.query('herbalism plants');
 *   // Returns: { sparse: [], dense: [], fused: [], sources: [] }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODELS_PATH = path.join(__dirname, '..', 'models');
const INDEX_FILE = path.join(MODELS_PATH, '.search-index.json');
const VECTOR_FILE = path.join(MODELS_PATH, '.vector-index.json');

// Simple hash-based embeddings (for demo - replace with real embeddings in prod)
function simpleEmbed(text) {
    const hash = Encrypt.sha256;
    hash.update(text.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim());
    const digest = hash.digest();
    // Convert to simple vector (32 dims)
    const vec = [];
    for (let i = 0; i < 32; i++) {
        vec.push((digest[i % digest.length] - 128) / 127);
    }
    return vec;
}

// Cosine similarity
function cosineSim(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 0.0001);
}

/**
 * Load or build search index
 */
function getIndex() {
    if (fs.existsSync(INDEX_FILE)) {
        return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    }
    return { version: '1.0', documents: [] };
}

/**
 * Load or build vector index
 */
function getVectorIndex() {
    if (fs.existsSync(VECTOR_FILE)) {
        return JSON.parse(fs.readFileSync(VECTOR_FILE, 'utf8'));
    }
    return { version: '1.0', vectors: [] };
}

/**
 * Tokenize for BM25
 */
function tokenize(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
}

/**
 * BM25 Score (simplified)
 */
function bm25Score(query, doc, docLen, avgDL, k1 = 1.5, b = 0.75) {
    const terms = tokenize(query);
    const docTerms = tokenize(doc.content);
    const dl = docTerms.length;
    let score = 0;
    
    for (const term of terms) {
        const tf = docTerms.filter(t => t === term).length;
        if (tf > 0) {
            const idf = Math.log((1 + 1) / (tf + 1));
            score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgDL));
        }
    }
    return score;
}

/**
 * Search (Hybrid)
 * @param {string} query - Search query
 * @param {object} options - { topK, alpha }
 * @returns {object} Results
 */
async function search(query, options = {}) {
    const { topK = 5, alpha = 0.5 } = options;
    
    const index = getIndex();
    const vectorIndex = getVectorIndex();
    
    if (index.documents.length === 0) {
        return { sparse: [], dense: [], fused: [], sources: [] };
    }
    
    // Sparse (BM25)
    const avgDL = index.documents.reduce((a, d) => a + d.content.split(/\s+/).length, 0) / index.documents.length;
    const sparse = index.documents
        .map(doc => ({ ...doc, score: bm25Score(query, doc, doc.content.split(/\s+/).length, avgDL) }))
        .filter(d => d.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK * 2);
    
    // Dense (Vector)
    const queryVec = simpleEmbed(query);
    const dense = vectorIndex.vectors
        .map(v => ({ ...v, score: cosineSim(queryVec, v.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK * 2);
    
    // RRF Fusion
    const fused = rrfFuse(sparse, dense, alpha, topK);
    
    // Get sources
    const sources = fused.map(r => ({
        id: r.id,
        commit: r.commit,
        path: r.path
    }));
    
    return { sparse, dense, fused, sources };
}

/**
 * Reciprocal Rank Fusion
 */
function rrfFuse(sparse, dense, alpha = 0.5, topK = 5) {
    const merged = new Map();
    const k = 60;
    
    // Add sparse
    for (let i = 0; i < sparse.length; i++) {
        const doc = sparse[i];
        const score = (1 / (k + i + 1)) * alpha;
        const existing = merged.get(doc.id);
        merged.set(doc.id, { ...doc, rrf: (existing?.rrf || 0) + score });
    }
    
    // Add dense
    for (let i = 0; i < dense.length; i++) {
        const doc = dense[i];
        const score = (1 / (k + i + 1)) * (1 - alpha);
        const existing = merged.get(doc.id);
        merged.set(doc.id, { ...doc, rrf: (existing?.rrf || 0) + score });
    }
    
    return Array.from(merged.values())
        .sort((a, b) => b.rrf - a.rrf)
        .slice(0, topK);
}

/**
 * Index a document
 */
function indexDocument(doc) {
    const index = getIndex();
    const vectorIndex = getVectorIndex();
    
    const id = doc.id || Encrypt.generateId();
    const content = doc.content;
    const path = doc.path || '';
    const commit = doc.commit || '';
    
    // Add to BM25 index
    index.documents.push({ id, content, path, commit });
    
    // Add to vector index
    vectorIndex.vectors.push({
        id,
        content: content.substring(0, 500), // Truncate for embedding
        embedding: simpleEmbed(content),
        path,
        commit
    });
    
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
    fs.writeFileSync(VECTOR_FILE, JSON.stringify(vectorIndex, null, 2));
    
    console.log('[HybridSearch] Indexed: ' + id);
    return { success: true, id };
}

/**
 * Search stats
 */
function getStats() {
    const index = getIndex();
    const vectorIndex = getVectorIndex();
    
    return {
        documents: index.documents.length,
        vectors: vectorIndex.vectors.length,
        lastUpdate: index.lastUpdate || null
    };
}

module.exports = {
    search,
    indexDocument,
    getStats,
    getIndex,
    getVectorIndex
};