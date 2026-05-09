/**
 * Brain (v0.8.6)
 * AI-first brain + islands unified system
 * 
 * Main entry: queryBrain → getBrain → ready for agent
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');
const search = require('./search');

const MODELS_PATH = path.join(__dirname, '..', 'models');

// Lazy-loaded
let _islands = null;
let _lock = null;
let _errors = null;

function getIslands() {
    if (!_islands) _islands = require('./islands');
    return _islands;
}

function getLock() {
    if (!_lock) _lock = require('./lock');
    return _lock;
}

function getErrors() {
    if (!_errors) _errors = require('./errors');
    return _errors;
}

// ==================== CORE FUNCTIONS ====================

const BRAIN_VERSION = 'v0.8.6';

/**
 * Get identity - core "who am I"
 * @returns {Object|null} Identity object
 */
function getIdentity() {
    const idPath = path.join(MODELS_PATH, 'public', 'identity.md');
    if (!fs.existsSync(idPath)) return null;
    const content = fs.readFileSync(idPath, 'utf8');
    return {
        name: extractMeta(content, 'name') || 'Vant',
        role: extractMeta(content, 'role') || 'AI Agent',
        version: BRAIN_VERSION,
        content
    };
}

/**
 * Extract YAML frontmatter
 */
function extractMeta(content, key) {
    const match = content.match(new RegExp('^' + key + ':\\s*(.+)$', 'm'));
    return match ? match[1].trim() : null;
}

/**
 * Get brain contents by category
 * @param {string} category - identity|learnings|memories|decisions|todos
 * @param {string} key - Optional specific key
 * @returns {Object|Array} Brain data
 */
function getBrain(category, key = null) {
    vaf.check(category, { type: 'string', enum: ['identity', 'learnings', 'memories', 'decisions', 'todos'] });
    
    const catPath = path.join(MODELS_PATH, 'public');
    if (!fs.existsSync(catPath)) return null;
    
    if (key) {
        const keyPath = path.join(catPath, key + '.md');
        if (!fs.existsSync(keyPath)) return null;
        return { key, content: fs.readFileSync(keyPath, 'utf8') };
    }
    
    // Load all files in category
    const files = fs.readdirSync(catPath).filter(f => f.endsWith('.md'));
    const results = {};
    for (const file of files) {
        const key = file.replace('.md', '');
        results[key] = fs.readFileSync(path.join(catPath, file), 'utf8');
    }
    return results;
}

/**
 * Get specific brain file
 * @param {string} key - File key (e.g., 'identity', 'lessons')
 * @returns {Object|null} {key, content, date}
 */
async function get(key) {
    vaf.check(key, { type: 'string', maxLength: 50 });
    
    const filePath = path.join(MODELS_PATH, 'public', key + '.md');
    if (!fs.existsSync(filePath)) return null;
    
    const stats = fs.statSync(filePath);
    return {
        key,
        content: fs.readFileSync(filePath, 'utf8'),
        date: stats.mtime.toISOString()
    };
}

/**
 * Write brain content
 * @param {string} key - File key
 * @param {string} content - Content to write
 * @returns {boolean} Success
 */
function write(key, content) {
    vaf.check(key, { type: 'string', maxLength: 50 });
    vaf.check(content, { type: 'string', maxLength: 1024 * 1024 });
    
    const filePath = path.join(MODELS_PATH, 'public', key + '.md');
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
}

/**
 * Append to brain file
 * @param {string} key - File key
 * @param {string} content - Content to append
 * @returns {boolean} Success
 */
function append(key, content) {
    const existing = get(key);
    const existingContent = existing ? existing.content : '';
    const separator = existingContent && !existingContent.endsWith('\n') ? '\n\n' : '';
    return write(key, existingContent + separator + content);
}

/**
 * Check if brain file exists
 * @param {string} key - File key
 * @returns {boolean} Exists
 */
function has(key) {
    const filePath = path.join(MODELS_PATH, 'public', key + '.md');
    return fs.existsSync(filePath);
}

/**
 * Query brain using search pipeline
 * @param {string} query - Search query
 * @param {Object} opts - {topK, maxTokens}
 * @returns {Array} Ranked memories
 */
async function queryBrain(query, opts = {}) {
    return search.queryBrain(query, opts);
}

/**
 * Get all brain files as array
 * @returns {Array} [{key, content, date}]
 */
async function getAll() {
    const brainPath = path.join(MODELS_PATH, 'public');
    if (!fs.existsSync(brainPath)) return [];
    
    const files = fs.readdirSync(brainPath).filter(f => f.endsWith('.md'));
    const results = [];
    
    for (const file of files) {
        const key = file.replace('.md', '');
        const filePath = path.join(brainPath, file);
        const stats = fs.statSync(filePath);
        results.push({
            key,
            content: fs.readFileSync(filePath, 'utf8'),
            date: stats.mtime.toISOString()
        });
    }
    
    return results;
}

/**
 * Compress brain to bundle
 * @returns {Object} Compressed brain
 */
function compress() {
    const data = getAll();
    return {
        version: BRAIN_VERSION,
        timestamp: new Date().toISOString(),
        files: data,
        count: data.length
    };
}

/**
 * Decompress brain bundle
 * @param {Object} data - Compressed bundle
 * @returns {number} Files written
 */
function decompress(data) {
    if (!data || !data.files) return 0;
    let count = 0;
    for (const file of data.files) {
        if (file.key && file.content) {
            write(file.key, file.content);
            count++;
        }
    }
    return count;
}

/**
 * Get brain version
 * @returns {string} Version string
 */
function getVersion() {
    return BRAIN_VERSION;
}

/**
 * Get lock status
 */
function getLockStatus() {
    return getLock().getStatus();
}

/**
 * Summary for agents
 */
function getSummary() {
    return {
        name: 'Brain',
        type: 'brain',
        version: BRAIN_VERSION,
        enabled: true,
        functions: ['get', 'write', 'append', 'has', 'getBrain', 'queryBrain', 'compress', 'decompress'],
        exports: ['getIdentity', 'get', 'write', 'append', 'has', 'getBrain', 'queryBrain', 'compress', 'decompress', 'getVersion']
    };
}

// ==================== EXPORTS ====================
module.exports = {
    Brain: class {
        constructor() {
            this.version = BRAIN_VERSION;
        }
        getStatus() {
            return { enabled: true, version: BRAIN_VERSION };
        }
        isOperationAllowed() {
            return { allowed: true };
        }
    },
    
    // Core functions
    getIdentity,
    get,
    write,
    append,
    has,
    getBrain,
    queryBrain,
    getAll,
    compress,
    decompress,
    getVersion,
    getLockStatus,
    
    // Framework hooks
    getSummary,
    getLayerStatus: () => ({ name: 'Brain', type: 'brain', version: BRAIN_VERSION, enabled: true }),
    isOperationAllowed: () => ({ allowed: true, layer: 'Brain' }),
    getStatus: () => ({ enabled: true })
};
