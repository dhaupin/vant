/**
 * OpenAI Embedder
 *
 * Uses OpenAI's ada-002 embedding model
 * Requires OPENAI_API_KEY environment variable
 *
 * Dimension: 1536
 */

class OpenAIEmbedder {
    constructor(options = {}) {
        this.dimension = 1536;
        this.name = 'openai';
        this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
        this.model = options.model || 'text-embedding-3-small';
        this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    }

    /**
     * Check if OpenAI is available
     * @returns {boolean}
     */
    isAvailable() {
        return !!this.apiKey;
    }

    /**
     * Generate embedding from text using OpenAI API
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} Embedding vector
     */
    async generate(text) {
        if (!this.isAvailable()) {
            throw new Error('OpenAI API key not available. Set OPENAI_API_KEY environment variable.');
        }

        const response = await fetch(`${this.baseUrl}/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                input: text
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.data[0].embedding;
    }

    /**
     * Generate embeddings for multiple texts
     * @param {string[]} texts - Array of texts to embed
     * @returns {Promise<number[][]>} Array of embedding vectors
     */
    async generateBatch(texts) {
        if (!this.isAvailable()) {
            throw new Error('OpenAI API key not available. Set OPENAI_API_KEY environment variable.');
        }

        const response = await fetch(`${this.baseUrl}/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                input: texts
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.data.map(item => item.embedding).sort((a, b) => a.index - b.index);
    }
}

module.exports = {
    OpenAIEmbedder,
    create: (options) => new OpenAIEmbedder(options)
};
