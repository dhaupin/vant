/**
 * Tmp - Unified temporary storage for AI-first OS (v0.8.6)
 * WITH EVENT EMISSIONS - temp operations emit globally
 *
 * Provides: workspace, myStuff, yourStuff, cache
 * SECURITY: Heavy protection layer
 */

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

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cacheModule = require('./cache');
// v0.9.0-axolotl T7: use Cache class directly instead of module-level singleton.
// Architectural goal: brand-new arch with no thin wrappers / aliases. Each
// consumer owns its own Cache instance; the `defaultCache` export in cache.js
// stays only for external backward compat.
const cache = new cacheModule.Cache();
const vaf = require('./vaf');
const sudo = require('./sudo');
const qos = require('./qos');
const audit = require('./audit');
const errors = require('./error');

// (storage migration) Space files route through the shared models FileStorage
// (containment/symlink/VAF/atomic-write) on top of this class's own full
// security chain (sudo/sandbox/qos/escrow/lock/vaf/audit). Enumeration stays
// on fs (pattern-glob limitation) at anchored paths.
const _tmpModelsRoot = path.resolve(process.cwd(), 'models');

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
    // (storage migration: getBrainStorage() returns {basePath, version} - it
    // has NO .path property, so the old expression always fell through to
    // './storage'. Spaces now anchor at the models root, matching
    // BrainStorage.basePath and brain.js's models/tmp-space APIs.)
    _getPath() {
        const modelsRoot = require('./brain').getBrainStorage?.()?.basePath || _tmpModelsRoot;
        const sub = this.name === 'workspace' ? 'workspace' :
                    this.name === 'myStuff' ? 'myStuff' :
                    this.name === 'yourStuff' ? 'yourStuff' : 'tmp';
        return path.join(modelsRoot, 'tmp-space', sub);
    }

    // Shared models-rooted store (per-space instance is fine; containment is
    // basePath-relative, spaces are distinguished by their path)
    _getStore() {
        if (!this._store) {
            const Storage = require('./storage');
            this._store = new Storage.FileStorage({ basePath: _tmpModelsRoot });
        }
        return this._store;
    }

    _rel(absolutePath) {
        return path.relative(_tmpModelsRoot, absolutePath);
    }

    // Check security chain
    _checkPerm(op) {
        const taskId = _getTaskId();

        // Sudo: check permissions
        if (this.secured) {
            const scope = op === 'read' ? 'read' : 'write';
            if (!sudo.can(taskId, scope)) {
                throw new errors.Error('EPERM: ' + scope + ' not allowed by sudo', { code: errors.CODES.SUDO_RESTRICTED, retryable: false });
            }
        }

        // Sandbox
        const sb = global._sandbox;
        if (sb && typeof sb.can === 'function') {
            if (op === 'write' && !sb.can('canWrite')) throw new errors.Error('EPERM: canWrite not allowed', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
            if (op === 'read' && !sb.can('canRead')) throw new errors.Error('EPERM: canRead not allowed', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            if (op === 'delete' && !sb.can('canDelete')) throw new errors.Error('EPERM: canDelete not allowed', { code: errors.CODES.STORAGE_DELETE_DENIED, retryable: false });
        }

        // QoS
        const qosMod = global._qos;
        if (qosMod?.canProceed && !qosMod.canProceed(`tmp:${this.name}:${op}`)) {
            throw new errors.Error('E429: rate limited', { code: errors.CODES.RATE_LIMIT_EXCEEDED, retryable: true });
        }

        // Escrow
        const esc = global._escrow;
        const budget = esc?.reserve?.(`tmp:${this.name}`, 1) || 1;
        if (budget <= 0) throw new errors.Error('EBUDGET: insufficient', { code: errors.CODES.BUDGET_INSUFFICIENT, retryable: false });

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
            throw new errors.Error('ELIMIT: max files reached', { code: errors.CODES.STORAGE_LIMIT_EXCEEDED, retryable: false });
        }
        return true;
    }

    // Sanitize filename
    _sanitize(name) {
        if (!name || typeof name !== 'string') throw new errors.Error('Invalid name', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
        const safe = vaf.sanitize(name);
        if (safe.includes('..') || safe.includes('/') || safe.includes('\\')) {
            throw new errors.Error('EPATH: path traversal blocked', { code: errors.CODES.VAF_PATH_TRAVERSAL, retryable: false });
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
        // Pass-19 lock API fix: acquire() resolves to a TOKEN string and
        // release(id, token) frees it. The old code treated the token as a
        // release function and called it, crashing every put with
        // 'release is not a function' after the write had already landed.
        const token = await global._lock?.acquire?.(`tmp:${this.name}:write`);
        if (!token) throw new errors.Error('ELOCK: could not acquire', { code: errors.CODES.LOCK_ACQUIRE_FAILED, retryable: true });

        const safeName = this._sanitize(name);
        this._ensure();
        this._checkLimits();

        try {
            if (content.length > this.maxFileSize) throw new errors.Error('ESIZE: too large', { code: errors.CODES.STORAGE_LIMIT_EXCEEDED, retryable: false });
            const filePath = path.join(this._getPath(), safeName);
            this._getStore().write(this._rel(filePath), content);

            // EVENT: temp file written (audit trail)
            _emit('tmp:written', {
                space: this.name,
                file: safeName,
                size: content.length,
                timestamp: Date.now()
            });

            global._escrow?.release?.(`tmp:${this.name}`, budget);
            await global._lock?.release?.(`tmp:${this.name}:write`, token);
            this._audit('put', { name: safeName, size: content.length });
            return { saved: safeName, space: this.name };
        } catch (e) {
            global._escrow?.release?.(`tmp:${this.name}`, budget);
            await global._lock?.release?.(`tmp:${this.name}:write`, token);
            throw e;
        }
    }

    // Get file
    async get(name) {
        this._checkPerm('read');
        const safeName = this._sanitize(name);
        const filePath = path.join(this._getPath(), safeName);
        const content = this._getStore().read(this._rel(filePath));
        if (content === null) return { error: 'not found', space: this.name };
        this._audit('get', { name: safeName });
        return { name: safeName, content, space: this.name };
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
        // Same lock API fix as put(): acquire → token, release(id, token).
        const token = await global._lock?.acquire?.(`tmp:${this.name}:delete`);
        if (!token) throw new errors.Error('ELOCK: could not acquire', { code: errors.CODES.LOCK_ACQUIRE_FAILED, retryable: true });

        const safeName = this._sanitize(name);
        const filePath = path.join(this._getPath(), safeName);

        try {
            this._getStore().delete(this._rel(filePath));
            this._audit('delete', { name: safeName });
            global._escrow?.release?.(`tmp:${this.name}`, budget);
            await global._lock?.release?.(`tmp:${this.name}:delete`, token);
            return { deleted: safeName, space: this.name };
        } catch (e) {
            global._escrow?.release?.(`tmp:${this.name}`, budget);
            await global._lock?.release?.(`tmp:${this.name}:delete`, token);
            throw e;
        }
    }

    // Clear space
    // (storage migration: deletes per-entry through the store; the space
    // namespace is flat - names are vaf-sanitized, no slashes - so no
    // recursive rm is needed. Enumeration stays on fs.)
    async clear() {
        this._checkPerm('delete');
        const dir = this._getPath();
        if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
                this._getStore().delete(this._rel(path.join(dir, f)));
            }
        }
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
        // v0.9.0-axolotl T7: return the underlying promise from Cache.set
        // (which uses _withLock). Old code returned a sync stub; now callers
        // can await the actual write completion if they need it.
        const p = cache.set(key, value, { ttl });
        if (p && typeof p.then === 'function') {
            return p.then(() => ({ cached: key }));
        }
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
