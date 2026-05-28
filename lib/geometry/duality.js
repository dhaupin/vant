/**
 * Brain-Geometry Bridge (v0.9.1)
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
 *   
 *   // Or auto-discover
 *   const learned = await duality.autoLearn();
 */

const brain = require('../brain');
const geo = require('./quasicrystal');

let _initialized = false;

/**
 * Initialize bridge (creates quasicrystal storage)
 */
async function init() {
    if (_initialized) return;
    
    // Ensure storage exists
    await geo.initStorage();
    _initialized = true;
    console.log('[DUALITY] Brain ↔ Geometry connected');
}

/**
 * Store a memory in BOTH places
 * - Brain file (human-editable)
 * - NSC9 barcode (machine-addressable)
 * 
 * @param category - 'lessons', 'identity', etc
 * @param key - specific topic
 * @param content - the memory content
 */
async function remember(category, key, content) {
    await init();
    
    // Make NSC9 barcode from brain path
    const brainPath = `${category}/${key}`;
    const barcode = geo.generateBarcodeFromContent(brainPath);
    
    // Store in quasicrystal (geometrty side)
    await geo.store(barcode, {
        category,
        key,
        content,
        brainPath,
        barcode,
        timestamp: Date.now()
    });
    
    // Could also write to brain file for human access
    // (but quasicrystal is authoritative for now)
    
    return { barcode, brainPath };
}

/**
 * Recall a memory (from NSC9 barcode)
 * 
 * @param brainPath - like 'lessons/geometry'
 */
async function recall(brainPath) {
    await init();
    
    const barcode = geo.generateBarcodeFromContent(brainPath);
    const record = await geo.retrieve(barcode);
    
    if (record) {
        return {
            ...record.data,
            fromGeometry: true
        };
    }
    
    // Fallback: maybe it's a plain brain file
    try {
        const brainData = await brain.loadBrain(brainPath);
        if (brainData) {
            return {
                content: brainData.content || brainData,
                brainPath,
                fromBrain: true
            };
        }
    } catch (e) {
        // Not in brain either
    }
    
    return null;
}

/**
 * Auto-learn: detect patterns and store
 * 
 * For an agent: Learns from work done
 * - Task completed → store outcome
 * - Bug found → store lesson
 * - Success → store pattern for reuse
 */
async function autoLearn(event) {
    await init();
    
    if (!event) {
        // Generic: nothing to learn
        return { learned: [], count: 0 };
    }
    
    // Event types the agent understands
    const { type, task, result, error } = event;
    
    const memories = [];
    
    if (type === 'completed' && task) {
        const mem = await remember('tasks', task, `Completed: ${result}`);
        memories.push(mem);
    }
    
    if (type === 'bug' && error) {
        const mem = await remember('lessons', `bug_${task}`, `Bug: ${error}`);
        memories.push(mem);
    }
    
    if (type === 'pattern' && task) {
        const mem = await remember('patterns', task, result);
        memories.push(mem);
    }
    
    return { learned: memories, count: memories.length };
}

/**
 * Search memories across both systems
 * 
 * @param query - search term
 */
async function search(query) {
    await init();
    
    const results = [];
    
    // Query brain corpus
    try {
        const corpus = brain.loadCorpus();
        for (const item of corpus) {
            if (item.content && item.content.includes(query)) {
                results.push({
                    source: 'brain',
                    path: item.path,
                    content: item.content
                });
            }
        }
    } catch (e) {
        // Ignore corpus errors
    }
    
    // Query geometry (expensive - scans all)
    // TODO: Better indexing
    
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
    remember,
    recall,
    autoLearn,
    search,
    knows
};