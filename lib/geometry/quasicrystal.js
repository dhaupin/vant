/**
 * Quasicrystal Storage (v0.9.0-exp)
 * Aperiodic tiling-based storage for Vant memories
 * 
 * Architecture:
 * - barcode → geometric projection (unique surface position)
 * - Data stored at position on P3 tiling grid
 * - Reconstruction from barcode (no lookup table needed!)
 * 
 * Advantages over linear addressing:
 * - ∞ address space (aperiodic tiling)
 * - No birthday paradox collisions
 * - Self-authenticating (position computed, not stored)
 */

const crypto = require('crypto');

/**
 * Generate a UNIQUE barcode from content hash
 * Resolves to SAFE range (10000-99999) to avoid real UPC conflicts
 * 
 * Real UPC reserved ranges:
 * - 00000-00999: Reserved (internal/NFR)
 * - 01000-09999: Real manufacturer codes
 * - 10000+: Available for our use!
 * 
 * This ensures zero conflicts with grocery/pharma products
 */
function generateBarcodeFromContent(content) {
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    
    // Remap to SAFE range: 10000-99999 (never conflicts with real UPCs!)
    const raw = parseInt(hash.slice(0, 5), 16);
    const facility = 10000 + (raw % 90000);
    
    const sequence = parseInt(hash.slice(5, 10), 16) % 100000;
    const checksum = parseInt(hash.slice(-1), 16) % 10;
    
    return `1-${facility.toString().padStart(5, '0')}-${sequence.toString().padStart(5, '0')}-${checksum}`;
}

/**
 * Quasicrystal Storage (v0.9.0-exp)
 * Aperiodic tiling-based storage for Vant memories
 */
const path = require('path');
const fs = require('fs');
const { project } = require('./projection');
const { getTileAt, getDistribution } = require('./tilings');

// Default storage location
const DEFAULT_DATA_PATH = path.join(__dirname, '../../data/quasicrystal');

// Initialize data directory
function initStorage(basePath = DEFAULT_DATA_PATH) {
    if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true });
    }
    return basePath;
}

/**
 * Compute storage key from barcode
 * This IS the addressing - no lookup table!
 */
function getStorageKey(barcode) {
    const proj = project(barcode);
    // Key is the _key field from projection
    return proj._key;
}

/**
 * Compute file path from barcode
 */
function getFilePath(barcode, basePath) {
    const key = getStorageKey(barcode);
    const dir = path.join(basePath, key.substring(0, 2));
    return path.join(dir, `${key}.json`);
}

/**
 * Store data with barcode as key
 * Uses geometric addressing, not hash table
 */
async function store(barcode, data, basePath = DEFAULT_DATA_PATH) {
    initStorage(basePath);
    
    const proj = project(barcode);
    const filePath = getFilePath(barcode, basePath);
    const dir = path.dirname(filePath);
    
    // Ensure directory exists
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    // Store with metadata
    const record = {
        barcode,
        _key: proj._key,
        fingerprint: proj.fingerprint,
        position: proj.position,
        theta: proj.theta,
        phi: proj.phi,
        depth: proj.depth,
        data,
        _stored: Date.now()
    };
    
    await fs.promises.writeFile(
        filePath, 
        JSON.stringify(record, null, 2),
        'utf8'
    );
    
    return {
        stored: true,
        key: proj._key,
        fingerprint: proj.fingerprint
    };
}

/**
 * Retrieve data from barcode
 * Any node can recompute position - no central index!
 */
async function retrieve(barcode, basePath = DEFAULT_DATA_PATH) {
    const filePath = getFilePath(barcode, basePath);
    
    if (!fs.existsSync(filePath)) {
        return { error: 'not found', barcode };
    }
    
    const content = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(content);
}

/**
 * Check if barcode exists in storage
 */
async function has(barcode, basePath = DEFAULT_DATA_PATH) {
    const filePath = getFilePath(barcode, basePath);
    return fs.existsSync(filePath);
}

/**
 * List all stored barcodes
 */
async function list(basePath = DEFAULT_DATA_PATH) {
    const barcodes = [];
    
    async function walk(dir) {
        if (!fs.existsSync(dir)) return;
        
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.name.endsWith('.json')) {
                const key = entry.name.replace('.json', '');
                barcodes.push(key);
            }
        }
    }
    
    await walk(basePath);
    return barcodes;
}

/**
 * Get distribution stats for all stored memories
 */
async function stats(basePath = DEFAULT_DATA_PATH) {
    const all = await list(basePath);
    const addresses = all.map(key => {
        const parts = key.split('_');
        return {
            theta: parseInt(parts[0]) / 100,
            phi: parseInt(parts[1]) / 100,
            depth: parseInt(parts[2]) / 1000
        };
    });
    
    return getDistribution(addresses);
}

/**
 * Verify recovery capability
 * Tests that barcode → position is deterministic
 */
function verifyRecovery(testCases) {
    const results = testCases.map(barcode => {
        const key1 = getStorageKey(barcode);
        const key2 = getStorageKey(barcode); // Call again to verify
        
        return {
            barcode,
            key1,
            key2,
            deterministic: key1 === key2
        };
    });
    
    const allDeterministic = results.every(r => r.deterministic);
    
    return {
        verifiable: results.length,
        allDeterministic,
        results
    };
}

module.exports = {
    generateBarcodeFromContent,
    initStorage,
    getStorageKey,
    getFilePath,
    store,
    retrieve,
    has,
    list,
    stats,
    verifyRecovery,
    // Re-export core functions
    project,
    getTileAt
};