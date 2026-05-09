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

const qos = new QoS();

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
        
        // TODO: Implement BM25 + vector RRF when needed
        return [{
            id: 'hybrid',
            title: query,
            content: 'Hybrid search - implement BM25+Vector when needed',
            rerankScore: 0.5
        }];
    }
}

/**
 * HyDE (Hypothetical Document Embeddings)
 */
class HydeInner {
    async search(query) {
        // HyDE transform - generate hypothetical document
        if (!query) return [];
        return [{
            id: 'hyde',
            title: query,
            content: 'Hyde transformed: ' + query + ' - implement embedding when needed'
        }];
    }
}

// ==================== CORE SEARCH FUNCTIONS ====================

const MODELS_DIR = path.join(__dirname, '..', 'models');

/**
 * Get LTC (Long-Term Context) content
 */
async function getLTC() {
    const ltcPath = path.join(MODELS_DIR, 'public', 'start.md');
    if (!fs.existsSync(ltcPath)) return null;
    const content = fs.readFileSync(ltcPath, 'utf8');
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
    if (fs.existsSync(brainPath)) {
        const files = fs.readdirSync(brainPath).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const filePath = path.join(brainPath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            memories.push({
                id: file,
                title: file.replace('.md', ''),
                content: content.slice(0, 10000),
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
    
    getSummary,
    getCurrentCommit,
    getLayerStatus: () => ({ name: 'Search', type: 'search', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true, layer: 'Search' }),
    getStatus: () => ({ enabled: true })
};
