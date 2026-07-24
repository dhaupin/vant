/**
 * Vant Connectors & Adapters Index
 * 
 * Unified export for all cross-agent connectors
 * 
 * Connectors (read/write brain format):
 *   - hermes.js: hermes-agent
 *   - crewai.js: crewAI multi-agent
 *   - pinecone.js: Pinecone vector DB
 *   - qdrant.js: Qdrant vector DB
 *   - weaviate.js: Weaviate vector DB
 * 
 * Adapters (format conversion):
 *   - langchain.js: LangChain agents
 *   - cloudflare.js: Cloudflare AI
 * 
 * Usage:
 *   const connectors = require('./connectors');
 *   const hermes = connectors.hermes(config);
 *   const crewai = connectors.crewai(config);
 *   const langchain = connectors.langchain(config);
 */

// Lazy-load connectors
function hermes(config = {}) {
    const { HermesConnector } = require('./hermes');
    return new HermesConnector(config);
}

function crewai(config = {}) {
    const { CrewAIConnector } = require('./crewai');
    return new CrewAIConnector(config);
}

function langchain(config = {}) {
    const { LangChainAdapter } = require('../adapters/langchain');
    return new LangChainAdapter(config);
}

// Vector DB connectors (lazy-load)
function pinecone(config = {}) {
    const { PineconeConnector } = require('./pinecone');
    return new PineconeConnector(config);
}

function qdrant(config = {}) {
    const { QdrantConnector } = require('./qdrant');
    return new QdrantConnector(config);
}

function weaviate(config = {}) {
    const { WeaviateConnector } = require('./weaviate');
    return new WeaviateConnector(config);
}

module.exports = {
    // Agent connectors
    hermes,
    crewai,
    
    // Agent adapters
    langchain,
    
    // Vector DB connectors
    pinecone,
    qdrant,
    weaviate
};
