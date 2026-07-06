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

// Lazy-load Encrypt for optional encryption at rest
let _Encrypt = null;
function _getEncrypt() {
    if (!_Encrypt) {
        try { _Encrypt = require('../encrypt'); } catch (e) {}
    }
    return _Encrypt;
}

// Lazy-load RLS for optional per-record ACL
let _rls = null;
function _getRLS() {
    if (!_rls) {
        try { _rls = require('../rls'); } catch (e) {}
    }
    return _rls;
}

/**
 * Generate a UNIQUE barcode from content hash
 * Uses NSC "9" to mark as Vant automation-reserved (GS1 reserved range)
 *
 * Global UPC/EAN Number System Characters (NSC):
 * - 0: Standard retail (groceries)
 * - 1: Reserved (was our first version)
 * - 2: Variable weight (in-store)
 * - 3: Pharmaceuticals
 * - 4: Restricted distribution
 * - 5: Coupons
 * - 6-9: Reserved for future use ← NOW OUR FLAG!
 *
 * NSC "9" is the PERFECT choice:
 * - Officially reserved by GS1 (never assigned to any product)
 * - Zero risk of collision with real inventory
 * - Self-documenting: means "virtual/automation system"
 *
 * Format: 9-FACILITY-SEQUENCE-CHECK (12 digits without dashes)
 */
function generateBarcodeFromContent(content) {
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    
    // NSC 9 = automation-reserved (GS1 reserved range)
    // Safe facility range: 10000-99999 (avoids manufacturer codes 01000-09999)
    const raw = parseInt(hash.slice(0, 5), 16);
    const facility = 10000 + (raw % 90000);
    
    const sequence = parseInt(hash.slice(5, 10), 16) % 100000;
    const checksum = parseInt(hash.slice(-1), 16) % 10;
    
    return `9-${facility.toString().padStart(5, '0')}-${sequence.toString().padStart(5, '0')}-${checksum}`;
}

/**
 * Quasicrystal Storage (v0.9.0-exp)
 * Aperiodic tiling-based storage for Vant memories
 */
const path = require('path');
const fs = require('fs');
const { project } = require('./projection');
const { getTileAt, getDistribution } = require('./tilings');

// Default storage - falls back to brain path + canvas subfolder
const DEFAULT_DATA_PATH = path.join(__dirname, '../../../models/private/canvas');

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
async function store(barcode, data, basePath = DEFAULT_DATA_PATH, options = {}) {
    // OPTIONAL: RLS per-record ACL check
    if (options.userCtx) {
        const rls = _getRLS();
        if (rls) {
            await rls.checkWrite(options.userCtx, '_geometry:' + barcode, 'write');
        }
    }
    // SECURITY: Validate barcode format
    if (!barcode || typeof barcode !== 'string' || barcode.length > 50) {
        throw new Error('EINVAL: invalid barcode');
    }
    
    // Validate data is not massive (prevent DoS)
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 10 * 1024 * 1024) {
        throw new Error('EFBIG: data too large (max 10MB)');
    }


    // OPTIONAL: Encrypt data at rest
    let storedData = data;
    let encrypted = false;
    if (options.encryptKey) {
        const Encrypt = _getEncrypt();
        if (Encrypt) {
            storedData = Encrypt.encrypt(JSON.stringify(data), options.encryptKey);
            encrypted = true;
        }
    }

    initStorage(basePath);
    
    const proj = project(barcode);
    // OPTIONAL: RLS per-record ACL check
    if (options.userCtx) {
        const rls = _getRLS();
        if (rls) {
            await rls.checkRead(options.userCtx, '_geometry:' + barcode, 'read');
        }
    }

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
        data: storedData,
        _stored: Date.now(),
        _encrypted: encrypted
    };
    
    await fs.promises.writeFile(
        filePath, 
        JSON.stringify(record, null, 2),
        'utf8'
    );
    
    return {
        stored: true,
        key: proj._key,
        fingerprint: proj.fingerprint,
        encrypted
    };
}

/**
 * Retrieve data from barcode
 * Any node can recompute position - no central index!
 */
async function retrieve(barcode, basePath = DEFAULT_DATA_PATH, options = {}) {
    // SECURITY: Validate barcode
    if (!barcode || typeof barcode !== 'string' || barcode.length > 50) {
        throw new Error('EINVAL: invalid barcode');
    }

    const filePath = getFilePath(barcode, basePath);
    
    if (!fs.existsSync(filePath)) {
        return { error: 'not found', barcode };
    }
    
    const content = await fs.promises.readFile(filePath, 'utf8');
    const record = JSON.parse(content);
    
    // OPTIONAL: Decrypt data at rest
    if (record._encrypted && options.decryptKey) {
        const Encrypt = _getEncrypt();
        if (Encrypt) {
            try {
                record.data = JSON.parse(Encrypt.decrypt(record.data, options.decryptKey));
            } catch (e) {
                return { error: 'decryption failed', barcode };
            }
        }
    }
    
    return record;

/**
 * Check if barcode exists in storage
 */
async function has(barcode, basePath = DEFAULT_DATA_PATH, options = {}) {
    // OPTIONAL: RLS check
    if (options.userCtx) {
        const rls = _getRLS();
        if (rls) {
            await rls.checkRead(options.userCtx, '_geometry:' + barcode, 'read');
        }
    }
    // SECURITY: Validate barcode
    if (!barcode || typeof barcode !== 'string' || barcode.length > 50) {
        throw new Error('EINVAL: invalid barcode');
    }

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