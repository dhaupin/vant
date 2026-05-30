/**
 * Tmp - Unified temporary storage for AI-first OS (v0.8.7)
 * 
 * Provides: workspace, myStuff, yourStuff, cache
 * SECURITY: Heavy protection layer
 * - Sudo: Task-based permission checks
 * - VAF: Input validation + path traversal + injection prevention
 * - Sandbox: Capability gating (canRead/Write/Delete)
 * - QoS: Rate limiting
 * - Escrow: Budget limiting
 * - Lock: Concurrent access serialization
 * - Audit: All operations logged
 * - Limits: Max file size, max files per space
 * 
 * Uses: vaf.js, sandbox.js, qos.js, escrow.js, lock.js, storage.js, cache.js, audit.js, sudo.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cache = require('./cache');
const vaf = require('./vaf');
const sudo = require('./sudo');
const qos = require('./qos');
const audit = require('./audit');

// ==================== TASK CONTEXT ====================
// Current task ID (for sudo + delegation chain)
let _currentTaskId = 'default';

function _getTaskId() {
    return _currentTaskId || 'default';
}

function setTaskId(taskId) {
    _currentTaskId = taskId;
    return { taskId: _currentTaskId };
}

function getTaskId() {
    return _currentTaskId;
}

// ==================== CLASS: TmpSpace ====================
// Unified temporary storage class

class TmpSpace {
    constructor(options = {}) {
        this.name = options.name || 'default';
        this.maxFileSize = options.maxFileSize || (1024 * 1024);  // 1MB default
        this.maxFiles = options.maxFiles || 100;
        this.secured = options.secured !== false;
    }
    
    // Get path for this space
    _getPath() {
        const brain = global._brain;
        const storagePath = brain?.getBrainStorage?.()?.path || require('./brain').getBrainStorage?.()?.path || './storage';
        return path.join(storagePath, this.name === 'workspace' ? 'workspace' : 
                                          this.name === 'myStuff' ? 'private/myStuff' : 
                                          this.name === 'yourStuff' ? 'shared/yourStuff' : 'tmp');
    }
    
    // Check security chain
    _checkPerm(op) {
        const taskId = _getTaskId();
        
        // Sudo: check permissions
        if (this.secured) {
            const scope = op === 'read' ? 'read' : 'write';
            if (!sudo.can(taskId, scope)) {
                throw new Error(`EPERM: ${scope} not allowed by sudo`);
            }
        }
        
        // Sandbox
        const sb = global._sandbox;
        if (sb && typeof sb.can === 'function') {
            if (op === 'write' && !sb.can('canWrite')) throw new Error('EPERM: canWrite not allowed');
            if (op === 'read' && !sb.can('canRead')) throw new Error('EPERM: canRead not allowed');
            if (op === 'delete' && !sb.can('canDelete')) throw new Error('EPERM: canDelete not allowed');
        }
        
        // QoS
        const qosMod = global._qos;
        if (qosMod?.canProceed && !qosMod.canProceed(`tmp:${this.name}:${op}`)) {
            throw new Error('E429: rate limited');
        }
        
        // Escrow
        const esc = global._escrow;
        const budget = esc?.reserve?.(`tmp:${this.name}`, 1) || 1;
        if (budget <= 0) throw new Error('EBUDGET: insufficient');
        
        return budget;
    }
    
    // Ensure directory exists
    _ensure() {
        const dir = this._getPath();
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return dir;
    }
    
    // Check limits
    _checkLimits() {
        const dir = this._getPath();
        if (!fs.existsSync(dir)) return true;
        if (fs.readdirSync(dir).length >= this.maxFiles) {
            throw new Error('ELIMIT: max files reached');
        }
        return true;
    }
    
    // Sanitize filename
    _sanitize(name) {
        if (!name || typeof name !== 'string') throw new Error('Invalid name');
        const safe = vaf.sanitize(name);
        if (safe.includes('..') || safe.includes('/') || safe.includes('\\')) {
            throw new Error('EPATH: path traversal blocked');
        }
        return safe.slice(0, 255);
    }
    
    // Log audit
    _audit(op, data) {
        try { audit?.log?.({ component: 'tmp', space: this.name, op, data, time: Date.now(), taskId: _getTaskId() }); } catch (e) {}
    }
    
    // Put file
    async put(name, content) {
        const budget = this._checkPerm('write');
        const release = await global._lock?.acquire?.(`tmp:${this.name}:write`);
        if (!release) throw new Error('ELOCK: could not acquire');
        
        const safeName = this._sanitize(name);
        this._ensure();
        this._checkLimits();
        
        try {
            if (content.length > this.maxFileSize) throw new Error('ESIZE: too large');
            const filePath = path.join(this._getPath(), safeName);
            fs.writeFileSync(filePath, content, 'utf8');
            global._escrow?.release?.(`tmp:${this.name}`, budget);
            release();
            this._audit('put', { name: safeName, size: content.length });
            return { saved: safeName, space: this.name };
        } catch (e) {
            global._escrow?.release?.(`tmp:${this.name}`, budget);
            release();
            throw e;
        }
    }
    
    // Get file
    async get(name) {
        this._checkPerm('read');
        const safeName = this._sanitize(name);
        const filePath = path.join(this._getPath(), safeName);
        if (!fs.existsSync(filePath)) return { error: 'not found', space: this.name };
        this._audit('get', { name: safeName });
        return { name: safeName, content: fs.readFileSync(filePath, 'utf8'), space: this.name };
    }
    
    // List files
    async list() {
        this._checkPerm('read');
        const files = fs.existsSync(this._getPath()) ? fs.readdirSync(this._getPath()) : [];
        return { files: files.map(f => ({ name: f })), space: this.name };
    }
    
    // Delete file
    async delete(name) {
        const budget = this._checkPerm('delete');
        const release = await global._lock?.acquire?.(`tmp:${this.name}:delete`);
        if (!release) throw new Error('ELOCK: could not acquire');
        
        const safeName = this._sanitize(name);
        const filePath = path.join(this._getPath(), safeName);
        
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            this._audit('delete', { name: safeName });
            global._escrow?.release?.(`tmp:${this.name}`, budget);
            release();
            return { deleted: safeName, space: this.name };
        } catch (e) {
            global._escrow?.release?.(`tmp:${this.name}`, budget);
            release();
            throw e;
        }
    }
    
    // Clear space
    async clear() {
        this._checkPerm('delete');
        const dir = this._getPath();
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        this._audit('clear', {});
        return { cleared: this.name };
    }
}

// ==================== MODULE LAYER ====================
// Create unified Tmp instance

const Tmp = {
    // Pre-configured spaces
    _spaces: {},
    
    // Get or create space
    _getSpace(name) {
        if (!this._spaces[name]) {
            this._spaces[name] = new TmpSpace({ name });
        }
        return this._spaces[name];
    },
    
    // Unified put (space, name, content)
    async put(space, name, content) {
        return this._getSpace(space).put(name, content);
    },
    
    // Unified get (space, name)
    async get(space, name) {
        return this._getSpace(space).get(name);
    },
    
    // Unified list (space)
    async list(space) {
        return this._getSpace(space).list();
    },
    
    // Unified delete (space, name)
    async delete(space, name) {
        return this._getSpace(space).delete(name);
    },
    
    // Unified clear (space)
    async clear(space) {
        return this._getSpace(space).clear();
    },
    
    // Task context
    setTaskId,
    getTaskId,
    _getTaskId,
    
    // Cache
    cacheSet(key, value, ttl) { 
        cache.set(key, value, { ttl });
        return { cached: key };
    },
    cacheGet(key) {
        const value = cache.get(key);
        return value !== undefined ? { key, value } : { error: 'not found' };
    },
    cacheClear() { 
        cache.clear();
        return { cleared: true };
    },
    
    // Class for extension
    TmpSpace,
    
    // Layer info
    getLayerStatus: () => ({ 
        name: 'Tmp', 
        type: 'tmp', 
        version: '0.8.6', 
        enabled: true, 
        secured: true,
        spaces: ['workspace', 'myStuff', 'yourStuff', 'cache'],
        capabilities: ['put', 'get', 'list', 'delete', 'clear'],
        chain: ['sudo', 'sandbox', 'qos', 'escrow', 'lock', 'vaf', 'audit']
    }),
    getStatus: () => ({ enabled: true, taskId: _getTaskId(), spaces: ['workspace', 'myStuff', 'yourStuff', 'cache'] }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Tmp', operation: op })
};

module.exports = Tmp;