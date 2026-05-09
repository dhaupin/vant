/**
 * Search (v0.8.6)
 * Unified search + rerank + hybrid + hyde
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');

const MODELS_DIR = path.join(__dirname, '..', 'models');
const SEARCH_SETTINGS = {
    maxResults: 20,
    minScore: 0.1,
    hybridWeight: 0.3,
    hydeWeight: 0.5
};

// Lazy-loaded dependencies
let hybridSearchLib = null;
let _hydeLib = null;

// ==================== INNER CLASSES ====================
class HybridInner {
    constructor() { this._startTime = Date.now(); }
    async search(query, options = {}) {
        if (!hybridSearchLib) hybridSearchLib = require('./search-hybrid');
        return hybridSearchLib.search(query, options);
    }
    getLayerStatus() {
        return { name: 'Search.Hybrid', type: 'search', enabled: true, state: { uptime: Date.now() - this._startTime } };
    }
}

class HydeInner {
    constructor() { this._startTime = Date.now(); }
    async search(query) {
        if (!_hydeLib) _hydeLib = require('./search-hyde');
        return _hydeLib.search(query);
    }
    getLayerStatus() {
        return { name: 'Search.Hyde', type: 'search', enabled: true };
    }
}

class RerankInner {
    constructor() { this._startTime = Date.now(); }
    
    // INLINED from rerank.js
    rerank(memories, query, topK = 5) {
        if (!memories || memories.length === 0) return [];
        const scored = memories.map(mem => {
            let score = 0;
            if (mem.content) {
                const q = query.toLowerCase();
                const c = mem.content.toLowerCase();
                if (c.includes(q)) score += 0.5;
                const words = q.split(/\s+/);
                score += words.filter(w => c.includes(w)).length / words.length * 0.3;
            }
            if (mem.tags) {
                const tags = Array.isArray(mem.tags) ? mem.tags : [mem.tags];
                score += tags.filter(t => query.toLowerCase().includes(t.toLowerCase())).length * 0.2;
            }
            return { ...mem, rerankScore: score };
        });
        return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
    }
    
    compress(memories, maxTokens = 2000) {
        if (!memories || memories.length === 0) return [];
        let tokens = 0;
        const compressed = [];
        for (const mem of memories) {
            const est = (mem.content?.length || 0) / 4;
            if (tokens + est > maxTokens) break;
            tokens += est;
            compressed.push(mem);
        }
        return compressed;
    }
    
    stripFluff(text) {
        if (!text) return '';
        return text.replace(/\[\[.*?\]\(.*?\)/g, '').replace(/[*_~`]/g, '').trim();
    }
    
    async pipeline(memories, query, options = {}) {
        const { topK = 5, maxTokens = 2000 } = options;
        const ranked = this.rerank(memories, query, topK);
        return { memories: this.compress(ranked, maxTokens), stats: { input: memories.length, output: ranked.length } };
    }
    
    getLayerStatus() {
        return { name: 'Search.Rerank', type: 'search', enabled: true };
    }
}

// ==================== SEARCH FUNCTIONS ====================
async function getLTC() {
    const ltcPath = path.join(MODELS_DIR, 'public', 'start.md');
    if (!fs.existsSync(ltcPath)) return null;
    return fs.readFileSync(ltcPath, 'utf8');
}

async function searchLTC(query, options = {}) {
    const content = await getLTC();
    if (!content) return [];
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
    const lines = content.split('\n');
    const results = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (keywords.some(k => line.includes(k))) {
            results.push({ line: i + 1, content: lines[i], score: keywords.filter(k => line.includes(k)).length });
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, options.maxResults || SEARCH_SETTINGS.maxResults);
}

async function rehydrate(fragments) {
    if (!fragments || fragments.length === 0) return '';
    return fragments.map(f => f.content || f).join('\n');
}

async function query(q, options = {}) {
    const ltc = await getLTC();
    if (!ltc) return null;
    
    const r = new RerankInner();
    const memories = [{ content: ltc, type: 'start', score: 1 }];
    return r.rerank(memories, q, options.topK || 10);
}

function getSummary() {
    return { name: 'Search', type: 'search', enabled: true, config: SEARCH_SETTINGS };
}

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
            return { name: 'Search', type: 'search', enabled: true, config: SEARCH_SETTINGS, state: { uptime: Date.now() - this._startTime } };
        }
        isOperationAllowed(operationType, context = {}) {
            return { allowed: true, layer: 'Search' };
        }
        getStatus() {
            return { enabled: true };
        }
    },
    Hybrid: HybridInner,
    Hyde: HydeInner,
    Rerank: RerankInner,
    create: () => ({ getLayerStatus: () => ({ name: 'Search', type: 'search', enabled: true }), isOperationAllowed: () => ({ allowed: true }), getStatus: () => ({ enabled: true }) }),
    getLTC, searchLTC, rehydrate, query, getSummary, getCurrentCommit,
    getLayerStatus: () => ({ name: 'Search', type: 'search', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Search' }),
    getStatus: () => ({ enabled: true })
};
