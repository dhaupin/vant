/**
 * Vant Query Transformation
 *
 * Multi-Query: Generate variations of your prompt
 * HyDE: Write a fake answer, then search for real matches
 *
 * Usage:
 *   const query = require('./lib/query');
 *   const variations = query.multiQuery('how to setup vesc');
 *   consthyde = await query.hyde('what is herbalism');
 */

const { getModel } = require('./config');

/**
 * Multi-Query variations
 * @param {string} prompt - Original prompt
 * @param {number} count - Number of variations
 * @returns {string[]} Variations
 */
function multiQuery(prompt, count = 3) {
    const variations = [prompt];
    const lower = prompt.toLowerCase();
    
    // Add different angles
    if (lower.includes('how') || lower.includes('what')) {
        variations.push(prompt.replace(/how (to|do)/i, 'step by step').replace(/what (is|are)/i, 'explain'));
    }
    
    if (lower.includes('?')) {
        variations.push(prompt.replace('?', ' in detail?'));
    }
    
    // Add keywords expansion
    const keywords = expandKeywords(lower);
    if (keywords.length > 0) {
        variations.push(keywords.join(' ') + ' ' + prompt.replace(/[^a-z0-9\s]/gi, ''));
    }
    
    return variations.slice(0, count);
}

/**
 * Expand keywords to related terms
 */
function expandKeywords(prompt) {
    const keywords = [];
    
    // Domain knowledge expansion
    const expansions = {
        github: ['git', 'repository', 'pr', 'merge'],
        herbalism: ['medicine', 'plant', 'nature', 'healing'],
        vesc: ['motor', 'controller', 'firmware'],
        linear: ['project', 'task', 'issue'],
        automation: ['cron', 'schedule', 'workflow'],
        vesc: ['skateboard', 'esc', 'driver'],
        sync: ['backup', 'replicate', 'raid'],
        stego: ['image', 'hidden', 'encode'],
        island: ['component', 'hydrate', 'lazy'],
        vibe: ['mood', 'state', 'mode']
    };
    
    for (const [key, terms] of Object.entries(expansions)) {
        if (prompt.includes(key)) {
            keywords.push(...terms);
        }
    }
    
    return [...new Set(keywords)].slice(0, 5);
}

/**
 * HyDE - Hypothetical Document Embeddings
 * 
 * Write a "fake" answer, then search for similar real documents
 *
 * @param {string} prompt - User prompt
 * @returns {object} { fake, realSearchResults }
 */
async function hyde(prompt) {
    // Generate fake answer based on prompt
    const fake = generateFakeAnswer(prompt);
    
    // Search for documents similar to the fake
    const search = require('./lib/hybrid-search');
    const results = await search.search(fake, { topK: 5 });
    
    return {
        fake,
        fakeQuery: generateFakeAnswer(prompt), // For debugging
        results: results.fused,
        sources: results.sources
    };
}

/**
 * Generate a hypothetical answer for HyDE
 */
function generateFakeAnswer(prompt) {
    const lower = prompt.toLowerCase();
    
    // Domain-specific fake answers
    if (lower.includes('vesc')) {
        return `To setup VESC controller: 1) Connect via USB or Bluetooth, 2) Configure motor parameters in VESC Tool, 3) Set FOC or BLDC mode, 4) Calibrate sensors, 5) Test throttle response.`;
    }
    if (lower.includes('herb') || lower.includes('medicine') || lower.includes('plant')) {
        return `Herbalism involves using plants for medicine. Common preparations include teas, tinctures, and salves. Key plants: echinacea, lavender, peppermint. Always verify identification and consult experts.`;
    }
    if (lower.includes('github') || lower.includes('pr')) {
        return `GitHub PR workflow: fork repo, create branch, make changes, push, open PR, request review, address feedback, merge. Use proper commit messages and link issues.`;
    }
    if (lower.includes('linear') || lower.includes('project')) {
        return `Linear project management: create issue, assign to cycle/sprint, add labels, set priority, link related issues, track progress, close when done.`;
    }
    if (lower.includes('sync') || lower.includes('backup')) {
        return `Vant sync:raid-1 across providers, push/pull all repos, automatic failover on failure, track provider health status.`;
    }
    if (lower.includes('island') || lower.includes('hydrate')) {
        return `Vant islands: lazy-loadable skill blocks, static + hydrated separation, auto-hydrate on trigger, gallery of linked stego images.`;
    }
    if (lower.includes('vibe')) {
        return `Vant vibes: experimental (high risk), safety_first (low risk), focused, learning, debugging, review. Auto-switch on task outcome.`;
    }
    
    // Default generic
    return `Based on Vant's knowledge about ${prompt}: The solution involves understanding the domain, identifying key components, configuring appropriately, and testing thoroughly.`;
}

/**
 * Full query pipeline
 * @param {string} prompt - Original prompt
 * @returns {object} Pipeline results
 */
async function queryPipeline(prompt) {
    // Multi-query
    const variations = multiQuery(prompt, 3);
    
    // Search all variations
    const search = require('./lib/hybrid-search');
    let allResults = [];
    
    for (const q of variations) {
        const results = await search.search(q, { topK: 5 });
        allResults = [...allResults, ...results.fused];
    }
    
    // Dedupe by id
    const deduped = new Map();
    for (const r of allResults) {
        if (!deduped.has(r.id) || (deduped.get(r.id)?.rrf || 0) < r.rrf) {
            deduped.set(r.id, r);
        }
    }
    
    return {
        variations,
        results: Array.from(deduped.values()).slice(0, 10),
        sources: [...new Set(allResults.map(r => r.commit).filter(Boolean))]
    };
}

module.exports = {
    multiQuery,
    expandKeywords,
    hyde,
    queryPipeline
};