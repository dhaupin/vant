const errors = require('./error');
/**
 * Storage Connectors (v0.8.6)
 * WITH EVENT EMISSIONS - DB connections emit globally
 *
 * Usage:
 *   const { getConnector } = require('./connector');
 *   const connector = getConnector('qdrant', { url: 'http://localhost:6333' });
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

const { VectorConnector, PineconeConnector } = require('./connectors/pinecone');

function getConnector(type, config = {}) {
    const connector = (() => {
        switch (type) {
            case 'pinecone':
                return new PineconeConnector(config);
            case 'qdrant':
                return new QdrantConnector(config);
            case 'weaviate':
                return new WeaviateConnector(config);
            default:
                throw new errors.VantError('Unknown connector type', { code: errors.CODES.VAF_INPUT_INVALID });
        }
    })();

    // EVENT: connector created (vector DB connected)
    _emit('connector:created', {
        type,
        hasConfig: !!config.url,
        timestamp: Date.now()
    });

    return connector;
}

/**
 * Qdrant Connector
 * Open-source vector search engine
 * @param {object} config - { url, apiKey, collection }
 */
class QdrantConnector extends VectorConnector {
    constructor(config = {}) {
        super(config);
        this.type = 'qdrant';
        this.url = config.url || 'http://localhost:6333';
        this.apiKey = config.apiKey || null;
        this.collection = config.collection || 'default';
        this._client = null;
    }

    async connect() {
        console.log(`[Storage/Qdrant] Connecting to ${this.url}`);
        // Basic readiness check - in real impl would use @qdrant/js-client-rest
        this._client = { ready: true };
        return this;
    }

    async add(id, text, metadata = {}) {
        // Would vectorize then upsert to Qdrant
        console.log(`[Storage/Qdrant] Add: ${id}`);
        return { id, success: true };
    }

    async search(query, options = {}) {
        // Would vectorize query then search Qdrant
        console.log(`[Storage/Qdrant] Search: ${query.slice(0, 50)}...`);
        return [];
    }

    async delete(id) {
        console.log(`[Storage/Qdrant] Delete: ${id}`);
        return { success: true };
    }
}

/**
 * Weaviate Connector
 * Open-source vector database
 * @param {object} config - { url, apiKey, class }
 */
class WeaviateConnector extends VectorConnector {
    constructor(config = {}) {
        super(config);
        this.type = 'weaviate';
        this.url = config.url || 'http://localhost:8080';
        this.apiKey = config.apiKey || null;
        this.class = config.class || 'Document';
    }

    async connect() {
        console.log(`[Storage/Weaviate] Connecting to ${this.url}`);
        this._client = { ready: true };
        return this;
    }

    async add(id, text, metadata = {}) {
        console.log(`[Storage/Weaviate] Add: ${id}`);
        return { id, success: true };
    }

    async search(query, options = {}) {
        console.log(`[Storage/Weaviate] Search: ${query.slice(0, 50)}...`);
        return [];
    }

    async delete(id) {
        console.log(`[Storage/Weaviate] Delete: ${id}`);
        return { success: true };
    }
}

module.exports = {
    getConnector,
    VectorConnector,
    PineconeConnector,
    QdrantConnector,
    WeaviateConnector,

    // Multibrain
    getBrainConnectorConfig,
    setBrainConnectorConfig,

    // Multibrain Stack
    getStackConnectorConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainConnectorConfigs = {};

function getBrainConnectorConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainConnectorConfigs[brainName] || { provider: 'pinecone' };
}

function setBrainConnectorConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainConnectorConfigs[brainName] = config;
    return true;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackConnectorConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainConnectorConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
