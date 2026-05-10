/**
 * Storage Connectors
 * External vector database connectors
 *
 * Usage:
 *   const { getConnector } = require('./connectors');
 *   const connector = getConnector('pinecone', { apiKey: 'xxx' });
 */

const { VectorConnector, PineconeConnector } = require('./pinecone');

function getConnector(type, config = {}) {
    switch (type) {
        case 'pinecone':
            return new PineconeConnector(config);
        case 'qdrant':
            // TODO: Implement Qdrant connector
            throw new Error('Qdrant connector not implemented');
        case 'weaviate':
            // TODO: Implement Weaviate connector
            throw new Error('Weaviate connector not implemented');
        default:
            throw new Error(`Unknown connector type: ${type}`);
    }
}

module.exports = {
    getConnector,
    VectorConnector,
    PineconeConnector
};