/**
 * Islands (v0.8.6)
 * AI-first lazy-loadable brain components
 * 
 * Integrates with: brain, search
 */

const path = require('path');
const fs = require('fs');
const sudo = require('./sudo');
const vaf = require('./vaf');
const Storage = require('./storage');
const brain = require('./brain');

// Static corpus-based islands load from brain router
// Lazy islands use storage for dynamic data
let _islands = null;

const DEFAULT_ISLANDS = {
    // Static: loaded from brain corpus
    identity: { name: 'Identity', type: 'static', source: 'corpus', triggers: [] },
    learnings: { name: 'Learnings', type: 'static', source: 'corpus', triggers: [] },
    decisions: { name: 'Decisions', type: 'static', source: 'corpus', triggers: [] },
    // Lazy: dynamic data in storage
    github: { name: 'GitHub', type: 'lazy', source: 'storage', triggers: ['github', 'pr', 'issue', 'push', 'repo', 'commit', 'branch'] },
    gitlab: { name: 'GitLab', type: 'lazy', source: 'storage', triggers: ['gitlab', 'merge', 'mr'] },
    bitbucket: { name: 'Bitbucket', type: 'lazy', triggers: ['bitbucket'] },
    linear: { name: 'Linear', type: 'lazy', triggers: ['linear', 'project', 'issue', 'tracker'] },
    vesc: { name: 'VESC', type: 'lazy', triggers: ['vesc', 'electric skateboard', 'brushless'] },
    herbalism: { name: 'Herbalism', type: 'lazy', triggers: ['herbal', 'herbalism', 'plant remedies', 'medicine'] },
    automation: { name: 'Automation', type: 'lazy', triggers: ['cron', 'schedule', 'automation', 'workflow', 'webhook'] }
};

const MANIFEST_FILE = 'islands.json';

/**
 * Load manifest from file if exists
 */
function _loadManifestFile() {
    const brainPath = brain.getBrainPath();
    const manifestPath = path.join(brainPath, '..', MANIFEST_FILE);
    try {
        if (fs.existsSync(manifestPath)) {
            return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        }
    } catch (e) {}
    return null;
}

/**
 * Save manifest to file
 */
function _saveManifestFile(m) {
    const brainPath = brain.getBrainPath();
    const manifestPath = path.join(brainPath, '..', MANIFEST_FILE);
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
}

/**
 * Get islands manifest
 */
function getManifest() {
    // Try file-based manifest first
    const fileManifest = _loadManifestFile();
    if (fileManifest && fileManifest.islands) {
        return { 
            version: fileManifest.version || '1.0', 
            islands: { ...DEFAULT_ISLANDS, ...fileManifest.islands },
            loaded: fileManifest.loaded || [],
            hydrated: fileManifest.hydrated || []
        };
    }
    // Fallback to defaults
    return { version: '1.0', islands: DEFAULT_ISLANDS, loaded: [], hydrated: [] };
}

/**
 * Save manifest
 */
function saveManifest(m) {
    // Use file-based save
    _saveManifestFile(m);
}

/**
 * Load island by name
 * Routes based on island type:
 * - 'static' (source: corpus): loads from brain router
 * - 'lazy' (source: storage): loads from storage
 * @param {string} name - Island name
 * @returns {Promise<Object|null>} Island data
 */
async function load(name) {
    vaf.check(name, { type: 'string', maxLength: 50 });
    
    const m = getManifest();
    const def = m.islands[name];
    
    // Static islands: load from brain corpus
    if (def?.type === 'static' || def?.source === 'corpus') {
        const item = await brain.loadBrain(name);
        if (item) {
            return {
                name,
                content: item.content,
                source: item.source,
                type: 'corpus'
            };
        }
        return null;
    }
    
    // Lazy islands: use storage
    const island = _islands || Storage.get('island');
    const data = island.get(name);
    if (data && !data.error) return data;

    return null;
}

/**
 * Save island data
 * @param {string} name - Island name
 * @param {Object} data - Island data
 */
function save(name, data) {
    vaf.check(name, { type: 'string', maxLength: 50 });
    
    const m = getManifest();
    if (!m.islands[name]) {
        throw new Error('Unknown island: ' + name);
    }
    
    // Use island storage (goes through sandbox canWrite)
    const island = _islands || getBrain();
    island.write(name, data, true); // true = JSON
    
    if (!m.loaded.includes(name)) {
        m.loaded.push(name);
    }
    saveManifest(m);
}

/**
 * Hydrate island (load into memory)
 * @param {string} name - Island name
 */
function hydrate(name) {
    const data = load(name);
    if (!data) return null;
    
    const m = getManifest();
    if (!m.hydrated.includes(name)) {
        m.hydrated.push(name);
    }
    saveManifest(m);
    
    return data;
}

/**
 * Dehydrate island (remove from memory)
 * @param {string} name - Island name
 */
function dehydrate(name) {
    const m = getManifest();
    m.hydrated = m.hydrated.filter(n => n !== name);
    saveManifest(m);
}

/**
 * Find islands matching prompt triggers
 * @param {string} prompt - User prompt
 * @returns {Array} Matching island names
 */
function findTriggers(prompt) {
    const p = prompt.toLowerCase();
    const m = getManifest();
    const matches = [];
    
    for (const [name, island] of Object.entries(m.islands)) {
        if (island.triggers) {
            for (const trigger of island.triggers) {
                if (p.includes(trigger)) {
                    matches.push(name);
                    break;
                }
            }
        }
    }
    
    return matches;
}

/**
 * Auto-hydrate islands from prompt
 * @param {string} prompt - User prompt
 * @returns {Array} Hydrated island data
 */
function autoHydrate(prompt) {
    const triggers = findTriggers(prompt);
    const hydrated = [];
    
    for (const name of triggers) {
        const data = hydrate(name);
        if (data) hydrated.push(name);
    }
    
    return hydrated;
}

/**
 * Get currently hydrated islands
 * @returns {Array} Hydrated island names
 */
function getHydrated() {
    return getManifest().hydrated || [];
}

/**
 * Get available islands
 * @returns {Array} Available island names
 */
function getAvailable() {
    return Object.keys(getManifest().islands);
}

/**
 * Create new island (runtime proper - not CLI workaround)
 * @param {string} name - Island name
 * @param {Object} options - {type, source, triggers}
 * @returns {Object} Created island definition
 */
function createIsland(name, options = {}) {
    const { type = 'static', source = 'corpus', triggers = [] } = options;
    
    const m = getManifest();
    
    if (m.islands[name]) {
        return { error: 'Island already exists: ' + name };
    }
    
    // Add new island to manifest
    m.islands[name] = {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        type,
        source: type === 'static' ? 'corpus' : 'storage',
        triggers: triggers.map(t => t.toLowerCase())
    };
    
    saveManifest(m);
    
    // Also create brain file for static islands
    if (type === 'static' || source === 'corpus') {
        const brainPath = brain.getBrainPath();
        const filePath = path.join(brainPath, name + '.md');
        
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, `# ${name}\n\nTODO: Add content for ${name} island.\n`);
        }
    }
    
    return { name, type, source, triggers };
}

/**
 * Update island triggers
 * @param {string} name - Island name
 * @param {Array} triggers - New triggers
 * @returns {Object} Updated island
 */
function updateTriggers(name, triggers) {
    const m = getManifest();
    
    if (!m.islands[name]) {
        return { error: 'Island not found: ' + name };
    }
    
    m.islands[name].triggers = triggers.map(t => t.toLowerCase());
    saveManifest(m);
    
    return { name, triggers };
}

/**
 * Delete island
 * @param {string} name - Island name
 * @returns {Object} Result
 */
function deleteIsland(name) {
    const m = getManifest();
    
    if (!m.islands[name]) {
        return { error: 'Island not found: ' + name };
    }
    
    delete m.islands[name];
    m.loaded = m.loaded.filter(n => n !== name);
    m.hydrated = m.hydrated.filter(n => n !== name);
    saveManifest(m);
    
    return { name, deleted: true };
}

/**
 * Enable island
 * @param {string} name - Island name
 * @returns {Object} Result
 */
function enableIsland(name) {
    const m = getManifest();
    
    if (!m.islands[name]) {
        return { error: 'Island not found: ' + name };
    }
    
    m.islands[name].enabled = true;
    saveManifest(m);
    
    return { name, enabled: true };
}

/**
 * Disable island
 * @param {string} name - Island name
 * @returns {Object} Result
 */
function disableIsland(name) {
    const m = getManifest();
    
    if (!m.islands[name]) {
        return { error: 'Island not found: ' + name };
    }
    
    m.islands[name].enabled = false;
    saveManifest(m);
    
    return { name, enabled: false };
}

/**
 * Get island definition
 * @param {string} name - Island name
 * @returns {Object} Island definition
 */
function getIsland(name) {
    const m = getManifest();
    return m.islands[name] || null;
}

/**
 * Get summary
 */
function getSummary() {
    return {
        name: 'Islands',
        type: 'brain-islands',
        version: '0.8.6',
        enabled: true,
        count: getAvailable().length,
        hydrated: getHydrated().length
    };
}

// ==================== EXPORTS ====================
module.exports = {
    Islands: class {
        constructor() {
            this.loaded = getHydrated();
        }
        getStatus() {
            return { enabled: true, count: getAvailable().length };
        }
    },
    
    // Core functions
    load,
    save,
    hydrate,
    dehydrate,
    findTriggers,
    autoHydrate,
    getHydrated,
    getAvailable,
    getManifest,
    createIsland,
    updateTriggers,
    deleteIsland,
    enableIsland,
    disableIsland,
    getIsland,
    
    // NEW FUNCTIONS: bulk + utility operations
    bulkCreate(islands) {
        // @param islands: [{name, type, triggers}, ...]
        const results = [];
        for (const opts of islands) {
            const r = createIsland(opts.name, opts);
            results.push(r);
        }
        return { created: results.length, results };
    },
    
    bulkDelete(names) {
        // @param names: ['island1', 'island2', ...]
        const results = [];
        for (const name of names) {
            const r = deleteIsland(name);
            results.push(r);
        }
        return { deleted: results.length, results };
    },
    
    exportAll() {
        // Export all islands as JSON
        const m = getManifest();
        return { islands: m.islands, exported: Date.now() };
    },
    
    importOne(data) {
        // Import single island from JSON: {name, type, triggers, source}
        const { name, type = 'static', triggers = [], source = 'corpus' } = data;
        if (!name) return { error: 'name required' };
        return createIsland(name, { type, triggers, source });
    },
    
    findByTrigger(trigger) {
        // Find all islands matching a trigger word
        const all = getAvailable();
        return all.filter(i => i.triggers?.includes(trigger.toLowerCase()));
    },
    
    // Framework hooks
    getSummary,
    getLayerStatus: () => ({ name: 'Islands', type: 'islands', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true })
};
