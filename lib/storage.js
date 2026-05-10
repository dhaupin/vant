/**
 * Storage (v0.8.6)
 * Unified storage abstraction layer for Vant
 *
 * Design:
 * - Type-specific storage classes
 * - Connector pattern (like providers/)
 * - Atomic writes for safety
 * - Lazy loading
 * - Sandbox capability gating
 *
 * Usage:
 *   const Storage = require('./storage');
 *   const brain = Storage.get('brain');
 *   const content = brain.get('identity', 'lessons.md');
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Lazy load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

// ==================== CONSTANTS ====================
const STORAGE_VERSION = '0.8.6';
const MODELS_PATH = 'models/public';
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

    read(filePath) {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.basePath, filePath);
        if (!fs.existsSync(fullPath)) return null;
        return fs.readFileSync(fullPath, 'utf8');
    }

    write(filePath, content) {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.basePath, filePath);
        atomicWrite(fullPath, content);
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
        return path.join(dir, safeKey);
    }

    get(category, key = null) {
        if (!category) return null;
        
        // Check sandbox capability (canRead for read operations)
        const sb = _getSandbox();
        if (sb && typeof sb.can === 'function' && !sb.can('canRead')) {
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
        if (!fs.existsSync(filePath)) return null;
        return fs.readFileSync(filePath, 'utf8');
    }

    write(category, key, content) {
        if (!category || !key) return false;
        
        // Check sandbox capability (canWrite for write operations)
        const sb = _getSandbox();
        if (sb && typeof sb.can === 'function' && !sb.can('canWrite')) {
            return { error: 'Sandbox: capability not allowed - canWrite is false' };
        }
        
        const dir = path.join(this.basePath, category);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const filePath = this._getFilePath(category, key);
        atomicWrite(filePath, content);
        return true;
    }

    append(category, key, content) {
        const existing = this.get(category, key) || '';
        return this.write(category, key, existing + content);
    }

    has(category, key) {
        const filePath = this._getFilePath(category, key);
        return fs.existsSync(filePath);
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
    }

    // Hash text to simple vector (local fallback)
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

    add(id, text, metadata = {}) {
        if (this.connector && this.connector.add) {
            return this.connector.add(id, text, metadata);
        }
        
        // Local fallback
        this._data.set(id, {
            text,
            metadata,
            vector: this._hashToVector(text)
        });
        return true;
    }

    search(query, options = {}) {
        const topK = options.topK || 5;
        
        if (this.connector && this.connector.search) {
            return this.connector.search(query, options);
        }
        
        // Local fallback
        const queryVec = this._hashToVector(query);
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
// Note: State now stored in models/public/.state.json (was states/active/)
class StateStorage {
    constructor(options = {}) {
        this.filePath = options.filePath || MODELS_PATH + '/.state.json';
        this.version = STORAGE_VERSION;
        this._state = this._load();
    }

    _load() {
        if (!fs.existsSync(path.dirname(this.filePath))) {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        }
        return readJson(this.filePath) || {
            static: {},
            current: {},
            temp: {}
        };
    }

    _save() {
        writeJson(this.filePath, this._state);
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

    getStatic(key) {
        const s = this._load();
        return key ? s.static?.[key] : s.static;
    }

    setStatic(key, value) {
        if (!this._state.static) this._state.static = {};
        this._state.static[key] = value;
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
        return readJson(manifestPath) || { version: '1.0', islands: [], loaded: [] };
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
            throw new Error('Auto-sync disabled. Set config storage.autoSync=true to enable.');
        }
        
        const config = this._load();
        const repos = name ? [name] : config.mounted;
        
        for (const repo of repos) {
            if (!config.repos[repo]) continue;
            // Full implementation would git clone/pull here
            console.log('[Storage] Pull from', config.repos[repo].url);
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
            throw new Error(`Unknown storage type: ${type}`);
    }
    
    _instances[key] = instance;
    return instance;
}

// ==================== EXPORTS ====================
module.exports = {
    // Factory
    get: getStorage,
    
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
    getStatus: () => ({ enabled: true })
};