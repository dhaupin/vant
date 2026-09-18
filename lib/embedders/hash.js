/**
 * Hash Embedder
 *
 * Word-hashing embedder - projects words to fixed dim via hash
 * Captures topical similarity without training
 * Based on "Entity Profile" approach from Recall paper
 *
 * This is the fallback embedder - works without any external dependencies
 */

const DIMENSION = 384;

class HashEmbedder {
    constructor(options = {}) {
        this.dimension = options.dimension || DIMENSION;
        this.name = 'hash';
    }

    /**
     * Generate embedding from text (word hashing)
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} Embedding vector
     */
    async generate(text) {
        const vec = new Float32Array(this.dimension);

        // Tokenize
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 1);

        // Hash each word to an index and vote
        for (const word of words) {
            const hash = this._hash(word);
            const idx = Math.abs(hash) % this.dimension;
            vec[idx] += 1; // Vote for this bucket

            // Also adjacent bucket - smooths the hash
            vec[(idx + 1) % this.dimension] += 0.5;
            vec[(idx - 1 + this.dimension) % this.dimension] += 0.5;
        }

        // Normalize vector
        return this._normalize(Array.from(vec));
    }

    /**
     * Generate embeddings for multiple texts
     * @param {string[]} texts - Array of texts to embed
     * @returns {Promise<number[][]>} Array of embedding vectors
     */
    async generateBatch(texts) {
        const results = [];
        for (const text of texts) {
            results.push(await this.generate(text));
        }
        return results;
    }

    /**
     * Hash string to integer
     * @private
     */
    _hash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h = h | h; // Convert to 32-bit int
        }
        return h;
    }

    /**
     * Normalize vector to unit length
     * @private
     */
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

module.exports = {
    HashEmbedder,
    create: (options) => new HashEmbedder(options)
};
