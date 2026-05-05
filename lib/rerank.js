/**
 * Vant Re-Ranker & Compressor
 *
 * - Re-Rank: Score hydrated memories against query
 * - Compress: Strip fluff before LLM sees it
 *
 * Usage:
 *   const rerank = require('./lib/rerank');
 *   const topMemories = rerank.rerank(memories, query);
 *   const compressed = rerank.compress(topMemories);
 */

const path = require('path');
const fs = require('fs');

const MODELS_PATH = path.join(__dirname, '..', 'models');

/**
 * Re-Rank memories against query
 * @param {object[]} memories - Hydrated memories
 * @param {string} query - Current query
 * @param {number} topK - Keep top K
 * @returns {object[]} Ranked memories
 */
function rerank(memories, query, topK = 5) {
    if (!memories || memories.length === 0) return [];
    
    const queryTerms = new Set(query.toLowerCase().split(/\s+/).filter(t => t.length > 2));
    
    const scored = memories.map(mem => {
        let score = 0;
        const content = (mem.content || mem.text || '').toLowerCase();
        const title = (mem.title || '').toLowerCase();
        
        // Exact title match (high score)
        if (title && queryTerms.has(title.split(/\s+/)[0])) {
            score += 10;
        }
        
        // Query terms in content
        for (const term of queryTerms) {
            if (content.includes(term)) score += 1;
            if (title.includes(term)) score += 2;
        }
        
        // Recency boost (recent = higher)
        if (mem.date || mem.commit) {
            score += 0.5;
        }
        
        return { ...mem, rerankScore: score };
    });
    
    // Sort by score descending
    return scored
        .sort((a, b) => b.rerankScore - a.rerankScore)
        .slice(0, topK);
}

/**
 * Compress - Strip fluff from content
 * @param {object[]} memories - Ranked memories
 * @param {number} maxTokens - Max tokens (roughly chars/4)
 * @returns {object[]} Compressed
 */
function compress(memories, maxTokens = 2000) {
    let used = 0;
    const compressed = [];
    
    for (const mem of memories) {
        let content = mem.content || mem.text || '';
        
        // Strip common fluff patterns
        content = stripFluff(content);
        
        // Check token budget
        const estimated = content.length / 4;
        if (used + estimated > maxTokens) {
            // Truncate to fit
            const remaining = maxTokens - used;
            content = content.substring(0, remaining * 4 - 100) + '\n...[truncated]';
        }
        
        compressed.push({
            ...mem,
            content,
            compressed: true
        });
        
        used += content.length / 4;
        if (used >= maxTokens) break;
    }
    
    return compressed;
}

/**
 * Strip fluff patterns
 */
function stripFluff(content) {
    return content
        // Remove long repeating headers
        .replace(/^#{1,6}\s+.+$/gm, '')
        // Remove metadata-like lines
        .replace(/^\*\*\w+\*\*:.+$/gm, '')
        // Remove empty lines
        .replace(/\n{3,}/g, '\n\n')
        // Remove inline templates
        .replace(/\[TEMPLATE[^\]]+\]/gi, '')
        // Clean whitespace
        .trim();
}

/**
 * Full pipeline: Rerank + Compress
 * @param {object[]} memories
 * @param {string} query
 * @param {object} options
 * @returns {object}
 */
function pipeline(memories, query, options = {}) {
    const { topK = 5, maxTokens = 2000 } = options;
    
    const ranked = rerank(memories, query, topK);
    const compressed = compress(ranked, maxTokens);
    
    const stats = {
        input: memories.length,
        output: compressed.length,
        estimatedTokens: compressed.reduce((a, m) => a + (m.content?.length || 0) / 4, 0)
    };
    
    return { memories: compressed, stats };
}

/**
 * Score a single memory
 */
function scoreMemory(memory, query) {
    const scored = rerank([memory], query, 1);
    return scored[0]?.rerankScore || 0;
}

module.exports = {
    rerank,
    compress,
    pipeline,
    scoreMemory,
    stripFluff
};