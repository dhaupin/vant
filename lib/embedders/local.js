/**
 * Local Embedder
 * 
 * Uses local transformers (BERT, sentence-transformers)
 * Requires @xenova/transformers npm package
 * 
 * This is a lazy-load provider - only loads when actually used
 */

class LocalEmbedder {
    constructor(options = {}) {
        this.dimension = options.dimension || 384;
        this.name = 'local';
        this.model = options.model || 'Xenova/all-MiniLM-L6-v2';
        this._pipeline = null;
    }

    /**
     * Check if local transformers is available
     * @returns {boolean}
     */
    isAvailable() {
        try {
            require('@xenova/transformers');
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Load the transformers pipeline (lazy load)
     * @private
     */
    async _loadPipeline() {
        if (this._pipeline) return this._pipeline;

        try {
            const { pipeline } = require('@xenova/transformers');
            this._pipeline = await pipeline('feature-extraction', this.model);
            return this._pipeline;
        } catch (e) {
            throw new Error(`Failed to load local transformers: ${e.message}`);
        }
    }

    /**
     * Generate embedding from text using local transformers
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} Embedding vector
     */
    async generate(text) {
        const pipeline = await this._loadPipeline();
        
        const output = pipeline(text, {
            pooling: 'mean',
            normalize: true
        });

        // Convert to array if needed
        if (output.data) {
            return Array.from(output.data);
        }
        
        return Array.from(output);
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
}

module.exports = {
    LocalEmbedder,
    create: (options) => new LocalEmbedder(options)
};
