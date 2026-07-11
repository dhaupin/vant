/**
 * Islands (v0.8.6)
 * AI-first lazy-loadable brain components
 * WITH EVENT EMISSIONS - hydration status emits globally
 * 
 * Integrates with: brain, search
 * Format: yaml, json, md, txt (via format.js)
 */

const path = require('path');
const fs = require('fs');
const sudo = require('./sudo');
const vaf = require('./vaf');
const Storage = require('./storage');
const brain = require('./brain');
const format = require('./format');
// Lazy-load RLS for per-record ACL
let _rls = null;


function _checkRead(userCtx, resource) {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.can && !sandbox.can('canRead')) {
        throw new Error('ECAP: read not allowed');
    }
    if (userCtx && sandbox && sandbox._rls) {
        sandbox._rls.checkRead(userCtx, resource, 'read');
    }
}

function _getRLS() {
    if (!_rls) {
        try { _rls = require('./rls'); } catch (e) {}
    }
    return _rls;
}

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
    linear: { name: 'Linear', type: 'lazy', triggers: ['linear', 'project', 'issue', 'tracker'] }
};

// SYNC fallback for sync functions that can't await getManifest()
// Uses defaults + cached file data if available
let _manifestCache = null;
function _getManifestSync() {
    if (!_manifestCache) {
        _manifestCache = {
            version: '1.0',
            islands: DEFAULT_ISLANDS,
            loaded: [],
            hydrated: []
        };
    }
    return _manifestCache;
}

const MANIFEST_FILE = 'islands.json';

/**
 * Load manifest from file if exists (format.js - supports all 4)
 */
async function _loadManifestFile() {
    const brainPath = brain.getBrainPath();
    const manifestPath = path.join(brainPath, '..', MANIFEST_FILE);
    try {
        if (fs.existsSync(manifestPath)) {
            // Use format for auto-detect: yaml, json, md, txt
            const result = await format.loadFile(manifestPath);
            if (result.data) {
                return result.data;
            }
        }
    } catch (e) { console.warn("[islands] Manifest load:", e.message); }
    return null;
}

/**
 * Save manifest to file (format.js - auto-serialize)
 */
async function _saveManifestFile(m) {
    const brainPath = brain.getBrainPath();
    const manifestPath = path.join(brainPath, '..', MANIFEST_FILE);
    // Auto-detect format from extension - currently .json
    // Can transition to .yaml by renaming file
    await format.saveFile(manifestPath, m);
}

/**
 * Get islands manifest (async - uses format.js)
 */
async function getManifest() {
    // Use file-based manifest (async)
    const fileManifest = await _loadManifestFile();
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
 * Save manifest (async - uses format.js)
 */
async function saveManifest(m) {
    // Use file-based save (async)
    await _saveManifestFile(m);
}

/**
 * Load island by name
 * Routes based on island type:
 * - 'static' (source: corpus): loads from brain router
 * - 'lazy' (source: storage): loads from storage
 * @param {string} name - Island name
 * @returns {Promise<Object|null>} Island data
 */
async function load(name, options = {}) {
    vaf.check(name, { type: 'string', maxLength: 50 });
    
    const m = await getManifest();  // FIX: getManifest is async - was missing await
    const def = m.islands[name];
    
    // Static islands: load from brain corpus
    if (def?.type === 'static' || def?.source === 'corpus') {
        // SECURITY: Use brain.load (includes VAF → QoS by default)
        const item = await brain.load(name);
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
function save(name, data, options = {}) {
    vaf.check(name, { type: 'string', maxLength: 50 });
    
    const m = _getManifestSync();
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
    if (!data) {
        _emit('island:hydrate:failed', { name, timestamp: Date.now() });
        return null;
    }
    
    const m = _getManifestSync();
    if (!m.hydrated.includes(name)) {
        m.hydrated.push(name);
    }
    saveManifest(m);
    
    // EVENT: island:hydrated
    _emit('island:hydrated', { name, timestamp: Date.now() });
    
    return data;
}

/**
 * Dehydrate island (remove from memory)
 * @param {string} name - Island name
 */
function dehydrate(name) {
    const m = _getManifestSync();
    const wasThere = m.hydrated.includes(name);
    m.hydrated = m.hydrated.filter(n => n !== name);
    saveManifest(m);
    
    if (wasThere) {
        // EVENT: island:dehydrated
        _emit('island:dehydrated', { name, timestamp: Date.now() });
    }
}

/**
 * Find islands matching prompt triggers
 * @param {string} prompt - User prompt
 * @returns {Array} Matching island names
 */
function findTriggers(prompt) {
    const p = prompt.toLowerCase();
    const m = _getManifestSync();
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
    return _getManifestSync().hydrated || [];
}

/**
 * Get available islands
 * @returns {Array} Available island objects with {key, name, type}
 */
function getAvailable(userCtx) {
    if (userCtx) _checkRead(userCtx, '_islands:available');

    // Return actual island objects, not just keys
    const manifest = _getManifestSync();
    return Object.keys(manifest.islands).map(key => ({
        key,
        ...manifest.islands[key]
    }));
}

/**
 * Create new island (runtime proper - not CLI workaround)
 * @param {string} name - Island name
 * @param {Object} options - {type, source, triggers}
 * @returns {Object} Created island definition
 */
function createIsland(name, options = {}) {
    const { type = 'static', source = 'corpus', triggers = [] } = options;
    
    const m = _getManifestSync();
    
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
    const m = _getManifestSync();
    
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
    const m = _getManifestSync();
    
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
    const m = _getManifestSync();
    
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
    const m = _getManifestSync();
    
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
    const m = _getManifestSync();
    return m.islands[name] || null;
}

/**
 * Get summary
 */
function getSummary(userCtx) {
    if (userCtx) _checkRead(userCtx, '_islands:summary');

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
// Sync version for test compatibility (uses cached defaults)
function getManifestSync() {
    return _getManifestSync();
}

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
    getManifestSync,  // NEW: sync version for test compatibility
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
        const m = _getManifestSync();
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
