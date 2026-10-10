/**
 * Storage (v0.8.6) — FACADE (Wave D split, prd-canonicalization §5)
 *
 * History: this was one 2,391-line file holding shared security plumbing +
 * 8 storage classes + factory. Wave D split it into lib/storage/ per-class
 * files with the plumbing single-sourced in lib/storage/shared.js. THIS FILE
 * REMAINS the import surface: every existing require('./storage') consumer
 * keeps its exact shape (factory shortcuts, raw bypass, classes, WAL,
 * metrics, multibrain stack) — imports stable, consumers don't churn.
 */
'use strict';

const _ = require('./storage/shared');
// Class modules (Wave D) — required from lib/storage/ (this facade keeps the names stable)
const { FileStorage } = require('./storage/file');
const { BrainStorage } = require('./storage/brain');
const { VectorStorage } = require('./storage/vector');
const { StateStorage } = require('./storage/state');
const { ConfigStorage } = require('./storage/config');
const { SchemaStorage } = require('./storage/schema');
const { IslandStorage } = require('./storage/island');
const { ReposStorage: ReposStorageImpl, RemoteStorage: RemoteStorageImpl } = require('./storage/remote');

const { fs, path, sudo, crypto, embed, errors, metrics, Wal } = _;

// Re-export shared plumbing (Some legacy consumers import these off the facade)
const { atomicWrite, sweepTemps, readJson, writeJson, getStorageMetrics, getWalStatus, STORAGE_VERSION, MODELS_PATH, PUBLIC_PATH, CONFIG_PATH, _TEMP_SUFFIX_RE, _sweepStaleTemps } = _;
module.atomicWrite = atomicWrite;
module.sweepTemps = sweepTemps;
module.readJson = readJson;
module.writeJson = writeJson;
module.getStorageMetrics = getStorageMetrics;
module.getWalStatus = getWalStatus;
module.Wal = Wal;

// ==================== STORAGE FACTORY ====================
const _instances = {};

function getStorage(type, options = {}) {
    // Handle invalid type gracefully
    if (!type || typeof type !== 'string') {
        return null;  // Return null instead of throwing for null/undefined
    }

    // Singleton per type
    const key = type + JSON.stringify(options);

    if (_instances[key]) {
        return _instances[key];
    }

    let instance;
    switch (type) {
        case 'file':
            instance = new FileStorage(options);
            break;
        case 'brain':
            instance = new BrainStorage(options);
            break;
        case 'vector':
            instance = new VectorStorage(options);
            break;
        case 'state':
            instance = new StateStorage(options);
            break;
        case 'config':
            instance = new ConfigStorage(options);
            break;
        case 'schema':
            instance = new SchemaStorage(options);
            break;
        case 'island':
            instance = new IslandStorage(options);
            break;
        case 'repos':
            instance = new ReposStorage(options);
            break;
        case 'remote':
            instance = new RemoteStorageImpl(options);
            break;
        default:
            throw new errors.VantError('Unknown storage type: ' + type, { code: errors.CODES.STORAGE_TYPE_UNKNOWN, retryable: false });
    }

    _instances[key] = instance;
    return instance;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * List files across all brains in the stack
 * @param {string} pattern - File pattern
 * @returns {Array} Combined file list from all brains
 */
function listStack(pattern = '*') {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const files = getStorage('file').list(pattern);
            if (Array.isArray(files)) {
                files.forEach(f => {
                    results.push({ ...f, brain: brainName });
                });
            }
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * Read a file from any brain in stack
 * @param {string} path - File path
 * @param {Object} options - Options
 * @returns {string|null} File content
 */
function readStack(path, options = {}) {
    const brain = require('./brain');

    // If brain specified in options, try that first
    if (options.brain) {
        try {
            brain.pushBrain(options.brain);
            const content = getStorage('file').read(path);
            if (content !== null) {
                brain.removeBrain();
                return content;
            }
        } catch (e) {
            // Try next brain
        } finally {
            brain.removeBrain();
        }
    }

    // Otherwise search all brains in stack
    const stack = brain.getStack();
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const content = getStorage('file').read(path);
            if (content !== null) {
                brain.removeBrain();
                return content;
            }
        } catch (e) {
            // Try next brain
        } finally {
            brain.removeBrain();
        }
    }

    return null;
}

/**
 * Check if file exists in any brain in stack
 * @param {string} path - File path
 * @returns {Object} Result with brain info
 */
function existsStack(path) {
    const brain = require('./brain');
    const stack = brain.getStack();

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            if (getStorage('file').has(path)) {
                brain.removeBrain();
                return { exists: true, brain: brainName };
            }
        } catch (e) {
            // Try next brain
        } finally {
            brain.removeBrain();
        }
    }

    return { exists: false, brain: null };
}

/**
 * Get storage stats across all brains in stack
 * @returns {Object} Combined stats
 */
function getStackStats() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        totalFiles: 0,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const storage = getStorage('file');
            // Get brain path to count files
            const brainPath = brain.getBrainPath();
            const fs = require('fs');

            let fileCount = 0;
            if (fs.existsSync(brainPath)) {
                const files = fs.readdirSync(brainPath);
                fileCount = files.length;
            }

            results.byBrain[brainName] = { path: brainPath, files: fileCount };
            results.totalFiles += fileCount;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}


// ==================== EXPORTS ====================
// (Whole facade assignment — this is the canonical export object; the
// assignments above (module.atomicWrite etc.) attach to the same object.)
module.exports = {
    // Factory + shortcuts (SANS-100 safe-by-default)
    get: getStorage,
    read: (path) => getStorage('file').read(path),
    write: (path, data) => getStorage('file').write(path, data),
    delete: (path) => getStorage('file').delete(path),
    has: (path) => getStorage('file').has(path),
    list: (pattern) => getStorage('file').list(pattern),

    // 0.8.6 explicit RAW BYPASS (R-4 audit) — callers MUST pre-validate
    readRaw: (path) => getStorage('file').readRaw(path),
    writeRaw: (path, data, opts) => getStorage('file').writeRaw(path, data, opts),
    deleteRaw: (path) => getStorage('file').deleteRaw(path),
    listRaw: (pattern) => getStorage('file').listRaw(pattern),

    // Shared low-level utilities
    atomicWrite, sweepTemps, readJson, writeJson,
    atomicWriteFile: require('./primitives').atomicWriteFile,
    getStorageMetrics, getWalStatus,

    // WAL class + framework interface
    Wal,
    version: STORAGE_VERSION,
    getLayerStatus: () => ({ name: 'Storage', type: 'storage', version: STORAGE_VERSION, enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true }),

    // Multibrain stack
    listStack, readStack, existsStack, getStackStats
};

// Classes (extension surface)
module.exports.FileStorage = FileStorage;
module.exports.BrainStorage = BrainStorage;
module.exports.VectorStorage = VectorStorage;
module.exports.StateStorage = StateStorage;
module.exports.ConfigStorage = ConfigStorage;
module.exports.SchemaStorage = SchemaStorage;
module.exports.IslandStorage = IslandStorage;
module.exports.ReposStorage = ReposStorageImpl;
module.exports.RemoteStorage = RemoteStorageImpl;
