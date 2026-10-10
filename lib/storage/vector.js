// Extracted verbatim from lib/storage.js (Wave D split — factory lib/storage.js re-exports). Requires flow through lib/storage/shared.js so the SECURITY PLUMBING stays single-source.
'use strict';
const _ = require('./shared');
const { embed, STORAGE_VERSION } = require('./shared');

// ==================== VECTOR STORAGE ====================
class VectorStorage {
    constructor(options = {}) {
        this.connector = options.connector || null;
        this.connectorConfig = options;
        this._data = new Map(); // Local fallback
        this.version = STORAGE_VERSION;
        this._embedder = options.embedder || null;
    }

    /**
     * Set custom embedder
     */
    setEmbedder(name) {
        if (name && embed) {
            embed.setEmbedder(name);
            this._embedder = name;
        }
        return { embedder: this._embedder };
    }

    // Get embedding from text (uses embed module)
    async _textToEmbedding(text) {
        if (this._embedder === 'legacy') {
            // Old hash fallback
            return this._hashToVector(text);
        }

        // New: use embed module (TF-IDF by default, swap to transformers if installed)
        try {
            return await embed.generate(text);
        } catch (e) {
            // Fallback to legacy hash
            return this._hashToVector(text);
        }
    }

    // Hash text to simple vector (legacy fallback) — via lib/hash.js (Wave C)
    _hashToVector(text) {
        const hash = Buffer.from(require('./hash').sha256(text), 'hex');
        const vec = [];
        for (let i = 0; i < 128; i++) {
            vec.push(hash[i % hash.length] / 255);
        }
        return vec;
    }

    // Cosine similarity
    _cosineSimilarity(a, b) {
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
        }
        return dot / (Math.sqrt(magA) * Math.sqrt(magB));
    }

    // Add document with embedding (legacy sync)
    add(id, text, metadata = {}) {
        if (this.connector && this.connector.add) {
            return this.connector.add(id, text, metadata);
        }

        // Legacy hash fallback
        this._data.set(id, {
            text,
            metadata,
            vector: this._hashToVector(text)
        });
        return true;
    }

    /**
     * Add document with semantic embedding (async, recommended)
     */
    async addAsync(id, text, metadata = {}) {
        if (this.connector && this.connector.addAsync) {
            return this.connector.addAsync(id, text, metadata);
        }

        // Compute embedding
        const vector = await this._textToEmbedding(text);

        this._data.set(id, {
            text,
            metadata,
            vector
        });

        return true;
    }

    /**
     * Batch add with embeddings
     */
    async addBulk(docs) {
        const results = [];

        for (const { id, text, metadata } of docs) {
            results.push(await this.addAsync(id, text, metadata));
        }

        return results;
    }

    search(query, options = {}) {
        const topK = options.topK || 5;

        if (this.connector && this.connector.search) {
            return this.connector.search(query, options);
        }

        // Legacy hash fallback
        const queryVec = this._hashToVector(query);
        const results = [];

        for (const [id, doc] of this._data) {
            const score = this._cosineSimilarity(queryVec, doc.vector);
            results.push({ id, text: doc.text, metadata: doc.metadata, score });
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    /**
     * Semantic search using embeddings (async, recommended)
     */
    async searchAsync(query, options = {}) {
        const topK = options.topK || 5;

        // Compute query embedding
        const queryVec = await this._textToEmbedding(query);

        const results = [];

        for (const [id, doc] of this._data) {
            const score = this._cosineSimilarity(queryVec, doc.vector);
            results.push({ id, text: doc.text, metadata: doc.metadata, score });
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    delete(id) {
        if (this.connector && this.connector.delete) {
            return this.connector.delete(id);
        }
        return this._data.delete(id);
    }

    connect(connector) {
        this.connector = connector;
    }
}


module.exports = { VectorStorage: VectorStorage };
