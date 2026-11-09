/**
 * Vant Connectors & Adapters Index
 *
 * Unified export for all cross-agent connectors
 *
 * Connectors (read/write brain format):
 *   - hermes.js: hermes-agent
 *   - crewai.js: crewAI multi-agent
 *   - pinecone.js: Pinecone vector DB
 *   - qdrant.js: NOT SHIPPED YET - the qdrant() factory requires './qdrant'
 *     and throws until that connector module lands (docs pass 306 probe)
 *   - weaviate.js: NOT SHIPPED YET - weaviate() factory, same gap
 *
 * Adapters (format conversion):
 *   - langchain.js: LangChain agents
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

// memstruct record format (dhaupin/memstruct, format id `memstruct@1`) — the
// store binding vant holds (vant#354). Pure data conversion (no service), so
// it sits with the adapters; export/import bridge a vant brain and a
// memstruct store. The record grammar is host-owned by memstruct; this is the
// vant side of the interchange.
function memstruct(config = {}) {
    const { MemstructAdapter } = require('../adapters/memstruct');
    return new MemstructAdapter(config);
}

// gamestruct game-agent lane bridge (dhaupin/gamestruct, SPEC v0.1.0) — vant
// is the BRAIN: this drives a gamestruct door's observe/act/wait_for/events
// over HTTP or the MCP binding. Pure client (no service of its own), so it
// sits with the adapters beside memstruct. All traffic rides lib/network.fetch
// (the SSRF wall); loopback doors are the default per the spec.
function gamestruct(config = {}) {
    const { GamestructAdapter } = require('../adapters/gamestruct');
    return new GamestructAdapter(config);
}

// Vector DB connectors (lazy-load)
function pinecone(config = {}) {
    const { PineconeConnector } = require('./pinecone');
    return new PineconeConnector(config);
}

// Object-storage connector (S3 API: AWS S3 / Cloudflare R2 / MinIO /
// Backblaze B2). Cloudflare R2 uses provider: 'r2' directly — no separate
// CF connector needed (the former connectors/cloudflare.js R2 facade was
// removed; see git history). Used by storage.js RemoteStorage
// (getStorage('remote')) as its wire client.
function s3(config = {}) {
    const s3mod = require('./s3');
    return s3mod.createClient(config);
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
    memstruct,
    gamestruct,

    // Vector DB connectors
    pinecone,
    qdrant,
    weaviate,

    // Object storage (S3 API)
    s3
};
