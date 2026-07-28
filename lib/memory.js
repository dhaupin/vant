const errors = require('./error');
/**
 * Memory - Unified Memory System for Vant OS
 *
 * Single interface for all memory types:
 * - Semantic: Vector embeddings, semantic search
 * - Document: Markdown files, human-readable (.md)
 * - State: Key-value cache with TTL
 * - Geometric: Barcode addressing via quasicrystal
 *
 * Uses brain (OS) for persistence - all security pipeline included.
 *
 * Usage:
 *   const { Memory } = require('./memory');
 *   const memory = new Memory();
 *
 *   // Semantic
 *   await memory.remember('pattern', { type: 'success', context: {...} });
 *   const results = await memory.find('pattern');
 *
 *   // Document (learn)
 *   await memory.learn('lessons/js', 'JavaScript is awesome', { ttl: 86400 });
 *
 *   // State
 *   await memory.state('session-id', 'abc123', { ttl: 3600 });
 *   const value = await memory.recall('session-id');
 *
 *   // Geometric
 *   const barcode = await memory.address('data to store');
 *   const data = await memory.locate(barcode);
 */

const embed = require('./embed');
const brain = require('./brain');
const geometry = require('./geometry');

// Lazy-load OS components
let _event = null;
let _audit = null;
let _sandbox = null;
let _rls = null;

function _getEvent() {
    if (!_event) try { _event = require('./event'); } catch (e) {}
    return _event;
}

function _getAudit() {
    if (!_audit) try { _audit = require('./audit'); } catch (e) {}
    return _audit;
}

function _getSandbox() {
    if (!_sandbox) try { _sandbox = require('./sandbox'); } catch (e) {}
    return _sandbox;
}

function _getRLS() {
    if (!_rls) try { _rls = require('./rls'); } catch (e) {}
    return _rls;
}

// Security check helpers
function _checkWrite(resource) {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.can && !sandbox.can('canWrite')) {
        throw new errors.VantError('ECAP: write not allowed', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }
    const rls = _getRLS();
    if (rls && rls.checkWrite) {
        rls.checkWrite(null, resource, 'write');
    }
}

function _checkRead(resource) {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.can && !sandbox.can('canRead')) {
        throw new errors.VantError('ECAP: read not allowed', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }
    const rls = _getRLS();
    if (rls && rls.checkRead) {
        rls.checkRead(null, resource, 'read');
    }
}

// Constants
const MEMORY_CATEGORY = 'memory';
const STATE_CATEGORY = 'state';
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Unified Memory System
 */
class Memory {
    constructor(options = {}) {
        // Multi-brain support: specify brain or use current from stack
        this._brainName = options.brain || null;  // null = use current brain
        
        // Semantic storage
        this.patterns = new Map();
        this.experiences = [];
        
        // State cache (key-value with TTL)
        this._cache = new Map();
        
        // Config
        this.maxExperiences = 1000;
        this.maxDataSize = 1000000; // 1MB
        
        // Load on init
        this._load();
    }

    // ==================== PRIVATE ====================
    
    /**
     * Get brain name for path calculations
     */
    _getBrainName() {
        if (this._brainName) {
            return this._brainName;
        }
        const b = require('./brain');
        return b.currentBrain() || 'default';
    }
    
    /**
     * Load semantic memories from brain
     */
    async _load() {
        try {
            const data = await brain.load(MEMORY_CATEGORY);
            if (data && data.experiences) {
                this.experiences = data.experiences;
                this.patterns = new Map();
                for (const exp of this.experiences) {
                    if (!this.patterns.has(exp.type)) {
                        this.patterns.set(exp.type, []);
                    }
                    this.patterns.get(exp.type).push(exp);
                }
            }
        } catch (e) {
            this.experiences = [];
            this.patterns = new Map();
        }
    }

    /**
     * Save semantic memories to brain
     */
    async _save() {
        // Use specified brain or current from stack
        const targetBrain = this._brainName || brain.currentBrain() || 'default';
        const useSpecificBrain = this._brainName && this._brainName !== (brain.currentBrain() || 'default');
        
        const data = JSON.stringify({
            experiences: this.experiences,
            savedAt: Date.now()
        }, null, 2);
        
        try {
            if (useSpecificBrain) {
                await brain.write(MEMORY_CATEGORY, 'experiences', data, { brain: targetBrain });
            } else {
                await brain.write(MEMORY_CATEGORY, 'experiences', data);
            }
        } catch (e) {
            // Fail silently
        }
    }

    /**
     * Sanitize data - prevent prototype pollution
     */
    sanitizeData(data) {
        if (data === null || data === undefined) return {};
        if (typeof data === 'string') return data;
        if (typeof data !== 'object') return String(data);
        const sanitized = {};
        for (const [key, val] of Object.entries(data)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            sanitized[key] = val;
        }
        return sanitized;
    }

    /**
     * Normalize TTL value
     */
    _normalizeTTL(ttl, expiresAt) {
        if (expiresAt) {
            return new Date(expiresAt).getTime() - Date.now();
        }
        return ttl || DEFAULT_TTL;
    }

    /**
     * Check if entry is expired
     */
    _isExpired(entry) {
        if (!entry.expiresAt) return false;
        return Date.now() > entry.expiresAt;
    }

    /**
     * Emit event to OS
     */
    _emit(event, data) {
        try {
            const ev = _getEvent();
            if (ev && ev.emit) ev.emit(event, data);
        } catch (e) {}
    }

    /**
     * Log to audit
     */
    _auditLog(action, data) {
        try {
            const audit = _getAudit();
            if (audit && audit.log) audit.log({ type: action, ...data });
        } catch (e) {}
    }

    // ==================== SEMANTIC ====================

    /**
     * Remember an experience (semantic/vector storage)
     * @param {string} type - Experience type/category
     * @param {any} data - Data to remember
     * @returns {object} Result with total count
     */
    async remember(type, data) {
        _checkWrite(`memory:${type}`);
        const sanitized = this.sanitizeData(data);
        const size = JSON.stringify(sanitized).length;

        if (size > this.maxDataSize) {
            throw new errors.VantError('EMEMORY: Data too large: max ' + this.maxDataSize + ' bytes', { code: errors.CODES.UNKNOWN });
        }

        const exp = {
            type,
            data: sanitized,
            timestamp: Date.now(),
            vector: await embed.embed(JSON.stringify(data))
        };

        this.experiences.push(exp);

        // Trim old
        if (this.experiences.length > this.maxExperiences) {
            this.experiences = this.experiences.slice(-this.maxExperiences);
        }

        // Index
        if (!this.patterns.has(type)) {
            this.patterns.set(type, []);
        }
        this.patterns.get(type).push(exp);

        // Persist
        await this._save();

        // Event + Audit
        this._emit('memory:remembered', { type, size });
        this._auditLog('memory_remember', { type, size });

        return { remembered: true, total: this.experiences.length };
    }

    /**
     * Find similar experiences (semantic search)
     * @param {string} query - Search query
     * @param {object} options - { topK: 5, type: null }
     * @returns {array} Matching experiences
     */
    async find(query, options = {}) {
        _checkRead(`memory:search`);
        const { topK = 5, type = null } = options;
        const queryVec = await embed.embed(query);

        let candidates = type
            ? (this.patterns.get(type) || [])
            : this.experiences;

        // Score by cosine similarity
        const scored = candidates.map(exp => ({
            exp,
            score: embed.cosineSimilarity(queryVec, exp.vector)
        }));

        scored.sort((a, b) => b.score - a.score);

        return scored.slice(0, topK).map(s => ({
            type: s.exp.type,
            data: s.exp.data,
            score: s.score,
            timestamp: s.exp.timestamp
        }));
    }

    // ==================== DOCUMENT ====================

    /**
     * Learn content (document storage)
     * Stores as markdown in brain - human readable
     * @param {string} key - Document key (category/key format)
     * @param {string} content - Content to learn
     * @param {object} opts - { ttl, expiresAt }
     * @returns {object} Result
     */
    async learn(key, content, opts = {}) {
        _checkWrite(`doc:${key}`);
        const { ttl, expiresAt, brain: brainName } = opts;
        const learnTTL = this._normalizeTTL(ttl, expiresAt);

        // Parse key as category/key
        const parts = key.split('/');
        const category = parts[0] || 'learnings';
        const fileKey = parts.slice(1).join('/') || 'default.md';

        // Write to brain (security included)
        // Support per-brain storage via brain option
        if (brainName) {
            await brain.write(category, fileKey, content, { brain: brainName });
        } else {
            await brain.write(category, fileKey, content);
        }

        // Memoize for fast recall (per-brain, matching query cache key format)
        const cacheKey = (brainName || 'default') + ':learn:' + key;
        this._cache.set(cacheKey, {
            content,
            expiresAt: Date.now() + learnTTL
        });

        // Event + Audit
        this._emit('memory:learned', { key, category, contentLength: content.length });
        this._auditLog('memory_learn', { key, category, contentLength: content.length });

        return { success: true, key, ttl: learnTTL };
    }

    /**
     * Query learned content
     * @param {string} key - Document key
     * @returns {string|null} Content or null
     */
    async query(key, opts = {}) {
        _checkRead(`doc:${key}`);
        const { brain: brainName } = opts;
        
        // Check cache first (per-brain)
        const cacheKey = (brainName || 'default') + ':learn:' + key;
        const cached = this._cache.get(cacheKey);
        if (cached && !this._isExpired(cached)) {
            return cached.content;
        }

        // Load from brain
        const parts = key.split('/');
        const category = parts[0] || 'learnings';
        const fileKey = parts.slice(1).join('/') || 'default.md';

        try {
            let data;
            if (brainName && brainName !== this._getBrainName()) {
                // Load from specific brain
                data = await brain.load(brainName + '/' + category + '/' + fileKey);
            } else {
                data = await brain.load(category + '/' + fileKey);
            }
            if (data && data.content) {
                return data.content;
            }
        } catch (e) {}

        return null;
    }

    // ==================== STATE ====================

    /**
     * Store state (key-value with TTL)
     * @param {string} key - State key
     * @param {any} value - Value to store
     * @param {object} opts - { ttl, expiresAt, brain }
     * @returns {object} Result
     */
    async state(key, value, opts = {}) {
        _checkWrite(`state:${key}`);
        const { ttl, expiresAt, brain: brainName } = opts;
        const stateTTL = this._normalizeTTL(ttl, expiresAt);

        const entry = {
            value,
            expiresAt: Date.now() + stateTTL,
            storedAt: Date.now()
        };

        // Cache with brain prefix
        const cacheKey = (brainName || 'default') + ':state:' + key;
        this._cache.set(cacheKey, entry);

        // Also persist to brain for recovery
        try {
            if (brainName) {
                await brain.write(STATE_CATEGORY, key + '.json', JSON.stringify(entry), { brain: brainName });
            } else {
                await brain.write(STATE_CATEGORY, key + '.json', JSON.stringify(entry));
            }
        } catch (e) {}

        // Event + Audit
        this._emit('memory:stated', { key, brain: brainName });
        this._auditLog('memory_state', { key, brain: brainName });

        return { success: true, key, ttl: stateTTL };
    }

    /**
     * Recall state (key-value retrieval)
     * @param {string} key - State key
     * @param {object} opts - { brain }
     * @returns {any} Stored value or undefined
     */
    async recall(key, opts = {}) {
        _checkRead(`state:${key}`);
        const { brain: brainName } = opts;
        
        // Check memory cache (per-brain)
        const cacheKey = (brainName || 'default') + ':state:' + key;
        const entry = this._cache.get(cacheKey);
        if (entry && !this._isExpired(entry)) {
            return entry.value;
        }

        // Try brain
        try {
            let data;
            if (brainName && brainName !== this._getBrainName()) {
                data = await brain.load(brainName + '/' + STATE_CATEGORY + '/' + key + '.json');
            } else {
                data = await brain.load(STATE_CATEGORY + '/' + key + '.json');
            }
            if (data) {
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                if (parsed && !this._isExpired(parsed)) {
                    this._cache.set(cacheKey, parsed);
                    return parsed.value;
                }
            }
        } catch (e) {}

        return undefined;
    }

    // ==================== GEOMETRIC ====================

    /**
     * Store at geometric address (quasicrystal)
     * @param {string} data - Data to store
     * @param {object} opts - Additional options
     * @returns {string} Barcode address
     */
    async address(data, opts = {}) {
        _checkWrite(`geo:address`);
        // Generate a valid 12-digit barcode
        // Format: 1-XXXXX-XXXXX-C (12 digits total)
        const facility = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
        const sequence = Date.now().toString().slice(-5);
        const checksum = Math.floor(Math.random() * 10);
        const barcode = `1-${facility}-${sequence}-${checksum}`;
        
        // Store using geometry system
        const basePath = process.env.VANT_GEOMETRY_PATH || 
            require('path').join(__dirname, '..', 'models', 'private', 'geometry');
        
        await geometry.store(barcode, data, basePath, opts);

        // Event + Audit
        this._emit('memory:addressed', { barcode });
        this._auditLog('memory_address', { barcode });

        return barcode;
    }

    /**
     * Store at a specific barcode (deterministic - for deterministic storage)
     * @param {string} barcode - Specific barcode address
     * @param {any} data - Data to store
     * @param {object} opts - Additional options
     * @returns {object} Result
     */
    async geoStore(barcode, data, opts = {}) {
        _checkWrite(`geo:${barcode}`);
        const basePath = process.env.VANT_GEOMETRY_PATH ||
            require('path').join(__dirname, '..', 'models', 'private', 'geometry');

        await geometry.store(barcode, data, basePath, opts);

        this._emit('memory:geoStored', { barcode });
        this._auditLog('memory_geoStore', { barcode });

        return { barcode, stored: true };
    }

    /**
     * Locate and retrieve from geometric address
     * @param {string} barcode - Geometric address
     * @returns {any} Stored data
     */
    async locate(barcode) {
        _checkRead(`geo:${barcode}`);
        const basePath = process.env.VANT_GEOMETRY_PATH || 
            require('path').join(__dirname, '..', 'models', 'private', 'geometry');
        
        return await geometry.retrieve(barcode, basePath);
    }

    // ==================== UTILITIES ====================

    /**
     * Get memory statistics
     * @returns {object} Stats
     */
    getStats() {
        const typeCounts = {};
        for (const [type, exps] of this.patterns) {
            typeCounts[type] = exps.length;
        }

        return {
            semantic: {
                total: this.experiences.length,
                types: typeCounts,
                capacity: this.maxExperiences
            },
            state: this._cache.size,
            categories: typeCounts
        };
    }

    /**
     * Clear all memory (reset)
     * @returns {object} Result
     */
    async clear() {
        this.patterns.clear();
        this.experiences = [];
        this._cache.clear();
        await this._save();
        
        this._emit('memory:cleared', {});
        this._auditLog('memory_clear', {});

        return { cleared: true };
    }

    /**
     * Clear specific memory type
     * @param {string} type - Type to clear
     * @returns {object} Result
     */
    async clearType(type) {
        if (type === 'semantic') {
            this.patterns.clear();
            this.experiences = [];
        } else if (type === 'state') {
            this._cache.clear();
        }
        
        await this._save();
        return { cleared: type };
    }
}

// Singleton instance
const memory = new Memory();

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get stats from all brains in the stack
 * @returns {Object} Combined stats
 */
function getStackStats() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        totalNeurons: 0,
        byBrain: {}
    };
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const s = memory.getStats();
            results.byBrain[brainName] = s;
            results.totalNeurons += s.neurons || 0;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    
    return results;
}

/**
 * Find memories across all brains in the stack
 * @param {string} query - Query string
 * @param {Object} options - Options
 * @returns {Array} Combined results
 */
function findStack(query, options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const found = memory.find(query, options);
            if (Array.isArray(found)) {
                found.forEach(f => {
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

// Export both class and instance
module.exports = {
    Memory,
    memory,
    
    // State persistence (used by Habitat)
    state: (key, value, opts) => memory.state(key, value, opts),
    recall: (key) => memory.recall(key),
    
    // Semantic memory
    remember: (type, data) => memory.remember(type, data),
    find: (query, opts) => memory.find(query, opts),
    
    // Document memory
    learn: (key, content, opts) => memory.learn(key, content, opts),
    query: (key) => memory.query(key),
    
    // Geometric memory
    address: (data, opts) => memory.address(data, opts),
    geoStore: (barcode, data, opts) => memory.geoStore(barcode, data, opts),
    locate: (barcode) => memory.locate(barcode),
    
    // Utilities
    getStats: () => memory.getStats(),
    clear: () => memory.clear(),

    // Duality - Brain-Geometry Bridge
    
    // Multibrain Stack
    getStackStats,
    findStack
};
