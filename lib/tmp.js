/**
 * Tmp - Temporary file handler (dropbox, cache, temp, myStuff, yourStuff)
 * 
 * Gates: Sandbox → Escrow → Lock
 * Uses existing: sandbox.js, escrow.js, lock.js, storage.js
 * 
 * DropBox: Shared file exchange between agents
 * myStuff: Private user data (private/)
 * yourStuff: Shared/public data (shared/)
 * Cache: Temp data caching
 * Temp: Scratch space
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Get paths
function _getStoragePath() {
    const storage = global._brain?.getBrainStorage?.()?.path || require('./brain').getBrainStorage?.()?.path || './storage';
    return path.join(storage, 'tmp');
}

function _getPrivatePath() {
    const storage = global._brain?.getBrainStorage?.()?.path || require('./brain').getBrainStorage?.()?.path || './storage';
    return path.join(storage, 'private');
}

function _getSharedPath() {
    const storage = global._brain?.getBrainStorage?.()?.path || require('./brain').getBrainStorage?.()?.path || './storage';
    return path.join(storage, 'shared');
}

// Sandbox for capability checks
function _getSandbox() {
    let sb = global._sandbox;
    if (!sb) try { sb = global._sandbox = require('./sandbox'); } catch (e) {}
    return sb;
}

// Escrow for budget
function _getEscrow() {
    let esc = global._escrow;
    if (!esc) try { esc = global._escrow = require('./escrow'); } catch (e) {}
    return esc;
}

// Lock for concurrent access
function _getLock() {
    let lock = global._lock;
    if (!lock) try { lock = global._lock = require('./lock'); } catch (e) {}
    return lock;
}

/**
 * DropBox - Shared file exchange
 */
function _ensureDropbox() {
    const dropPath = path.join(_getStoragePath(), 'dropbox');
    if (!fs.existsSync(dropPath)) fs.mkdirSync(dropPath, { recursive: true });
    return dropPath;
}

/**
 * Save to dropbox
 */
async function dropboxPut(name, content) {
    const sb = _getSandbox();
    const esc = _getEscrow();
    const lock = _getLock();
    
    // 1. Sandbox: canWrite?
    if (sb && typeof sb.can === 'function' && !sb.can('canWrite')) {
        throw new Error('EPERM: canWrite not allowed');
    }
    
    // 2. Escrow: budget
    const budget = esc?.reserve?.('dropbox', 1) || 1;
    if (budget <= 0) {
        throw new Error('EBUDGET: insufficient budget');
    }
    
    // 3. Lock: serialize
    const release = await lock?.acquire?.('dropbox:put');
    if (!release) {
        throw new Error('ELOCK: could not acquire lock');
    }
    
    try {
        const dropPath = _ensureDropbox();
        const filePath = path.join(dropPath, name.replace(/\/|\\/g, ''));
        
        // Atomic write
        const tempPath = filePath + '.' + crypto.randomUUID();
        fs.writeFileSync(tempPath, content, 'utf8');
        fs.renameSync(tempPath, filePath);
        
        return { saved: name, path: filePath };
    } catch (e) {
        throw e;
    } finally {
        esc?.release?.('dropbox', 1);
        release?.();
    }
}

/**
 * Get from dropbox
 */
async function dropboxGet(name) {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canRead')) {
        throw new Error('EPERM: canRead not allowed');
    }
    
    const dropPath = _ensureDropbox();
    const filePath = path.join(dropPath, name.replace(/\/|\\/g, ''));
    
    if (!fs.existsSync(filePath)) return { error: 'not found' };
    
    return { name, content: fs.readFileSync(filePath, 'utf8') };
}

/**
 * List dropbox files
 */
async function dropboxList() {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canRead')) {
        throw new Error('EPERM: canRead not allowed');
    }
    
    const dropPath = _ensureDropbox();
    if (!fs.existsSync(dropPath)) return { files: [] };
    
    const files = fs.readdirSync(dropPath).map(f => {
        const stat = fs.statSync(path.join(dropPath, f));
        return { name: f, size: stat.size, mtime: stat.mtime };
    });
    
    return { files };
}

/**
 * Delete from dropbox
 */
async function dropboxDelete(name) {
    const sb = _getSandbox();
    const lock = _getLock();
    
    if (sb && typeof sb.can === 'function' && !sb.can('canDelete')) {
        throw new Error('EPERM: canDelete not allowed');
    }
    
    const release = await lock?.acquire?.('dropbox:delete');
    if (!release) {
        throw new Error('ELOCK: could not acquire lock');
    }
    
    try {
        const dropPath = _ensureDropbox();
        const filePath = path.join(dropPath, name.replace(/\/|\\/g, ''));
        
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        
        return { deleted: name };
    } finally {
        release?.();
    }
}

/**
 * Clear dropbox
 */
async function dropboxClear() {
    const sb = _getSandbox();
    const lock = _getLock();
    
    if (sb && typeof sb.can === 'function' && !sb.can('canDelete')) {
        throw new Error('EPERM: canDelete not allowed');
    }
    
    const release = await lock?.acquire?.('dropbox:clear');
    if (!release) {
        throw new Error('ELOCK: could not acquire lock');
    }
    
    try {
        const dropPath = path.join(_getStoragePath(), 'dropbox');
        
        if (fs.existsSync(dropPath)) {
            fs.rmSync(dropPath, { recursive: true, force: true });
        }
        
        return { cleared: true };
    } finally {
        release?.();
    }
}

/**
 * Cache - Temp data caching
 */
function cacheSet(key, value, ttl = 3600000) {
    const cachePath = path.join(_getStoragePath(), 'cache');
    if (!fs.existsSync(cachePath)) fs.mkdirSync(cachePath, { recursive: true });
    
    const data = { value, expires: Date.now() + ttl };
    const filePath = path.join(cachePath, Buffer.from(key).toString('base64'));
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    
    return { cached: key };
}

function cacheGet(key) {
    const cachePath = path.join(_getStoragePath(), 'cache');
    const filePath = path.join(cachePath, Buffer.from(key).toString('base64'));
    
    if (!fs.existsSync(filePath)) return { error: 'not found' };
    
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Date.now() > data.expires) {
            fs.unlinkSync(filePath);
            return { error: 'expired' };
        }
        return { key, value: data.value };
    } catch (e) {
        return { error: e.message };
    }
}

function cacheClear() {
    const cachePath = path.join(_getStoragePath(), 'cache');
    if (fs.existsSync(cachePath)) {
        fs.rmSync(cachePath, { recursive: true, force: true });
    }
    return { cleared: true };
}



// ============ myStuff (private) ============
function _ensureMyStuff() {
    const myPath = _getPrivatePath();
    if (!fs.existsSync(myPath)) fs.mkdirSync(myPath, { recursive: true });
    return myPath;
}

/**
 * Save to myStuff (private user data)
 */
async function myStuffPut(name, content) {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canWrite')) {
        throw new Error('EPERM: canWrite not allowed');
    }
    
    const myPath = _ensureMyStuff();
    const filePath = path.join(myPath, name.replace(//|\/g, ''));
    
    const tempPath = filePath + '.' + crypto.randomUUID();
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
    
    return { saved: name, type: 'myStuff' };
}

/**
 * Get from myStuff
 */
async function myStuffGet(name) {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canRead')) {
        throw new Error('EPERM: canRead not allowed');
    }
    
    const filePath = path.join(_ensureMyStuff(), name.replace(//|\/g, ''));
    if (!fs.existsSync(filePath)) return { error: 'not found' };
    
    return { name, content: fs.readFileSync(filePath, 'utf8'), type: 'myStuff' };
}

/**
 * List myStuff
 */
async function myStuffList() {
    const myPath = _ensureMyStuff();
    return { files: fs.readdirSync(myPath).map(f => ({ name: f })), type: 'myStuff' };
}

/**
 * Delete from myStuff
 */
async function myStuffDelete(name) {
    const filePath = path.join(_ensureMyStuff(), name.replace(//|\/g, ''));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { deleted: name, type: 'myStuff' };
}

// ============ yourStuff (shared) ============
function _ensureYourStuff() {
    const sharedPath = _getSharedPath();
    if (!fs.existsSync(sharedPath)) fs.mkdirSync(sharedPath, { recursive: true });
    return sharedPath;
}

/**
 * Save to yourStuff (shared/public data)
 */
async function yourStuffPut(name, content) {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canWrite')) {
        throw new Error('EPERM: canWrite not allowed');
    }
    
    const sharedPath = _ensureYourStuff();
    const filePath = path.join(sharedPath, name.replace(//|\/g, ''));
    
    const tempPath = filePath + '.' + crypto.randomUUID();
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
    
    return { saved: name, type: 'yourStuff' };
}

/**
 * Get from yourStuff
 */
async function yourStuffGet(name) {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canRead')) {
        throw new Error('EPERM: canRead not allowed');
    }
    
    const filePath = path.join(_ensureYourStuff(), name.replace(//|\/g, ''));
    if (!fs.existsSync(filePath)) return { error: 'not found' };
    
    return { name, content: fs.readFileSync(filePath, 'utf8'), type: 'yourStuff' };
}

/**
 * List yourStuff
 */
async function yourStuffList() {
    const sharedPath = _ensureYourStuff();
    return { files: fs.readdirSync(sharedPath).map(f => ({ name: f })), type: 'yourStuff' };
}

/**
 * Delete from yourStuff
 */
async function yourStuffDelete(name) {
    const filePath = path.join(_ensureYourStuff(), name.replace(//|\/g, ''));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { deleted: name, type: 'yourStuff' };
}


module.exports = {

// myStuff (private)
    myStuffPut,
    myStuffGet,
    myStuffList,
    myStuffDelete,
// yourStuff (shared)
    yourStuffPut,
    yourStuffGet,
    yourStuffList,
    yourStuffDelete,

    // DropBox
    dropboxPut,
    dropboxGet,
    dropboxList,
    dropboxDelete,
    dropboxClear,
    // Cache
    cacheSet,
    cacheGet,
    cacheClear,
    getLayerStatus: () => ({ name: 'Tmp', type: 'tmp', version: '0.8.7', enabled: true })
};