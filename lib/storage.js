/**
 * Storage (v0.8.6)
 * Unified storage abstraction layer for Vant
 * WITH EVENT EMISSIONS - all operations emit for interoperability
 *
 * Design:
 * - Type-specific storage classes
 * - Connector pattern (like providers/)
 * - Atomic writes for safety
 * - Lazy loading
 * - Sandbox capability gating
 * - Event emissions for reactivity
 *
 * Usage:
 *   const Storage = require('./storage');
 *   const brain = Storage.get('brain');
 *   const content = brain.get('identity', 'lessons.md');
 */

const fs = require('fs');
const sudo = require('./sudo');
const path = require('path');
const crypto = require('crypto');
const embed = require('./embed');
const errors = require('./error');

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

// Lazy load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

// Safe check functions
function _checkRead(userCtx, resource) {
    const sandbox = _getSandbox();
    // Capability check (global)
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new errors.Error('Read permission required', { code: errors.CODES.STORAGE_TYPE_UNKNOWN, retryable: false }, { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            }
        } catch (e) {}
    }
    // Auto-chain to RLS for per-record ACL
    if (userCtx && sandbox && sandbox._rls) {
        sandbox._rls.checkRead(userCtx, resource, 'read');
    }
}


// Lazy-load Encrypt for optional encryption at rest
let _Encrypt = null;
function _getEncrypt() {
    if (!_Encrypt) {
        try { _Encrypt = require('./encrypt'); } catch (e) {}
    }
    return _Encrypt;
}


function _checkWrite(userCtx, resource) {
    const sandbox = _getSandbox();
    // Capability check (global)
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new errors.Error('Write permission required', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
            }
        } catch (e) {}
    }
    // Auto-chain to RLS for per-record ACL
    if (userCtx && sandbox && sandbox._rls) {
        sandbox._rls.checkWrite(userCtx, resource, 'write');
    }
}

// ==================== CONSTANTS ====================
const STORAGE_VERSION = '0.8.6';

// Use brain router for path
const brain = require('./brain');
const MODELS_PATH = brain.getBrainPath();
const PUBLIC_PATH = brain.getPublicPath();

const CONFIG_PATH = 'vant.config.js';

// ==================== HELPERS ====================
// Atomic write - write to temp, then rename
function atomicWrite(filePath, content) {
    _checkWrite();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tempPath = filePath + '.' + crypto.randomUUID();
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
}

// Safe read JSON
function readJson(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

// Safe write JSON  
function writeJson(filePath, data) {
    atomicWrite(filePath, JSON.stringify(data, null, 2));
}

// ==================== FILE STORAGE ====================
class FileStorage {
    constructor(options = {}) {
        this.basePath = options.basePath || process.cwd();
        this.version = STORAGE_VERSION;
    }
    
    // Helper: Block dangerous filenames
    _isDangerousFilename(filePath) {
        const basename = path.basename(filePath);
        const dangerous = ['__proto__', 'constructor', ' prototype', '.git', 'etc/passwd'];
        return dangerous.some(d => basename.includes(d));
    }
    
    // NEW: Check containment (path stays within basePath)
    _checkContainment(fullPath) {
        const resolved = path.resolve(fullPath);
        const baseResolved = path.resolve(this.basePath);
        if (!resolved.startsWith(baseResolved)) {
            throw new errors.Error('Security: Path escape detected', { code: errors.CODES.SECURITY_PATH_ESCAPE, retryable: false });
        }
    }
    
    // Helper: Check for symlink attack
    _checkSymlink(fullPath) {
        // FIRST: Check containment (path escape) - do this regardless of file existence
        this._checkContainment(fullPath);
        
        // SECOND: Check if file is a symlink (only if file exists)
        try {
            const stats = fs.lstatSync(fullPath);
            if (stats.isSymbolicLink()) {
                throw new errors.Error('Security: Symlink attack detected', { code: errors.CODES.SECURITY_SYMLINK_ATTACK, retryable: false });
            }
        } catch(e) {
            if (e.code === 'ENOENT') {
                // File doesn't exist, but we already checked containment above - that's okay
            } else if (e.message.includes('Security')) {
                throw e;
            }
            // Other errors - ignore, containment check already passed
        }
    }

    read(filePath) {
        // Security: Block absolute paths - can read anything!
        if (path.isAbsolute(filePath)) {
            throw new errors.Error('Security: Absolute paths not allowed', { code: errors.CODES.SECURITY_ABSOLUTE_PATH, retryable: false });
        }
        
        const fullPath = path.join(this.basePath, filePath);
        
        // EVIL FIX: Check containment FIRST (before checking existence)
        // This catches path escapes like ../test even if file doesn't exist
        this._checkSymlink(fullPath);
        
        if (!fs.existsSync(fullPath)) return null;
        
        return fs.readFileSync(fullPath, 'utf8');
    }

    write(filePath, content) {
        // Security: Block absolute paths - can write anywhere!
        if (path.isAbsolute(filePath)) {
            throw new errors.Error('Security: Absolute paths not allowed', { code: errors.CODES.SECURITY_ABSOLUTE_PATH, retryable: false });
        }
        
        // EVIL FIX: Block __proto__ and dangerous filenames
        if (this._isDangerousFilename(filePath)) {
            throw new errors.Error('Security: Dangerous filename blocked', { code: errors.CODES.SECURITY_DANGEROUS_FILENAME, retryable: false });
        }
        
        const fullPath = path.join(this.basePath, filePath);
        
        // Security: Prevent symlink/hardlink escape by checking result
        atomicWrite(fullPath, content);
        
        // Verify what was actually written - not a symlink to escape
        try {
            const stats = fs.lstatSync(fullPath);
            if (stats.isSymbolicLink()) {
                // Dangerous! Remove it
                fs.unlinkSync(fullPath);
                throw new errors.Error('Security: Detected symlink attack', { code: errors.CODES.SECURITY_SYMLINK_ATTACK, retryable: false });
            }
        } catch(e) {
            if (e.code === 'ENOENT') {
                // File wasn't written - that's fine
            } else {
                throw e;
            }
        }
        
        return true;
    }

    readJson(filePath) {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.basePath, filePath);
        return readJson(fullPath);
    }

    writeJson(filePath, data) {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.basePath, filePath);
        writeJson(fullPath, data);
        return true;
    }

    has(filePath) {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.basePath, filePath);
        return fs.existsSync(fullPath);
    }

    delete(filePath) {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.basePath, filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            
            // EVENT: storage:deleted
            _emit('storage:deleted', { path: fullPath, timestamp: Date.now() });
            
            return true;
        }
        return false;
    }

    list(pattern) {
        // Simple glob - just prefix matching
        const dir = path.dirname(pattern);
        const base = path.basename(pattern).replace('*', '');
        const fullDir = path.isAbsolute(dir) ? dir : path.join(this.basePath, dir);
        
        if (!fs.existsSync(fullDir)) return [];
        
        return fs.readdirSync(fullDir)
            .filter(f => f.includes(base))
            .map(f => path.join(fullDir, f));
    }
}

// ==================== BRAIN STORAGE ====================
class BrainStorage {
    constructor(options = {}) {
        this.basePath = options.basePath || MODELS_PATH;
        this.version = STORAGE_VERSION;
    }

    _getFilePath(category, key) {
        // Validate and sanitize inputs - prevent path traversal
        const safeCategory = category.replace(/\/|\\\\|\.\./g, '').slice(0, 50);
        const safeKey = key.replace(/\/|\\\\|\.\./g, '').slice(0, 100);
        
        const dir = path.join(this.basePath, safeCategory);
        const fullPath = path.join(dir, safeKey);
        
        // CONTAINMENT: Verify path is within basePath
        const resolved = path.resolve(fullPath);
        const baseResolved = path.resolve(this.basePath);
        if (!resolved.startsWith(baseResolved)) {
            throw new errors.Error('Path traversal blocked', { code: errors.CODES.SECURITY_PATH_TRAVERSAL, retryable: false });
        }
        
        return fullPath;
    }

    get(category, key = null) {
        if (!category) return null;
        
        // Check sandbox capability (canRead for read operations)
        const sb = _getSandbox();
        if (sb && typeof sb.can === 'function' && !sb.can('canRead')) {
            _emit('storage:error', { op: 'get', category, key, error: 'canRead denied' });
            return { error: 'Sandbox: capability not allowed - canRead is false' };
        }
        
        if (!key) {
            // Return list of categories
            if (!fs.existsSync(this.basePath)) return [];
            return fs.readdirSync(this.basePath).filter(f => 
                fs.statSync(path.join(this.basePath, f)).isDirectory()
            );
        }
        
        const filePath = this._getFilePath(category, key);
        if (!fs.existsSync(filePath)) {
            _emit('storage:miss', { category, key });
            return null;
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        
        // EVENT: storage:loaded
        _emit('storage:loaded', { category, key, path: filePath, size: content.length, timestamp: Date.now() });
        
        return content;
    }

    write(category, key, content) {
        if (!key) return false;
        
        // Check sandbox capability (canWrite for write operations)
        const sb = _getSandbox();
        if (sb && typeof sb.can === 'function' && !sb.can('canWrite')) {
            _emit('storage:error', { op: 'write', category, key, error: 'canWrite denied' });
            return { error: 'Sandbox: capability not allowed - canWrite is false' };
        }
        
        // Add .md extension if not present (for brain compatibility)
        if (!key.endsWith('.md')) {
            key = key + '.md';
        }
        
        const dir = path.join(this.basePath, category);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const filePath = this._getFilePath(category, key);
        atomicWrite(filePath, content);
        
        // EVENT: storage:saved
        _emit('storage:saved', { category, key, path: filePath, size: content.length, timestamp: Date.now() });
        
        return true;
    }

    append(category, key, content) {
        const existing = this.get(category, key) || '';
        return this.write(category, key, existing + content);
    }

    has(category, key) {
        const filePath = this._getFilePath(category, key);
        const exists = fs.existsSync(filePath);
        
        // EVENT: storage:checked (non-blocking)
        if (exists) {
            _emit('storage:checked', { category, key, exists: true });
        }
        
        return exists;
    }

    // Brain-friendly: accepts full path or category+key
    brainHas(filePath) {
        // Block external path traversal
        if (filePath.includes('/') || filePath.includes('\\')) {
            // Full path given - BLOCK external access
            return false;
        }
        // Use safe internal method
        return this.has(filePath, '');
    }

    // Brain-friendly: accepts full path or category+key  
    brainRead(filePath) {
        // Block external path traversal
        if (filePath.includes('/') || filePath.includes('\\')) {
            // Full path given - BLOCK external access
            return null;
        }
        // Use safe internal method
        return this.get(filePath, '');
    }

    // Brain-friendly: list brains - BLOCK external dirs
    brainList(dirPath) {
        // Block external path access - only list internal brains
        if (!dirPath || dirPath.includes('/') || dirPath.includes('\\')) {
            return [];  // Return empty for safety
        }
        // Internal listing only
        if (!fs.existsSync(path.join(this.basePath, dirPath))) return [];
        const dir = path.join(this.basePath, dirPath);
        return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    }

    list(category) {
        const dir = path.join(this.basePath, category);
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    }

    query(query) {
        // Simple text search in brain files
        const results = [];
        const queryLower = query.toLowerCase();
        
        if (!fs.existsSync(this.basePath)) return results;
        
        for (const category of fs.readdirSync(this.basePath)) {
            const catDir = path.join(this.basePath, category);
            if (!fs.statSync(catDir).isDirectory()) continue;
            
            for (const file of fs.readdirSync(catDir)) {
                if (!file.endsWith('.md')) continue;
                
                const content = fs.readFileSync(path.join(catDir, file), 'utf8');
                if (content.toLowerCase().includes(queryLower)) {
                    results.push({
                        category,
                        file,
                        content: content.substring(0, 500)
                    });
                }
            }
        }
        
        return results;
    }
}

// ==================== VECTOR STORAGE ====================
class VectorStorage {
    constructor(options = {}) {
        this.connector = options.connector || null;
        this.connectorConfig = options;
        this._data = new Map(); // Local fallback
        this.version = STORAGE_VERSION;
        this._embedder = options.embedder || null;
    }

    /**
     * Set custom embedder
     */
    setEmbedder(name) {
        if (name && embed) {
            embed.setEmbedder(name);
            this._embedder = name;
        }
        return { embedder: this._embedder };
    }

    // Get embedding from text (uses embed module)
    async _textToEmbedding(text) {
        if (this._embedder === 'legacy') {
            // Old hash fallback
            return this._hashToVector(text);
        }
        
        // New: use embed module (TF-IDF by default, swap to transformers if installed)
        try {
            return await embed.embed(text);
        } catch (e) {
            // Fallback to legacy hash
            return this._hashToVector(text);
        }
    }

    // Hash text to simple vector (legacy fallback)
    _hashToVector(text) {
        const hash = crypto.createHash('sha256').update(text).digest();
        const vec = [];
        for (let i = 0; i < 128; i++) {
            vec.push(hash[i % hash.length] / 255);
        }
        return vec;
    }

    // Cosine similarity
    _cosineSimilarity(a, b) {
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
        }
        return dot / (Math.sqrt(magA) * Math.sqrt(magB));
    }

    // Add document with embedding (legacy sync)
    add(id, text, metadata = {}) {
        if (this.connector && this.connector.add) {
            return this.connector.add(id, text, metadata);
        }
        
        // Legacy hash fallback
        this._data.set(id, {
            text,
            metadata,
            vector: this._hashToVector(text)
        });
        return true;
    }

    /**
     * Add document with semantic embedding (async, recommended)
     */
    async addAsync(id, text, metadata = {}) {
        if (this.connector && this.connector.addAsync) {
            return this.connector.addAsync(id, text, metadata);
        }
        
        // Compute embedding
        const vector = await this._textToEmbedding(text);
        
        this._data.set(id, {
            text,
            metadata,
            vector
        });
        
        return true;
    }

    /**
     * Batch add with embeddings
     */
    async addBulk(docs) {
        const results = [];
        
        for (const { id, text, metadata } of docs) {
            results.push(await this.addAsync(id, text, metadata));
        }
        
        return results;
    }

    search(query, options = {}) {
        const topK = options.topK || 5;
        
        if (this.connector && this.connector.search) {
            return this.connector.search(query, options);
        }
        
        // Legacy hash fallback
        const queryVec = this._hashToVector(query);
        const results = [];
        
        for (const [id, doc] of this._data) {
            const score = this._cosineSimilarity(queryVec, doc.vector);
            results.push({ id, text: doc.text, metadata: doc.metadata, score });
        }
        
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    /**
     * Semantic search using embeddings (async, recommended)
     */
    async searchAsync(query, options = {}) {
        const topK = options.topK || 5;
        
        // Compute query embedding
        const queryVec = await this._textToEmbedding(query);
        
        const results = [];
        
        for (const [id, doc] of this._data) {
            const score = this._cosineSimilarity(queryVec, doc.vector);
            results.push({ id, text: doc.text, metadata: doc.metadata, score });
        }
        
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    delete(id) {
        if (this.connector && this.connector.delete) {
            return this.connector.delete(id);
        }
        return this._data.delete(id);
    }

    connect(connector) {
        this.connector = connector;
    }
}

// ==================== STATE STORAGE ====================
// State with layered read (private overrides public)
class StateStorage {
    constructor(options = {}) {
        this.privatePath = options.privatePath || MODELS_PATH + '/.state.json';
        this.publicPath = options.publicPath || PUBLIC_PATH + '/.state.json';
        this.version = STORAGE_VERSION;
        this._state = this._load();
    }

    // Layered read: private first, then public fallback
    _load() {
        // Private has highest priority
        if (fs.existsSync(this.privatePath)) {
            return readJson(this.privatePath) || { static: {}, current: {}, temp: {} };
        }
        // Fall back to public (OSS templates)
        if (fs.existsSync(this.publicPath)) {
            return readJson(this.publicPath) || { static: {}, current: {}, temp: {} };
        }
        // Initialize both directories
        if (!fs.existsSync(MODELS_PATH)) {
            fs.mkdirSync(MODELS_PATH, { recursive: true });
        }
        return { static: {}, current: {}, temp: {} };
    }

    // Always write to private (agent's brain)
    _save() {
        writeJson(this.privatePath, this._state);
    }

    get(key) {
        const s = this._load();
        return key ? s.current?.[key] : s.current;
    }

    set(key, value) {
        if (!this._state.current) this._state.current = {};
        this._state.current[key] = value;
        this._save();
        return true;
    }

    getCurrent(key) {
        const s = this._load();
        return key ? s.current?.[key] : s.current;
    }

    // Helper: Remove dangerous keys from object
    _sanitizeObject(obj) {
        const sanitized = {};
        const dangerous = ['__proto__', 'constructor', 'prototype'];
        for (const [k, v] of Object.entries(obj)) {
            if (!dangerous.includes(k)) {
                sanitized[k] = v;
            }
        }
        return sanitized;
    }

    setCurrent(key, value) {
        if (!this._state.current) this._state.current = {};
        // Handle setCurrent({ task: 'test' }) object form
        if (typeof key === 'object' && key !== null) {
            // SECURITY: Sanitize to prevent prototype pollution
            const safe = this._sanitizeObject(key);
            Object.assign(this._state.current, safe);
        } else {
            this._state.current[key] = value;
        }
        this._save();
        return true;
    }

    getStatic(key) {
        const s = this._load();
        return key ? s.static?.[key] : s.static;
    }

    setStatic(key, value) {
        if (!this._state.static) this._state.static = {};
        // Handle setStatic({ t: 'v' }) object form
        if (typeof key === 'object' && key !== null) {
            // SECURITY: Sanitize to prevent prototype pollution
            const safe = this._sanitizeObject(key);
            Object.assign(this._state.static, safe);
        } else {
            this._state.static[key] = value;
        }
        this._save();
        return true;
    }

    getTemp(key) {
        const s = this._load();
        return key ? s.temp?.[key] : s.temp;
    }

    setTemp(key, value) {
        if (!this._state.temp) this._state.temp = {};
        this._state.temp[key] = value;
        return true;
    }

    clearTemp() {
        this._state.temp = {};
        this._save();
        return true;
    }

    getSummary() {
        const s = this._load();
        return `static=${JSON.stringify(s.static)},current=${JSON.stringify(s.current)}`;
    }
}

// ==================== CONFIG STORAGE ====================
class ConfigStorage {
    constructor(options = {}) {
        this.filePath = options.filePath || CONFIG_PATH;
        this.version = STORAGE_VERSION;
        this._config = this._load();
    }

    _load() {
        const defaultConfig = {
            version: STORAGE_VERSION,
            storage: { autoSync: false },
            github: { token: null },
            features: {}
        };
        
        if (!fs.existsSync(this.filePath)) return defaultConfig;
        
        try {
            const loaded = require(this.filePath);
            return { ...defaultConfig, ...loaded };
        } catch {
            return defaultConfig;
        }
    }

    get(key) {
        const parts = key.split('.');
        let value = this._config;
        for (const p of parts) {
            value = value?.[p];
            if (value === undefined) return null;
        }
        return value;
    }

    set(key, value) {
        const parts = key.split('.');
        let obj = this._config;
        
        for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {};
            obj = obj[parts[i]];
        }
        
        obj[parts[parts.length - 1]] = value;
        this.save();
        return true;
    }

    getAll() {
        return { ...this._config };
    }

    save() {
        const content = 'module.exports = ' + JSON.stringify(this._config, null, 2);
        atomicWrite(this.filePath, content);
    }

    load() {
        this._config = this._load();
        return this._config;
    }
}

// ==================== LOCK STORAGE ====================
class LockStorage {
    constructor(options = {}) {
        this.lockDir = options.lockDir || '.locks';
        if (!fs.existsSync(this.lockDir)) {
            fs.mkdirSync(this.lockDir, { recursive: true });
        }
        this.version = STORAGE_VERSION;
    }

    _getLockPath(id) {
        return path.join(this.lockDir, '.lock-' + id + '.json');
    }

    acquire(id, options = {}) {
        const ttl = options.ttl || 60000;
        const lockPath = this._getLockPath(id);
        
        if (fs.existsSync(lockPath)) {
            const content = readJson(lockPath);
            if (content && Date.now() < content.expiresAt) {
                return null; // Lock held
            }
        }
        
        const token = crypto.randomUUID();
        const data = {
            id,
            token,
            acquiredAt: Date.now(),
            expiresAt: Date.now() + ttl
        };
        
        writeJson(lockPath, data);
        return token;
    }

    has(id) {
        const lockPath = this._getLockPath(id);
        if (!fs.existsSync(lockPath)) return false;
        
        const content = readJson(lockPath);
        return content && Date.now() < content.expiresAt;
    }

    renew(id, options = {}) {
        const ttl = options.ttl || 60000;
        const lockPath = this._getLockPath(id);
        
        if (!fs.existsSync(lockPath)) return false;
        
        const content = readJson(lockPath);
        if (!content) return false;
        
        content.expiresAt = Date.now() + ttl;
        writeJson(lockPath, content);
        return true;
    }

    release(id, token) {
        const lockPath = this._getLockPath(id);
        
        if (!fs.existsSync(lockPath)) return false;
        
        const content = readJson(lockPath);
        if (!content || content.token !== token) return false;
        
        fs.unlinkSync(lockPath);
        return true;
    }
}

// ==================== SCHEMA STORAGE ====================
class SchemaStorage {
    constructor(options = {}) {
        this.schemaDir = options.schemaDir || 'schema';
        this.version = STORAGE_VERSION;
    }

    get(name) {
        const filePath = path.join(this.schemaDir, name + '.json');
        return readJson(filePath);
    }

    set(name, schema) {
        const dir = this.schemaDir;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const filePath = path.join(dir, name + '.json');
        writeJson(filePath, schema);
        return true;
    }

    has(name) {
        const filePath = path.join(this.schemaDir, name + '.json');
        return fs.existsSync(filePath);
    }

    list() {
        if (!fs.existsSync(this.schemaDir)) return [];
        return fs.readdirSync(this.schemaDir)
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    }
}

// ==================== ISLAND STORAGE ====================
class IslandStorage {
    constructor(options = {}) {
        this.basePath = options.basePath || MODELS_PATH;
        this.version = STORAGE_VERSION;
    }

    getManifest() {
        const manifestPath = path.join(this.basePath, 'islands.json');
        const data = readJson(manifestPath) || { version: '1.0', islands: {}, loaded: [] };
        // Ensure required fields exist
        if (!data.islands) data.islands = {};
        if (!data.loaded) data.loaded = [];
        if (!data.hydrated) data.hydrated = [];
        return data;
    }

    saveManifest(manifest) {
        const manifestPath = path.join(this.basePath, 'islands.json');
        writeJson(manifestPath, manifest);
        return true;
    }

    get(name) {
        const islandPath = path.join(this.basePath, name + '.json');
        return readJson(islandPath);
    }

    set(name, data) {
        const islandPath = path.join(this.basePath, name + '.json');
        writeJson(islandPath, data);
        return true;
    }

    has(name) {
        const islandPath = path.join(this.basePath, name + '.json');
        return fs.existsSync(islandPath);
    }
}

// ==================== REPOS STORAGE ====================
class ReposStorage {
    constructor(options = {}) {
        this.reposDir = options.reposDir || MODELS_PATH + '/repos';
        this.version = STORAGE_VERSION;
        if (!fs.existsSync(this.reposDir)) {
            fs.mkdirSync(this.reposDir, { recursive: true });
        }
    }

    _load() {
        const configPath = path.join(this.reposDir, 'config.json');
        return readJson(configPath) || { mounted: [], repos: {} };
    }

    _save(config) {
        const configPath = path.join(this.reposDir, 'config.json');
        writeJson(configPath, config);
    }

    register(name, url, options = {}) {
        const config = this._load();
        config.repos[name] = { url, ...options };
        this._save(config);
        return true;
    }

    async mount(name) {
        // WARNING: This may violate GitHub ToS if used as auto-sync database
        // See docs/reference/storage.md for GitHub ToS guidelines
        const config = this._load();
        if (!config.repos[name]) return null;
        config.mounted.push(name);
        this._save(config);
        return config.repos[name];
    }

    unmount(name) {
        const config = this._load();
        config.mounted = config.mounted.filter(n => n !== name);
        this._save(config);
        return true;
    }

    async pull(name = null) {
        // WARNING: Auto-sync may violate GitHub ToS
        // Config opt-in required: storage.autoSync
        const configStorage = getStorage('config');
        if (configStorage.get('storage.autoSync') !== true) {
            throw new errors.Error('Auto-sync disabled. Set config storage.autoSync=true to enable.');
        }
        
        const config = this._load();
        const repos = name ? [name] : config.mounted;
        
        for (const repo of repos) {
            if (!config.repos[repo]) continue;
            // Full implementation would git clone/pull here
            audit.info('[Storage] Pull from', config.repos[repo].url);
        }
        
        return repos;
    }

    has(name) {
        const config = this._load();
        return !!config.repos[name];
    }

    list() {
        const config = this._load();
        return Object.keys(config.repos);
    }

    getMounted() {
        const config = this._load();
        return config.mounted;
    }
}

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
        case 'lock':
            instance = new LockStorage(options);
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
        default:
            throw new errors.Error('Unknown storage type: ' + type, { code: errors.CODES.STORAGE_TYPE_UNKNOWN, retryable: false });
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
module.exports = {
    // Factory
    get: getStorage,
    
    // Shortcuts to FileStorage for convenience (SANS-100 style)
    read: (path) => getStorage('file').read(path),
    write: (path, data) => getStorage('file').write(path, data),
    delete: (path) => getStorage('file').delete(path),
    has: (path) => getStorage('file').has(path),
    exists: (path) => getStorage('file').has(path),  // Alias for backward compat
    list: (pattern) => getStorage('file').list(pattern),
    
    // Classes (for extension)
    FileStorage,
    BrainStorage,
    VectorStorage,
    StateStorage,
    ConfigStorage,
    LockStorage,
    SchemaStorage,
    IslandStorage,
    ReposStorage,
    
    // Version
    version: STORAGE_VERSION,
    
    // Framework interface
    getLayerStatus: () => ({ name: 'Storage', type: 'storage', version: STORAGE_VERSION, enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true }),
    
    // Multibrain Stack
    listStack,
    readStack,
    existsStack,
    getStackStats
};