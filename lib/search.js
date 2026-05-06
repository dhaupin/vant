/**
 * Vant Semantic Search + Re-hydrate
 * 
 * Use LTC (Long Term Core) as high-level index.
 * Search for relevant topics, then re-hydrate full context.
 * 
 * Usage:
 *   const search = require('./search');
 *   const results = await search.query('python');
 *   const context = await search.rehydrate(results);
 * 
 * SECURITY:
 *   - Path validation before git operations
 *   - Limit content size
 *   - No arbitrary command execution
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');

const MODELS_PATH = path.join(__dirname, '..', 'models');

// Load settings
let SEARCH_SETTINGS = {
    rehydrateMaxSize: 50 * 1024,
    compressionThreshold: 5120,
    ragLimitMax: 20
};

function loadSettings() {
    try {
        const settingsPath = path.join(__dirname, '..', 'settings.ini');
        if (fs.existsSync(settingsPath)) {
            const ini = fs.readFileSync(settingsPath, 'utf8');
            const match = (key) => {
                const m = ini.match(new RegExp(key + '=(.+)$', 'm'));
                return m ? m[1].trim() : null;
            };
            
            const rehydrate = parseInt(match('REHYDRATE_MAX_SIZE'));
            if (rehydrate && rehydrate > 0 && rehydrate <= 1048576) {
                SEARCH_SETTINGS.rehydrateMaxSize = rehydrate;
            }
            
            const compress = parseInt(match('COMPRESSION_THRESHOLD'));
            if (compress && compress > 0) {
                SEARCH_SETTINGS.compressionThreshold = compress;
            }
            
            const limit = parseInt(match('RAG_LIMIT_MAX'));
            if (limit && limit > 0 && limit <= 100) {
                SEARCH_SETTINGS.ragLimitMax = limit;
            }
            
            console.log('[Search] Settings loaded:', SEARCH_SETTINGS);
        }
    } catch (e) {
        console.log('[Search] Settings not loaded, using defaults');
    }
}

// Init settings on load
loadSettings();

/**
 * Get current git commit hash
 * @returns {string} Commit hash
 */
function getCurrentCommit() {
    try {
        const { execSync } = require('child_process');
        const hash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim().slice(0, 7);
        return hash;
    } catch (e) {
        return 'unknown';
    }
}

/**
 * Load LTC (Long Term Core)
 * @returns {object|null} LTC data
 */
function getLTC() {
    // Find version
    const versions = fs.readdirSync(MODELS_PATH).filter(d => 
        fs.statSync(path.join(MODELS_PATH, d)).isDirectory() && d.startsWith('v')
    );
    const version = versions.sort().pop();
    if (!version) return null;
    
    const ltcPath = path.join(MODELS_PATH, version, '_core.json');
    if (!fs.existsSync(ltcPath)) return null;
    
    return JSON.parse(fs.readFileSync(ltcPath, 'utf8'));
}

/**
 * Search LTC for topics
 * @param {string} query - Search query
 * @param {object} options - { limit }
 * @returns {object[]} Matching entries
 */
function searchLTC(query, options = {}) {
    const limit = options.limit || 10;
    
    // Security: validate query
    vaf.check(query, {
        type: 'string',
        name: 'query',
        maxLength: 500
    });
    
    const ltc = getLTC();
    if (!ltc || !ltc.core) {
        return [];
    }
    
    const results = [];
    const queryLower = query.toLowerCase();
    
    // Search learnings
    if (ltc.core.learnings) {
        for (const entry of ltc.core.learnings) {
            if (results.length >= limit) break;
            
            const text = JSON.stringify(entry).toLowerCase();
            if (text.includes(queryLower)) {
                results.push({
                    type: 'learnings',
                    summary: entry.summary?.slice(0, 200),
                    relevance: text.split(queryLower).length - 1
                });
            }
        }
    }
    
    // Search decisions
    if (ltc.core.decisions) {
        for (const entry of ltc.core.decisions) {
            if (results.length >= limit) break;
            
            const text = JSON.stringify(entry).toLowerCase();
            if (text.includes(queryLower)) {
                results.push({
                    type: 'decisions',
                    summary: entry.summary?.slice(0, 200),
                    relevance: text.split(queryLower).length - 1
                });
            }
        }
    }
    
    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);
    
    return results.slice(0, limit);
}

/**
 * Re-hydrate full content from git history
 * @param {object[]} results - Search results
 * @returns {string} Combined context
 */
async function rehydrate(results) {
    if (!results || results.length === 0) {
        return '';
    }
    
    console.log(`[Search] Re-hydrating ${results.length} entries...`);
    
    const contextParts = [];
    let totalSize = 0;
    
    // Find version folder
    const versions = fs.readdirSync(MODELS_PATH).filter(d => 
        fs.statSync(path.join(MODELS_PATH, d)).isDirectory() && d.startsWith('v')
    );
    const version = versions.sort().pop();
    if (!version) return '';
    
    for (const result of results) {
        const category = result.type || 'learnings';
        const files = fs.readdirSync(path.join(MODELS_PATH, version, category));
        
        // Find matching file (simplified - real impl would use file references from LTC)
        for (const file of files) {
            if (totalSize >= SEARCH_SETTINGS.rehydrateMaxSize) break;
            
            const filePath = path.join(MODELS_PATH, version, category, file);
            
            // Security: validate path
            const resolved = path.resolve(filePath);
            if (!resolved.startsWith(path.join(MODELS_PATH, version))) {
                continue; // Skip paths outside models
            }
            
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                
                // Check if relevant
                if (content.toLowerCase().includes(result.summary?.toLowerCase().slice(0, 50) || '')) {
                    const size = Buffer.byteLength(content, 'utf8');
                    if (totalSize + size <= SEARCH_SETTINGS.rehydrateMaxSize) {
                        contextParts.push(`\n=== ${category}/${file} ====\n${content}`);
                        totalSize += size;
                    }
                }
            } catch (e) {
                // Skip unreadable files
            }
        }
    }
    
    console.log(`[Search] Re-hydrated ${totalSize} bytes`);
    
    return contextParts.join('\n');
}

/**
 * Query + Re-hydrate in one call
 * @param {string} query - Search query
 * @returns {object} { results, context }
 */
async function query(query, options = {}) {
    // Search LTC
    const results = searchLTC(query, options);
    
    if (results.length === 0) {
        return { results: [], context: '' };
    }
    
    // Re-hydrate
    const context = await rehydrate(results);
    
    return { results, context };
}

/**
 * Get search summary
 * @returns {object}
 */
function getSummary() {
    const ltc = getLTC();
    const commit = getCurrentCommit();
    
    return {
        hasLTC: !!ltc,
        version: ltc?.version || null,
        updated: ltc?.updated || null,
        learnings: ltc?.core?.learnings?.length || 0,
        decisions: ltc?.core?.decisions?.length || 0,
        stats: ltc?.stats || {},
        currentCommit: commit
    };
}

/**
 * Fetch file from git history
 * @param {string} filePath - File to fetch
 * @param {string} commit - Commit hash (optional, default: last)
 * @returns {string|null} File content
 */
function fetchFromHistory(filePath, commit = null) {
    try {
        const { execSync } = require('child_process');
        
        // Security: validate path
        const resolved = path.resolve(filePath);
        const cleanResolved = resolved.replace(/\.\./g, '').replace(/^[/\\]/, '');
        
        if (!cleanResolved.startsWith(path.join(process.cwd(), 'models'))) {
            throw new Error('Path outside models not allowed');
        }
        
        const commitArg = commit || 'HEAD';
        const content = execSync(
            'git show ' + commitArg + ':' + cleanResolved.replace(process.cwd() + '/', ''),
            { encoding: 'utf8' }
        );
        
        return content;
    } catch (e) {
        console.log('[Search] Git history fetch failed: ' + e.message);
        return null;
    }
}

module.exports = {
    getLTC,
    searchLTC,
    rehydrate,
    query,
    getSummary,
    getCurrentCommit,
    fetchFromHistory,
    getSettings: () => SEARCH_SETTINGS,
    // Hybrid search (BM25 + Vector + RRF)
    _hybrid: null,
    hybrid(query, options = {}) {
        // Lazy load hybrid-search
        const hs = require('./hybrid-search');
        return hs.search(query, options);
    },
    hyde(query) {
        const q = require('./query');
        return q.hyde(query);
    }
};