/**
 * Vector Connector Interface
 * Base class for external vector databases (Pinecone, Qdrant, Weaviate)
 *
 * Usage:
 *   const { PineconeConnector } = require('./pinecone');
 *   const connector = new PineconeConnector({ apiKey: process.env.PINECONE_API_KEY });
 *   
 * Environment:
 *   PINECONE_API_KEY - Your Pinecone API key
 *   PINECONE_ENV    - Environment (e.g., 'us-west1-gcp')
 *   PINECONE_INDEX  - Index name
 */

class VectorConnector {
    constructor(config = {}) {
        this.config = config;
        this.type = 'vector';
    }

    getType() {
        return this.type;
    }

    async connect() {
        throw new Error('Not implemented');
    }

    async add(id, text, metadata = {}) {
        throw new Error('Not implemented');
    }

    async search(query, options = {}) {
        throw new Error('Not implemented');
    }

    async delete(id) {
        throw new Error('Not implemented');
    }

    async close() {
        throw new Error('Not implemented');
    }
}

/**
 * Pinecone Connector
 * Full integration with Pinecone REST API
 * @param {object} config - { apiKey, environment, index, namespace }
 */
class PineconeConnector extends VectorConnector {
    constructor(config = {}) {
        super(config);
        this.type = 'pinecone';
        this.environment = config.environment || process.env.PINECONE_ENV;
        this.index = config.index || process.env.PINECONE_INDEX || 'default';
        this.namespace = config.namespace || null;
        this._client = null;
    }

    _getClient() {
        if (this._client) return this._client;
        
        const apiKey = this.config.apiKey || process.env.PINECONE_API_KEY;
        if (!apiKey) {
            throw new Error('PINECONE_API_KEY is required');
        }
        
        const baseUrl = `https://${this.environment}.pinecone.io`;
        this._client = {
            apiKey,
            baseUrl,
            async _request(method, path, body = null) {
                const headers = {
                    'Api-Key': apiKey,
                    'Content-Type': 'application/json'
                };
                const opts = { method, headers };
                if (body) opts.body = JSON.stringify(body);
                
                const res = await fetch(`${baseUrl}${path}`, opts);
                if (!res.ok) {
                    const err = await res.text();
                    throw new Error(`Pinecone API error: ${res.status} - ${err}`);
                }
                return res.json().catch(() => ());
            }
        };
        return this._client;
    }

    async connect() {
        const apiKey = this.config.apiKey || process.env.PINECONE_API_KEY;
        if (!apiKey) {
            return { 
                connected: false, 
                error: 'PINECONE_API_KEY Required',
                hint: 'Set PINECONE_API_KEY env var or pass { apiKey: "..." } in config'
            };
        }
        
        try {
            // Test connection by fetching index info
            const client = this._getClient();
            await client._request('GET', `/indexes/${this.index}`);
            return { 
                connected: true, 
                environment: this.environment,
                index: this.index
            };
        } catch (err) {
            return { 
                connected: false, 
                error: err.message,
                hint: `Check that index "${this.index}" exists in "${this.environment}"`
            };
        }
    }

    async add(id, text, metadata = {}) {
        const client = this._getClient();
        
        // Embed text using config embedding function or placeholder
        let vector = metadata.vector;
        if (!vector && this.config.embed) {
            vector = await this.config.embed(text);
        }
        if (!vector) {
            return { success: false, error: 'No vector provided and no embed function configured' };
        }
        
        const record = {
            id: String(id),
            values: vector,
            metadata: { text, ...metadata }
        };
        
        if (this.namespace) record.namespace = this.namespace;
        
        try {
            await client._request('POST', `/vectors/upsert`, {
                vectors: [record],
                namespace: this.namespace
            });
            return { success: true, id };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async search(query, options = {}) {
        const client = this._getClient();
        const topK = options.topK || 10;
        
        // Get query vector
        let vector = options.vector;
        if (!vector && this.config.embed) {
            vector = await this.config.embed(query);
        }
        if (!vector) {
            return { results: [], error: 'No query vector provided and no embed function configured' };
        }
        
        try {
            const response = await client._request('POST', `/query`, {
                vector,
                topK,
                namespace: this.namespace,
                includeMetadata: true,
                includeValues: options.includeValues || false
            });
            
            const results = (response.matches || []).map(match => ({
                id: match.id,
                score: match.score,
                text: match.metadata?.text,
                metadata: match.metadata
            }));
            
            return { results };
        } catch (err) {
            return { results: [], error: err.message };
        }
    }

    async delete(id) {
        const client = this._getClient();
        
        try {
            await client._request('POST', `/vectors/delete`, {
                ids: [String(id)],
                namespace: this.namespace
            });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async close() {
        this._client = null;
        return { closed: true };
    }
}

module.exports = {
    VectorConnector,
    PineconeConnector
};