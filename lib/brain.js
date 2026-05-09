/**
 * Brain Loader
 * Loads and manages VANT brain with category folders
 * 
 * Structure:
 *   models/v0.5.0/
 *     identity.yaml    - Core identity
 *     learnings/       - Lessons and learnings
 *     memories/        - Long-term memories
 *     decisions/       - Key decisions
 *     todos/           - Pending tasks
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml'); // You'll need: npm install yaml
const vaf = require("./vaf");
const lock = require('./lock');
const errors = require('./errors');

const MODELS_PATH = path.join(__dirname, '..', 'models');

let currentBrain = {
    identity: null,
    learnings: {},
    memories: {},
    decisions: {},
    todos: {}
};
let currentVersion = null;

/**
 * Load brain from version folder
 * @param {string} version - Version to load (default: latest)
 */

/**
 * Brain Class
 * Provides class interface for brain operations with framework hooks
 */
class Brain {
    /**
     * Create Brain instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        this.options = {
            path: options.path || null,
            autoLoad: options.autoLoad !== false,
            version: options.version || 'v0.5.0'
        };
        
        // State
        this._loaded = false;
        this._startTime = Date.now();
    }
    
    /**
     * Load brain
     */
    async load() {
        load();
        this._loaded = true;
    }
    
    /**
     * Get identity
     */
    getIdentity() {
        return getIdentity();
    }
    
    /**
     * Get from brain
     */
    get(category, key) {
        return get(category, key);
    }
    
    /**
     * Write to brain
     */
    async write(category, key, content) {
        return write(category, key, content);
    }
    
    /**
     * Append to brain
     */
    async append(category, key, content) {
        return append(category, key, content);
    }
    
    /**
     * Has entry
     */
    has(category, key) {
        return has(category, key);
    }
    
    /**
     * Get all entries in category
     */
    getAll(category) {
        return getAll(category);
    }
    
    /**
     * Acquire brain lock
     */
    async acquireBrainLock(timeout) {
        return await acquireBrainLock(timeout);
    }
    
    /**
     * Release brain lock
     */
    async releaseBrainLock(token) {
        return await releaseBrainLock(token);
    }
    
    /**
     * Get brain lock status
     */
    getLockStatus() {
        return getLockStatus();
    }
    
    /**
     * Execute with lock held
     */
    async withLock(fn, timeout) {
        return await withLock(fn, timeout);
    }
    
    /**
     * Get version
     */
    getVersion() {
        return getVersion();
    }
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'Brain',
            type: 'storage',
            enabled: true,
            config: {
                path: this.options.path,
                autoLoad: this.options.autoLoad,
                version: this.options.version
            },
            state: {
                loaded: this._loaded,
                uptime: Date.now() - this._startTime
            }
        };
    }
    
    /**
     * Check if operation allowed
     */
    isOperationAllowed(operationType, context = {}) {
        if (!this._loaded) {
            return {allowed: false, reason: 'not_loaded', layer: 'Brain'};
        }
        
        if (operationType === 'write' && context.requireLock) {
            return {allowed: true, reason: 'lock_may_be_required', layer: 'Brain'};
        }
        
        return {allowed: true, layer: 'Brain'};
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            loaded: this._loaded,
            version: getVersion()
        };
    }
}

/**
 * Default Brain instance
 */
const defaultBrain = new Brain();

function load(version = 'latest') {
    if (version === 'latest') {
        const versions = fs.readdirSync(MODELS_PATH).filter(d => 
            fs.statSync(path.join(MODELS_PATH, d)).isDirectory() && d.startsWith('v')
        );
        version = versions.sort().pop();
    }
    
    const brainPath = path.join(MODELS_PATH, version);
    if (!fs.existsSync(brainPath)) {
        throw new Error(`Brain not found: ${version}`);
    }
    
    // Reset brain
    currentBrain = {
        identity: null,
        learnings: {},
        memories: {},
        decisions: {},
        todos: {}
    };
    
    // Load identity.yaml
    const identityPath = path.join(brainPath, 'identity.yaml');
    if (fs.existsSync(identityPath)) {
        try {
            const yamlContent = fs.readFileSync(identityPath, 'utf8');
            // Handle multiple documents - get first
            const docs = yaml.parseAllDocuments(yamlContent);
            if (docs.length > 0) {
                currentBrain.identity = docs[0].toJSON();
            }
        } catch (e) {
            console.warn(`[Brain] Could not parse identity.yaml: ${e.message}`);
            // Try as plain text
            currentBrain.identity = { raw: fs.readFileSync(identityPath, 'utf8') };
        }
    }
    
    // Load category folders
    const categories = ['learnings', 'memories', 'decisions', 'todos'];
    
    // Supported file extensions
    const supportedExts = ['.md', '.txt', '.json', '.yaml', '.yml'];
    
    categories.forEach(cat => {
        const catPath = path.join(brainPath, cat);
        if (fs.existsSync(catPath)) {
            const files = fs.readdirSync(catPath).filter(f => {
                const ext = path.extname(f).toLowerCase();
                return supportedExts.includes(ext);
            });
            files.forEach(file => {
                const filePath = path.join(catPath, file);
                const ext = path.extname(file).toLowerCase();
                const key = path.basename(file, ext);
                let content = fs.readFileSync(filePath, 'utf8');
                
                // Parse JSON/YAML if needed, store as raw string
                if (ext === '.json') {
                    try {
                        content = JSON.stringify(JSON.parse(content), null, 2);
                    } catch (e) {
                        console.warn(`[Brain] Could not parse ${cat}/${file}: ${e.message}`);
                    }
                } else if (ext === '.yaml' || ext === '.yml') {
                    try {
                        // yaml is already required at top of file
                        const doc = yaml.parse(content);
                        content = doc ? JSON.stringify(doc, null, 2) : content;
                    } catch (e) {
                        console.warn(`[Brain] Could not parse ${cat}/${file}: ${e.message}`);
                    }
                }
                
                currentBrain[cat][key] = content;
            });
        }
    });
    
    currentVersion = version;
    console.log(`[Brain] Loaded ${version}:`);
    console.log(`  - identity: ${currentBrain.identity ? 'yes' : 'no'}`);
    console.log(`  - learnings: ${Object.keys(currentBrain.learnings).length} files`);
    console.log(`  - memories: ${Object.keys(currentBrain.memories).length} files`);
    console.log(`  - decisions: ${Object.keys(currentBrain.decisions).length} files`);
    console.log(`  - todos: ${Object.keys(currentBrain.todos).length} files`);
    
    return { version, brain: currentBrain };
}

/**
 * Get identity
 */
function getIdentity() {
    return currentBrain.identity;
}

/**
 * Get category content
 * @param {string} category - learnings, memories, decisions, todos
 * @param {string} key - Specific file key
 */
function get(category, key = null) {
    if (!currentBrain[category]) return null;
    
    if (key) {
        return currentBrain[category][key] || null;
    }
    
    return { ...currentBrain[category] };
}

/**
 * Get all brain content
 */
function getAll() {
    return { ...currentBrain };
}

/**
 * Get current version
 */
function getVersion() {
    return currentVersion;
}

/**
 * Write to brain category
 * @param {string} category - learnings, memories, decisions, todos
 * @param {string} key - File key (without extension)
 * @param {string} content - Content to write
 * @param {string} format - Optional: 'md', 'txt', 'json', 'yaml' (default: 'md')
 */
function write(category, key, content, format = 'md') {
    vaf.check(category, {type: 'string', name: 'category', maxLength: 50, pattern: /^[a-z_]+$/});
    vaf.check(key, {type: 'string', name: 'key', maxLength: 100});
    // Allow newlines/special chars in memory content (learnings, memories, etc)
    vaf.check(content, {type: 'string', name: 'content', maxLength: 50000, allowContent: true, category});
    if (!currentBrain[category]) {
        throw new Error(`Invalid category: ${category}`);
    }
    
    // Validate format
    const validFormats = ['md', 'txt', 'json', 'yaml', 'yml'];
    if (!validFormats.includes(format)) {
        throw new Error(`Invalid format: ${format}. Use: ${validFormats.join(', ')}`);
    }
    
    // Ensure directory exists
    const version = currentVersion || 'v0.5.0';
    const catPath = path.join(MODELS_PATH, version, category);
    if (!fs.existsSync(catPath)) {
        fs.mkdirSync(catPath, { recursive: true });
    }
    
    // Handle JSON/YAML serialization
    let fileContent = content;
    if (format === 'json') {
        try {
            fileContent = typeof content === 'string' ? JSON.stringify(JSON.parse(content), null, 2) : JSON.stringify(content, null, 2);
        } catch (e) {
            throw new Error(`Invalid JSON: ${e.message}`);
        }
    } else if (format === 'yaml' || format === 'yml') {
        // Keep as-is or could add YAML stringify
        fileContent = content;
    }
    
    // SECURITY: Validate key (filename) is safe - allow unicode for non-English contexts
    // Block only path-unsafe chars: / \ : * ? " < > | and control chars
    // Security: Test for control chars outside regex
    const containsControl = key.split('').some(c => c.charCodeAt(0) <= 31);
    const isPathSafe = /^[^\/\\:*?"<>|]+$/.test(key);
    if (!isPathSafe || containsControl) {
        throw new Error('Invalid key - path-unsafe characters not allowed');
    }
// Write file
    const ext = format === 'yml' ? 'yaml' : format;
    const filePath = path.join(catPath, `${key}.${ext}`);
    fs.writeFileSync(filePath, fileContent);
    
    // Update memory
    currentBrain[category][key] = fileContent;
    console.log(`[Brain] Wrote ${category}/${key}.${ext}`);
}

/**
 * Append to existing file or create new
 * @param {string} category - learnings, memories, decisions, todos
 * @param {string} key - File key
 * @param {string} content - Content to append
 */
function append(category, key, content) {
    const existing = get(category, key);
    const newContent = existing ? `${existing}\n\n---\n\n${content}` : content;
    write(category, key, newContent);
}

/**
 * Has key in category
 */
function has(category, key) {
    return currentBrain[category] && !!currentBrain[category][key];
}

// Auto-load latest on init
try {
    load('latest');
} catch (e) {
    console.log('[Brain] No brain loaded yet');
}

/**
 * Convert brain to serializable JSON object
 * @returns {object} Brain data as object
 */
function toJSON() {
    return {
        version: currentVersion,
        identity: currentBrain.identity,
        learnings: currentBrain.learnings,
        memories: currentBrain.memories,
        decisions: currentBrain.decisions,
        todos: currentBrain.todos,
        timestamp: new Date().toISOString()
    };
}

/**
 * Deserialize brain from JSON object
 * @param {object} json - Brain data object
 * @param {string} version - Version identifier
 */
function fromJSON(json, version = 'v0.5.0') {
    if (!json || typeof json !== 'object') {
        throw new Error('Invalid brain JSON');
    }
    
    // Reset brain
    currentBrain = {
        identity: json.identity || null,
        learnings: json.learnings || {},
        memories: json.memories || {},
        decisions: json.decisions || {},
        todos: json.todos || {}
    };
    
    currentVersion = version || json.version || 'v0.5.0';
    console.log(`[Brain] Loaded from JSON, version: ${currentVersion}`);
    
    return { version: currentVersion, brain: currentBrain };
}

/**
 * Compress brain using zlib
 * @param {boolean} raw - Return as Buffer (not base64)
 * @returns {string|Buffer} Compressed brain
 */
function compress(raw = false) {
    const json = toJSON();
    const jsonStr = JSON.stringify(json);
    const zlib = require('zlib');
    
    const compressed = zlib.deflateSync(jsonStr);
    
    if (raw) {
        return compressed;
    }
    return compressed.toString('base64');
}

/**
 * Decompress brain from compressed data
 * @param {string|Buffer} data - Compressed brain data
 * @returns {object} Decompressed brain object
 */
function decompress(data) {
    const zlib = require('zlib');
    
    let input = data;
    if (typeof data === 'string') {
        input = Buffer.from(data, 'base64');
    }
    
    const decompressed = zlib.inflateSync(input);
    const json = JSON.parse(decompressed.toString('utf8'));
    
    return json;
}

/**
 * Embed configuration into brain metadata
 * @param {object} config - Config to embed (GITHUB_REPO, provider, etc)
 */
function embedConfig(config) {
    // Add config to identity for stego boot
    const identity = currentBrain.identity || {};
    if (!identity._embeddedConfig) {
        identity._embeddedConfig = {};
    }
    
    // Only embed safe config keys (no tokens!)
    const safeKeys = ['GITHUB_REPO', 'GITHUB_BRANCH', 'MODEL_PATH', 'STATE_PATH'];
    for (const key of safeKeys) {
        if (config[key]) {
            identity._embeddedConfig[key] = config[key];
        }
    }
    
    currentBrain.identity = identity;
    console.log('[Brain] Config embedded in brain');
}

/**
 * Extract embedded configuration
 * @returns {object|null} Embedded config or null
 */
function extractEmbeddedConfig() {
    if (!currentBrain.identity) return null;
    
    const identity = currentBrain.identity;
    return identity._embeddedConfig || null;
}

/**
 * Lock Configuration for Brain
 */
const LOCK_NAME = 'brain-write';

/**
 * Acquire brain lock for write operations
 * @param {number} timeout - Optional timeout in ms
 * @returns {Promise<string|null>} - Token if acquired
 */
async function acquireBrainLock(timeout = lock.DEFAULT_TIMEOUT_MS) {
    try {
        const token = await lock.acquire(LOCK_NAME, timeout);
        if (token) {
            console.log('[Brain] Lock acquired for write');
        }
        return token;
    } catch (e) {
        console.warn('[Brain] Lock acquire failed:', e.message);
        return null;
    }
}

/**
 * Release brain lock
 * @param {string} token - Token from acquireBrainLock
 * @returns {Promise<object>} Release result
 */
async function releaseBrainLock(token = null) {
    try {
        const result = await lock.release(LOCK_NAME, token);
        if (result.success) {
            console.log('[Brain] Lock released');
        }
        return result;
    } catch (e) {
        console.warn('[Brain] Lock release failed:', e.message);
        return { success: false, message: e.message };
    }
}

/**
 * Get brain lock status
 * @returns {object|null} Lock status
 */
function getLockStatus() {
    return lock.status();
}

/**
 * Execute function with brain lock held
 * @param {Function} fn - Async function to execute
 * @param {number} timeout - Lock timeout in ms
 * @returns {Promise<any>} Result of fn
 */
async function withLock(fn, timeout = lock.DEFAULT_TIMEOUT_MS) {
    const token = await acquireBrainLock(timeout);
    if (!token) {
        throw new errors.VantError('Could not acquire brain lock', {
            code: errors.CODES.LOCK_FAILED,
            retryable: true
        });
    }
    
    try {
        return await fn();
    } finally {
        await releaseBrainLock(token);
    }
}

module.exports = {
    // Class
    Brain,
    
    /**
     * Create Brain instance
     */
    create(options = {}) {
        return new Brain(options);
    },
    
    // Module functions
    load,
    getIdentity,
    get,
    getAll,
    getVersion,
    write,
    append,
    has,
    version: getVersion,
    // Serialization
    toJSON,
    fromJSON,
    compress,
    decompress,
    // Config embedding
    embedConfig,
    extractEmbeddedConfig,
    // Locking
    acquireBrainLock,
    releaseBrainLock,
    getLockStatus,
    withLock,
    
    // Framework hooks (delegate to default instance)
    getLayerStatus() {
        return defaultBrain.getLayerStatus();
    },
    
    isOperationAllowed(operationType, context) {
        return defaultBrain.isOperationAllowed(operationType, context);
    },
    
    getStatus() {
        return defaultBrain.getStatus();
    }
};