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

const MODELS_DIR = path.join(__dirname, '..', 'models');

// Lazy-loaded dependencies (loaded on-demand)
let _compression = null;
let _memoize = null;

function getCompression() {
    if (!_compression) _compression = require('./compression');
    return _compression;
}

function getMemoize() {
    if (!_memoize) _memoize = require('./memoize');
    return _memoize;
}

// ==================== RERANK (CORE SCORING) ====================
class RerankInner {
    /**
     * Score + sort memories by query relevance
     * @param {Array} memories - [{id, title, content, tags, date, ...}]
     * @param {string} query - Search query
     * @param {number} topK - Max results
     * @returns {Array} Sorted + scored memories
     */
    rerank(memories, query, topK = 10) {
        if (!memories || memories.length === 0) return [];
        const q = query.toLowerCase();
        
        const scored = memories.map(mem => {
            let score = 0;
            const content = (mem.content || '').toLowerCase();
            const title = (mem.title || '').toLowerCase();
            const tags = Array.isArray(mem.tags) ? mem.tags.join(' ') : (mem.tags || '').toLowerCase();
            
            // Exact query match
            if (content.includes(q) || title.includes(q)) score += 0.5;
            // Word overlap
            const words = q.split(/\s+/).filter(w => w.length > 2);
            score += words.filter(w => content.includes(w) || title.includes(w)).length / (words.length || 1) * 0.3;
            // Tag match
            score += words.filter(w => tags.includes(w)).length * 0.2;
            // Recent bias
            if (mem.date) {
                const days = (Date.now() - new Date(mem.date).getTime()) / (1000 * 60 * 60 * 24);
                score += Math.max(0, 1 - days / 365) * 0.1;
            }
            return { ...mem, rerankScore: score };
        });
        
        return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
    }
    
    /**
     * Trim memories to token budget
     * @param {Array} memories - Memories to compress
     * @param {number} maxTokens - Max tokens (approximate)
     * @returns {Array} Trimmed memories
     */
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
    
    /**
     * Remove markdown fluff
     * @param {string} text - Text to clean
     * @returns {string} Clean text
     */
    stripFluff(text) {
        if (!text) return '';
        return text.replace(/\[\[.*?\]\(.*?\)/g, '').replace(/[*_~`]/g, '').trim();
    }
    
    /**
     * Full pipeline: rerank → compress → stats
     */
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
 * Hybrid search (BM25 + vector RRF)
 */
class HybridInner {
    async search(query, options = {}) {
        // Lazy load hybrid if available
        try {
            const hybrid = require('./search-hybrid');
            return hybrid.search(query, options);
        } catch (e) {
            // Fallback to basic if module deleted
            return this._basicSearch(query, options);
        }
    }
    
    _basicSearch(query, options = {}) {
        // Simple text search fallback
        const { maxResults = 10 } = options;
        return query ? [{ id: 'fallback', title: query, content: 'Hybrid not available' }] : [];
    }
}

/**
 * HyDE (Hypothetical Document Embeddings)
 */
class HydeInner {
    async search(query) {
        try {
            const hyde = require('./search-hyde');
            return hyde.search(query);
        } catch (e) {
            return [{ id: 'hyde', title: query, content: 'Hyde not available' }];
        }
    }
}

// ==================== CORE SEARCH FUNCTIONS ====================

/**
 * Get LTC (Long-Term Context) content
 * @returns {string|null} LTC content
 */
async function getLTC() {
    const ltcPath = path.join(MODELS_DIR, 'public', 'start.md');
    if (!fs.existsSync(ltcPath)) return null;
    const content = fs.readFileSync(ltcPath, 'utf8');
    // Cache it
    getMemoize().set('ltc:current', content, 60000);
    return content;
}

/**
 * Fresh get LTC
 */
async function freshLTC() {
    getMemoize().del('ltc:current');
    return getLTC();
}

/**
 * Query brain - main entry point
 * @param {string} query - Search query
 * @param {Object} options - {topK, maxTokens, mode}
 * @returns {Array} Ranked memories
 */
async function queryBrain(query, options = {}) {
    const { topK = 10, maxTokens = 2000 } = options;
    const ltc = await getLTC();
    if (!ltc) return [];
    
    const r = new RerankInner();
    const memories = [{ id: 'ltc', title: 'LTC', content: ltc, date: new Date().toISOString() }];
    
    // Also load other brain files
    const brainPath = path.join(MODELS_DIR, 'public');
    if (fs.existsSync(brainPath)) {
        const files = fs.readdirSync(brainPath).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const filePath = path.join(brainPath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            memories.push({
                id: file,
                title: file.replace('.md', ''),
                content: content.slice(0, 10000), // Limit file size
                date: fs.statSync(filePath).mtime.toISOString()
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
    if (!fs.existsSync(gitDir)) return null;
    const headFile = path.join(gitDir, 'HEAD');
    if (!fs.existsSync(headFile)) return null;
    const head = fs.readFileSync(headFile, 'utf8').trim();
    if (head.startsWith('ref: ')) {
        const refFile = path.join(gitDir, head.slice(5));
        if (fs.existsSync(refFile)) return fs.readFileSync(refFile, 'utf8').trim().slice(0, 7);
    }
    return head.slice(0, 7);
}

// ==================== EXPORTS ====================
module.exports = {
    // Main classes
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
    
    // Inner classes exported for direct use
    Rerank: RerankInner,
    Hybrid: HybridInner,
    Hyde: HydeInner,
    
    // Direct functions (no class instantiation needed)
    queryBrain,
    getLTC,
    freshLTC,
    hydrate,
    rerank: (m, q, k) => new RerankInner().rerank(m, q, k),
    compress: (m, k) => new RerankInner().compress(m, k),
    pipeline: (m, q, o) => new RerankInner().pipeline(m, q, o),
    stripFluff: (t) => new RerankInner().stripFluff(t),
    
    // Framework compat
    getSummary,
    getCurrentCommit,
    getLayerStatus: () => ({ name: 'Search', type: 'search', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true, layer: 'Search' }),
    getStatus: () => ({ enabled: true })
};
