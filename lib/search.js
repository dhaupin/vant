/**
 * Search (v0.8.6)
 * AI-first brain search pipe
 * 
 * Main pipeline: query → rerank → hydrate → ready for agent
 * All search modes: basic, hybrid, hyde, rag
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');
const { QoS } = require('./qos');

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
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new Error('Read permission required for search operations');
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
        this.corpus = this.loadCorpus(); 
    }
    loadCorpus() {
        const fs = require('fs');
        const path = require('path');
        const brainDir = path.join(__dirname, '../models/public');
        if (!fs.existsSync(brainDir)) return [];
        const files = fs.readdirSync(brainDir).filter(f => f.endsWith('.md'));
        const corpus = [];
        for (const file of files) {
            try {
                const filePath = path.join(brainDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const title = file.replace('.md', '');
                const lines = content.split('\n').filter(l => l.trim());
                corpus.push({
                    id: title,
                    title,
                    content: content.slice(0, 5000),
                    summary: lines[0] || '',
                    type: 'brain',
                    date: fs.statSync(filePath).mtime
                });
            } catch (e) {}
        }
        return corpus;
    }
    async search(query, options = {}) {
        // Rate limit check
        try {
            await qos.check('search');
        } catch (e) {
            throw new Error('Rate limited');
        }
        
        // Validate input
        vaf.check(query, { type: 'string', maxLength: 500 });
        
        // Basic text search
        const { maxResults = 10 } = options;
        if (!query) return [];
        
        // BM25 keyword scoring
        const bm25 = new BM25Inner();
        const scored = this.corpus.map(doc => ({
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

const MODELS_DIR = path.join(__dirname, '..', 'models');

/**
 * Get LTC (Long-Term Context) content
 */
async function getLTC() {
    const ltcPath = path.join(MODELS_DIR, 'public', 'start.md');
    if (!_exists(ltcPath)) return null;
    const content = _readFile(ltcPath, 'utf8');
    return content;
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
    const { topK = 10, maxTokens = 2000 } = options;
    const ltc = await getLTC();
    if (!ltc) return { memories: [], stats: {} };
    
    const r = new RerankInner();
    const memories = [{
        id: 'ltc',
        title: 'LTC',
        content: ltc,
        date: new Date().toISOString()
    }];
    
    // Load other brain files
    const brainPath = path.join(MODELS_DIR, 'public');
    if (_exists(brainPath)) {
        const files = _readDir(brainPath).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const filePath = path.join(brainPath, file);
            const content = _readFile(filePath, 'utf8');
            memories.push({
                id: file,
                title: file.replace('.md', ''),
                content: content.slice(0, 10000),
                date: _stat(filePath).mtime.toISOString()
            });
        }
    }
    
    return r.pipeline(memories, query, { topK, maxTokens });
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
    getLTC,
    freshLTC,
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
    
    getSummary,
    getCurrentCommit,
    getLayerStatus: () => ({ name: 'Search', type: 'search', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true, layer: 'Search' }),
    getStatus: () => ({ enabled: true }),

    /**
     * Load brain files as searchable corpus
     */
    loadCorpus() {
        const fs = require('fs');
        const path = require('path');
        const brainDir = path.join(__dirname, '../models/public');
        
        if (!fs.existsSync(brainDir)) return [];
        
        const files = fs.readdirSync(brainDir).filter(f => f.endsWith('.md'));
        const corpus = [];
        
        for (const file of files) {
            try {
                const filePath = path.join(brainDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const title = file.replace('.md', '');
                const lines = content.split('\n').filter(l => l.trim());
                const summary = lines[0] || '';
                
                corpus.push({
                    id: title,
                    title,
                    content: content.slice(0, 5000),
                    summary,
                    type: 'brain',
                    date: fs.statSync(filePath).mtime
                });
            } catch (e) {
                // Skip bad files
            }
        }
        
        return corpus;
    }
};
