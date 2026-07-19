/**
 * Brain-Geometry Bridge (v0.9.2)
 * Unifies brain file memory with NSC9 quasicrystal storage
 * 
 * Duality: Each informs the other:
 * - Brain (models/*.md) = Human-readable, editable
 * - Geometry (NSC9) = Machine-addressable, infinite scale
 * 
 * Usage:
 *   const duality = require('./duality');
 *   await duality.remember('lessons', 'geometry', 'Use NSC9 for barcodes');
 *   const memory = await duality.recall('lessons/geometry');
 */

const brain = require('../brain');
const memory = require('../../lib/memory');
const geo = require('./quasicrystal');
const storage = require('../storage');
const path = require('path');
const fs = require('fs');


let _initialized = false;

// Lazy-load security checks
let _sudo = null;
let _sandbox = null;
function _getSudo() {
    if (!_sudo) try { _sudo = require('../sudo'); } catch (e) {}
    return _sudo;
}
function _getSandbox() {
    if (!_sandbox) try { _sandbox = require('../sandbox'); } catch (e) {}
    return _sandbox;
}

/**
 * Check authorization for duality operations
 * require: 'write' for remember, 'read' for recall/search
 */
function _checkAuth(operation) {
    const sudo = _getSudo();
    const sandbox = _getSandbox();
    const taskId = global._taskId || 'default';
    
    // Sudo scope check
    if (sudo && !sudo.can(taskId, operation)) {
        throw new Error(`EPERM: ${operation} not allowed by sudo`);
    }
    
    // Sandbox capability check
    if (sandbox && typeof sandbox.can === 'function' && !sandbox.can(operation === 'write' ? 'canWrite' : 'canRead')) {
        throw new Error(`EPERM: ${operation} not allowed by sandbox`);
    }
}

/**
 * Get the storage path for geometry data (in brain)
 */
function getGeometryPath() {
    return path.join(brain.getBrainPath(), 'geometry');
}

/**
 * Initialize - ensures geometry folder exists in brain
 */
async function init() {
    if (_initialized) return;
    
    const geoPath = getGeometryPath();
    if (!fs.existsSync(geoPath)) {
        fs.mkdirSync(geoPath, { recursive: true });
        console.log('[DUALITY] Created:', geoPath);
    }
    
    geo.initStorage(geoPath);
    _initialized = true;
    console.log('[DUALITY] Brain ↔ Geometry connected');
}

/**
 * Store a memory in NSC9 geometry (brain-backed)
 * 
 * @param category - 'lessons', 'identity', etc
 * @param key - specific topic
 * @param content - the memory content
 */
async function remember(category, key, content) {
    // SECURITY: Require write permission
    _checkAuth('write');
    
    // Input validation: prevent injection
    if (!category || typeof category !== 'string' || category.includes('..') || category.startsWith('/')) {
        throw new Error('EINVAL: invalid category');
    }
    if (!key || typeof key !== 'string' || key.includes('..') || key.startsWith('/')) {
        throw new Error('EINVAL: invalid key');
    }
    
    await init();
    
    const brainPath = category + '/' + key;
    const barcode = geo.generateBarcodeFromContent(brainPath);
    
    await memory.geoStore(barcode, {
        category,
        key,
        content,
        brainPath,
        barcode,
        timestamp: Date.now()
    });
    
    return { barcode, brainPath };
}

/**
 * Recall a memory from NSC9 geometry
 * 
 * @param brainPath - like 'lessons/geometry'
 */
async function recall(brainPath) {
    // SECURITY: Require read permission
    _checkAuth('read');
    
    // Input validation
    if (!brainPath || typeof brainPath !== 'string' || brainPath.includes('..') || brainPath.startsWith('/')) {
        throw new Error('EINVAL: invalid brainPath');
    }
    
    await init();
    
    const barcode = geo.generateBarcodeFromContent(brainPath);
    const record = await memory.locate(barcode);
    
    if (record) {
        return { ...record.data, fromGeometry: true };
    }
    
    // Fallback to brain file
    try {
        const data = await brain.loadBrain(brainPath);
        if (data) {
            return { content: data.content || data, brainPath, fromBrain: true };
        }
    } catch (e) {}
    
    return null;
}

/**
 * Auto-learn from agent events
 */
async function autoLearn(event) {
    await init();
    
    if (!event) return { learned: [], count: 0 };
    
    const { type, task, result, error } = event;
    const memories = [];
    
    if (type === 'completed' && task) {
        memories.push(await remember('tasks', task, 'Completed: ' + result));
    }
    
    if (type === 'bug' && error) {
        memories.push(await remember('lessons', 'bug_' + task, 'Bug: ' + error));
    }
    
    if (type === 'pattern' && task) {
        memories.push(await remember('patterns', task, result));
    }
    
    return { learned: memories, count: memories.length };
}

/**
 * Search brain corpus
 */
async function search(query) {
    // SECURITY: Require read permission
    _checkAuth('read');
    
    // Input validation
    if (!query || typeof query !== 'string' || query.length > 1000) {
        throw new Error('EINVAL: invalid query');
    }
    
    await init();
    
    const results = [];
    try {
        const corpus = brain.loadCorpus();
        for (const item of corpus) {
            if (item.content && item.content.includes(query)) {
                results.push({ source: 'brain', path: item.path, content: item.content });
            }
        }
    } catch (e) {}
    
    return results;
}

/**
 * Check if geometry knows something
 */
async function knows(key) {
    await init();
    const barcode = geo.generateBarcodeFromContent(key);
    return await geo.has(barcode);
}

module.exports = {
    init,
    getGeometryPath,
    remember,
    recall,
    autoLearn,
    search,
    knows
};
