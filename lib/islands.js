/**
 * Islands (v0.8.6)
 * AI-first lazy-loadable brain components
 * 
 * Integrates with: brain, search
 */

const path = require('path');
const vaf = require('./vaf');
const Storage = require('./storage');

let _brain = null;
let _islands = null;
const getBrain = () => {
    if (!_brain) _brain = Storage.get('brain');
    if (!_islands) _islands = Storage.get('island');
    return _brain;
};

const DEFAULT_ISLANDS = {
    identity: { name: 'Identity', type: 'static', autoLoad: true, triggers: [] },
    learnings: { name: 'Learnings', type: 'static', autoLoad: true, triggers: [] },
    decisions: { name: 'Decisions', type: 'static', autoLoad: true, triggers: [] },
    github: { name: 'GitHub', type: 'lazy', autoLoad: false, triggers: ['github', 'pr', 'issue', 'push', 'repo', 'commit', 'branch'] },
    gitlab: { name: 'GitLab', type: 'lazy', triggers: ['gitlab', 'merge', 'mr'] },
    bitbucket: { name: 'Bitbucket', type: 'lazy', triggers: ['bitbucket'] },
    linear: { name: 'Linear', type: 'lazy', triggers: ['linear', 'project', 'issue', 'tracker'] },
    vesc: { name: 'VESC', type: 'lazy', triggers: ['vesc', 'electric skateboard', 'brushless'] },
    herbalism: { name: 'Herbalism', type: 'lazy', triggers: ['herbal', 'herbalism', 'plant remedies', 'medicine'] },
    automation: { name: 'Automation', type: 'lazy', triggers: ['cron', 'schedule', 'automation', 'workflow', 'webhook'] }
};

const MANIFEST_FILE = 'islands.json';

/**
 * Get islands manifest
 */
function getManifest() {
    if (!_islands) {
        return { version: '1.0', islands: DEFAULT_ISLANDS, loaded: [], hydrated: [] };
    }
    try {
        const data = _islands.getManifest();
        if (data) return data;
    } catch (e) {}
    return { version: '1.0', islands: DEFAULT_ISLANDS, loaded: [], hydrated: [] };
}

/**
 * Save manifest
 */
function saveManifest(m) {
    _islands.saveManifest(m);
}

/**
 * Load island by name
 * @param {string} name - Island name
 * @returns {Object|null} Island data
 */
function load(name) {
    vaf.check(name, { type: 'string', maxLength: 50 });
    
    // Use island storage (goes through sandbox)
    const island = _islands || getBrain();
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
    
    // Framework hooks
    getSummary,
    getLayerStatus: () => ({ name: 'Islands', type: 'islands', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true })
};
