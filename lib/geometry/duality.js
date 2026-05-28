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
const geo = require('./quasicrystal');
const storage = require('../storage');
const path = require('path');
const fs = require('fs');

let _initialized = false;

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
    await init();
    
    const brainPath = category + '/' + key;
    const barcode = geo.generateBarcodeFromContent(brainPath);
    
    await geo.store(barcode, {
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
    await init();
    
    const barcode = geo.generateBarcodeFromContent(brainPath);
    const record = await geo.retrieve(barcode);
    
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
