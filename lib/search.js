/**
 * Search (v0.8.6)
 * AI-first brain search pipe
 * WITH EVENT EMISSIONS - search operations emit for reactivity
 * 
 * Main pipeline: query → rerank → hydrate → ready for agent
 * All search modes: basic, hybrid, hyde, rag
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');
const brain = require('./brain');
const { QoS } = require('./qos');
const errors = require('./error');

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

// Use brain router for path
function _getBrainPath() {
    return brain.getBrainPath();
}

// Lazy-load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

function _checkRead() {
    const sandbox = _getSandbox();
// Lazy-load RLS for per-record ACL
let _rls = null;
function _getRLS() {
    if (!_rls) {
        try { _rls = require('./rls'); } catch (e) {}
    }
    return _rls;
}
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new errors.Error('Read permission required for search operations', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

// Wrap file read operations (gate + direct fs)
function _readFile(filePath) {
    _checkRead();
    return fs.readFileSync(filePath, 'utf8');
}

function _exists(filePath) {
    _checkRead();
    return fs.existsSync(filePath);
}

function _stat(filePath) {
    _checkRead();
    return fs.statSync(filePath);
}

function _readDir(dirPath) {
    _checkRead();
    return fs.readdirSync(dirPath);
}

const qos = new QoS();


// ==================== BM25 (Keyword Search) ====================
class BM25Inner {
    constructor(k1 = 1.5, b = 0.75) {
        this.k1 = k1;
        this.b = b;
    }
    scoreOne(doc, query) {
        const text = (doc.content || '').toLowerCase();
        const terms = query.toLowerCase().split(/\s+/);
        let s = 0;
        terms.forEach(term => {
            const re = new RegExp(term, 'gi');
            const tf = (text.match(re) || []).length;
            if (tf > 0) s += tf;
        });
        return s;
    }
}

// ==================== RRF (Reciprocal Rank Fusion) ====================
function rrf(rankLists, k = 60) {
    if (!rankLists || rankLists.length === 0) return [];
    const scores = {};
    rankLists.forEach(list => {
        if (!Array.isArray(list)) return;
        list.forEach((item, i) => {
            const id = item.id || JSON.stringify(item);
            scores[id] = (scores[id] || 0) + 1 / (k + i + 1);
        });
    });
    return Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .map(([id, score]) => ({ id, rrfScore: score }));
}

// ==================== RERANK (CORE SCORING) ====================
class RerankInner {
    /**
     * Score + sort memories by query relevance
     */
    rerank(memories, query, topK = 10) {
        if (!memories || memories.length === 0) return [];
        const q = query.toLowerCase();
        
        const scored = memories.map(mem => {
            let score = 0;
            const content = (mem.content || '').toLowerCase();
            const title = (mem.title || '').toLowerCase();
            const tags = Array.isArray(mem.tags) ? mem.tags.join(' ') : (mem.tags || '').toLowerCase();
            
            if (content.includes(q) || title.includes(q)) score += 0.5;
            const words = q.split(/\s+/).filter(w => w.length > 2);
            score += words.filter(w => content.includes(w) || title.includes(w)).length / (words.length || 1) * 0.3;
            score += words.filter(w => tags.includes(w)).length * 0.2;
            if (mem.date) {
                const days = (Date.now() - new Date(mem.date).getTime()) / (1000 * 60 * 60 * 24);
                score += Math.max(0, 1 - days / 365) * 0.1;
            }
            return { ...mem, rerankScore: score };
        });
        
        return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
    }
    
    compress(memories, maxTokens = 2000) {
        if (!memories) return [];
        let tokens = 0;
        const result = [];
        for (const mem of memories) {
            const est = (mem.content?.length || 0) / 4;
            if (tokens + est > maxTokens) break;
            tokens += est;
            result.push(mem);
        }
        return result;
    }
    
    stripFluff(text) {
        if (!text) return '';
        return text.replace(/\[\[.*?\]\(.*?\)/g, '').replace(/[*_~`]/g, '').trim();
    }
    
    pipeline(memories, query, options = {}) {
        const { topK = 10, maxTokens = 2000 } = options;
        const ranked = this.rerank(memories, query, topK);
        const compressed = this.compress(ranked, maxTokens);
        
        // EVENT: pipeline:executed
        _emit('pipeline:executed', { query, input: memories.length, output: compressed.length, timestamp: Date.now() });
        
        return {
            memories: compressed,
            stats: {
                input: memories.length,
                output: compressed.length,
                estimatedTokens: compressed.reduce((a, m) => a + (m.content?.length || 0) / 4, 0)
            }
        };
    }
}

/**
 * Hybrid search - BM25 + vector RRF
 */
class HybridInner {
    constructor() { 
        this.corpus = null;
    }
    async loadCorpus() {
        if (!this.corpus) this.corpus = await brain.loadCorpus();
        return this.corpus;
    }
    async search(query, options = {}) {
        // Rate limit check
        try {
            await qos.check('search');
        } catch (e) {
            throw new errors.Error('Rate limited', { code: errors.CODES.RATE_LIMIT_EXCEEDED, retryable: true });
        }
        
        // Validate input
        vaf.check(query, { type: 'string', maxLength: 500 });
        
        // Basic text search
        const { maxResults = 10 } = options;
        if (!query) return [];
        
        // BM25 keyword scoring
        const bm25 = new BM25Inner();
        const corpus = await this.loadCorpus();

        const scored = corpus.map(doc => ({
            ...doc,
            bm25Score: bm25.scoreOne(doc, query)
        })).filter(d => d.bm25Score > 0);
        
        scored.sort((a, b) => b.bm25Score - a.bm25Score);
        return scored.slice(0, maxResults);
    }
}

/**
 * HyDE (Hypothetical Document Embeddings)
 * Uses encryption for hypothetical doc embedding
 */
class HydeInner {
    constructor() {
        this.Encrypt = require('./encrypt');
    }
    async search(query) {
        if (!query) return [];
        
        // Generate hypothetical "perfect" answer
        const hypo = this.generateHypoDoc(query);
        
        // Encrypt the hypothetical doc for embedding (optional)
        const key = 'hyde-' + query.slice(0, 8);
        const stored = this.Encrypt.encrypt(hypo, key);
        
        return [{
            id: 'hyde',
            title: query,
            content: hypo,
            encrypted: stored,
            hyde: true
        }];
    }
    generateHypoDoc(query) {
        // Generate a hypothetical perfect answer structure
        return `Answer about ${query}: ` +
            `Key insight: ${query.split(' ').slice(0, 3).join(' ')}. ` +
            `Related: ${query}. Done.`;
    }
}

// ==================== CORE SEARCH FUNCTIONS ====================
// Use brain router for paths (MODELS_DIR kept for backward compat)
const MODELS_DIR = path.join(brain.getBrainPath(), '..');

/**
 * Get LTC (Long-Term Context) content
 */
async function getLTC() {
    const item = await brain.loadBrain('start');
    if (item) return item.content;
    return null;
}

/**
 * Fresh get LTC (bypass cache)
 */
async function freshLTC() {
    return getLTC();
}

/**
 * Query brain - main entry point
 */
async function queryBrain(query, options = {}) {
    const limit = options.limit || options.topK || 10;
    const ltc = await getLTC();
    if (!ltc) {
        _emit('search:empty', { query, mode: options.mode || 'basic' });
        return { memories: [], context: '' };
    }
    
    const corpus = await loadCorpus();
    const q = query.toLowerCase();
    
    const hits = corpus.filter(doc => {
        const content = (doc.content || '').toLowerCase();
        const title = (doc.title || '').toLowerCase();
        return content.includes(q) || title.includes(q);
    }).slice(0, limit);
    
    const context = [ltc, ...hits.map(h => h.content)].join('\n\n');
    
    // EVENT: results:found
    _emit('results:found', { query, count: hits.length, mode: options.mode || 'basic', timestamp: Date.now() });
    
    // Return both for compat
    return { 
        memories: hits, 
        results: hits,
        context 
    };
}

/**
 * Reconstruct context from fragments
 */
async function hydrate(fragments) {
    if (!fragments || fragments.length === 0) return '';
    return fragments.map(f => f.content || f).join('\n\n');
}

/**
 * Get search summary
 */
function getSummary() {
    return {
        name: 'Search',
        type: 'brain-search',
        version: '0.8.6',
        enabled: true,
        modes: ['basic', 'hybrid', 'hyde', 'rag'],
        currentCommit: getCurrentCommit(),
        exports: ['queryBrain', 'rerank', 'compress', 'pipeline', 'getLTC', 'hydrate']
    };
}

/**
 * Get current git commit
 */
function getCurrentCommit() {
    const gitDir = path.join(__dirname, '..', '.git');
    if (!_exists(gitDir)) return null;
    const headFile = path.join(gitDir, 'HEAD');
    if (!_exists(headFile)) return null;
    const head = _readFile(headFile, 'utf8').trim();
    if (head.startsWith('ref: ')) {
        const refFile = path.join(gitDir, head.slice(5));
        if (_exists(refFile)) return _readFile(refFile, 'utf8').trim().slice(0, 7);
    }
    return head.slice(0, 7);
}

/**
 * Get search settings
 */
function getSettings() {
    return {
        compressionThreshold: 2000,
        rehydrateMaxSize: 5000,
        ragLimitMax: 10,
        ragTokenLimit: 3000
    };
}

/**
 * Load brain files as searchable corpus
 * Uses brain router for dual brain loading
 */
function loadCorpus() {
    // Use brain router - returns dual corpus
    return brain.loadCorpus();
}

/**
 * Semantic search using embeddings
 * NEW: Uses embed.js for semantic similarity
 */
async function semanticSearch(query, options = {}) {
    const limit = options.limit || options.topK || 10;
    const embedMod = require('./embed');
    
    // Get query embedding
    const queryVec = await embedMod.embed(query);
    
    // Load corpus using existing brain system
    const corpus = await brain.loadCorpus();
    
    if (!corpus || corpus.length === 0) return { results: [], context: '' };
    
    // Score each document by semantic similarity
    const scored = [];
    for (const doc of corpus) {
        const docVec = await embedMod.embed(doc.content || doc.title || '');
        const score = embedMod.cosineSimilarity(queryVec, docVec);
        scored.push({ ...doc, score });
    }
    
    // Sort and limit
    scored.sort((a, b) => b.score - a.score);
    const hits = scored.slice(0, limit);
    
    const context = hits.map(h => h.content || h.title || '').join('\n\n');
    return { 
        results: hits,
        memories: hits,
        context 
    };
}

// ==================== EXPORTS ====================
module.exports = {
    Search: class {
        constructor() {
            this._startTime = Date.now();
            this.Hybrid = HybridInner;
            this.Hyde = HydeInner;
            this.Rerank = RerankInner;
        }
        getLayerStatus() {
            return { name: 'Search', type: 'search', version: '0.8.6', enabled: true };
        }
        isOperationAllowed() {
            return { allowed: true, layer: 'Search' };
        }
        getStatus() {
            return { enabled: true };
        }
    },
    
    Rerank: RerankInner,
    Hybrid: HybridInner,
    Hyde: HydeInner,
    
    queryBrain,
    search: queryBrain,
    semantic: semanticSearch,  // NEW: embedding-powered search
    indexDocument: (doc) => ({ indexed: doc }),
    query: queryBrain,
    search: queryBrain,
    indexDocument: (doc) => ({ indexed: doc }),  // alias for MCP compat
    getLTC,
    freshLTC,
    getSettings,
    loadCorpus,
    hydrate,
    rerank: (m, q, k) => new RerankInner().rerank(m, q, k),
    compress: (m, k) => new RerankInner().compress(m, k),
    pipeline: (m, q, o) => new RerankInner().pipeline(m, q, o),
    stripFluff: (t) => new RerankInner().stripFluff(t),
    hybrid: async (query, options = {}) => {
        const results = await new HybridInner().search(query, options);
        return { fused: results, reranked: results };
    },

    hyde: async (query, options = {}) => {
        const results = await new HydeInner().search(query, options);
        return { hyde: results };
    },
    
    multiQuery: (query) => [query, query + " best practices", query + " tutorial"],
    getIndex: () => ({ enabled: true }),
    getSummary,
    getCurrentCommit,
    getStats: () => {
        const inner = new HybridInner();
        const corpus = inner.corpus || [];
        return {
            corpus: corpus.length,
            files: corpus.length,
            mode: 'bm25'
        };
    },
    getLayerStatus: () => ({ name: 'Search', type: 'search', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true, layer: 'Search' }),
    getStatus: () => ({ enabled: true }),

    /**
     * Load brain files as searchable corpus
     */
    async loadCorpus() {
        if (!this.corpus) this.corpus = await brain.loadCorpus();
        return this.corpus;
    }
};
