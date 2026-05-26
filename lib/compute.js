/**
 * Compute (v0.9.0)
 * Polyglot FFI - talk to other languages from Vant
 *
 * Auto-discovers language connectors in /lib/connectors/
 * - python.js  → Python subprocess
 * - julia.js    → Julia subprocess
 * - rust.js     → Rust compilation + run
 * - etc.
 *
 * Usage:
 *   const compute = require('./compute');
 *
 *   // Call a function in another language
 *   const result = await compute.invoke('numpy.linalg.eig', { matrix: [[1,2],[3,4]] }, 'python');
 *
 *   // Evaluate raw code
 *   const result = await compute.eval('print("hello from " + language)', { lang: 'python' });
 *
 *   // Check what's available
 *   const status = compute.status();
 */

const fs = require('fs');
const path = require('path');

// Lazy-loaded connectors
const _connectors = new Map();

/**
 * Auto-discover connectors from /lib/connectors/
 */
function _discoverConnectors() {
    const connectorsDir = path.join(__dirname, 'connectors');
    
    if (!_exists(connectorsDir)) {
        console.warn('[COMPUTE] No connectors dir:', connectorsDir);
        return;
    }
    
    const files = fs.readdirSync(connectorsDir).filter(f => f.endsWith('.js'));
    
    // Language connectors ONLY (not cloud providers)
    const langConnectors = ['python', 'julia', 'rust', 'node', 'ruby', 'go'];
    
    for (const file of files) {
        const name = file.replace('.js', '');
        
        // Skip non-language connectors
        if (name === 'index' || name === 'base') continue;
        
        // Check if it's a language connector
        const isLang = langConnectors.some(l => name.startsWith(l) && !['github', 'gitlab', 'bitbucket', 'gitea', 'pinecone'].includes(name));
        
        // Better filter: only exact matches or prefix from lang list
        const connectorLang = langConnectors.find(l => name === l || name.startsWith(l + '_'));
        
        if (!connectorLang) {
            continue;  // Skip cloud/provider connectors
        }
        
        try {
            const connector = require(path.join(connectorsDir, file));
            _connectors.set(connectorLang, connector);
            console.log('[COMPUTE] Loaded connector:', connectorLang);
        } catch (e) {
            console.warn('[COMPUTE] Failed to load', name + ':', e.message);
        }
    }
}

/**
 * Check if path exists
 */
function _exists(filePath) {
    try {
        return fs.existsSync(filePath);
    } catch (e) {
        return false;
    }
}

/**
 * Get a connector for a language (lazy load)
 */
function _getConnector(lang) {
    if (!_connectors.has(lang)) {
        _discoverConnectors();
    }
    
    const connector = _connectors.get(lang);
    if (!connector) {
        throw new Error(`No connector for language: ${lang}. Available: ${[..._connectors.keys()].join(', ')}`);
    }
    
    return connector;
}

/**
 * Invoke a function in a foreign language
 *
 * @param {string} func - Function name to call
 * @param {object} args - Arguments to pass
 * @param {string} lang - Language (python, julia, rust, etc.)
 */
async function invoke(func, args = {}, lang = 'python') {
    const connector = _getConnector(lang);
    return await connector.invoke(func, args);
}

/**
 * Evaluate raw code in a foreign language
 *
 * @param {string} code - Code to evaluate
 * @param {object} options - Options like { lang, timeout }
 */
async function eval(code, options = {}) {
    const lang = options.lang || 'node';  // DEFAULT TO NODE since Vant runs on Node!
    const timeout = options.timeout || 30000;
    
    const connector = _getConnector(lang);
    return await connector.eval(code, { timeout });
}

/**
 * Run a script file
 *
 * @param {string} scriptPath - Path to script
 * @param {object} options - Options like { lang, args }
 */
async function run(scriptPath, options = {}) {
    const lang = options.lang || _detectLang(scriptPath);
    const args = options.args || [];
    
    const connector = _getConnector(lang);
    return await connector.run(scriptPath, args);
}

/**
 * Detect language from file extension
 */
function _detectLang(filePath) {
    const ext = path.extname(filePath);
    const langMap = {
        '.py': 'python',
        '.jl': 'julia',
        '.rs': 'rust',
        '.js': 'node'
    };
    return langMap[ext] || 'python';
}

/**
 * Get status of all connectors
 */
function status() {
    const available = [..._connectors.keys()];
    const connectors = {};
    
    for (const lang of available) {
        try {
            const conn = _connectors.get(lang);
            connectors[lang] = {
                loaded: true,
                version: conn.version || '0.0.0',
                methods: conn.methods || Object.keys(conn).filter(k => typeof conn[k] === 'function')
            };
        } catch (e) {
            connectors[lang] = { loaded: false, error: e.message };
        }
    }
    
    return {
        name: 'Compute',
        type: 'polyglot-ffi',
        version: '0.9.0',
        available,
        connectors
    };
}

/**
 * List available languages
 */
function list() {
    return [..._connectors.keys()];
}

/**
 * Check if a language is available
 */
function has(lang) {
    if (!_connectors.has(lang)) {
        _discoverConnectors();
    }
    return _connectors.has(lang);
}

// Auto-discovery on first use
_discoverConnectors();

// ==================== EXPORTS ====================

module.exports = {
    // Main APIs
    invoke,
    eval,
    run,
    status,
    list,
    has,
    
    // Shortcuts
    python: (...args) => invoke(...args, 'python'),
    julia: (...args) => invoke(...args, 'julia'),
    rust: (...args) => invoke(...args, 'rust'),
    
    // Class for extension via Storage
    Compute: class {
        constructor() {
            this._startTime = Date.now();
        }
        getLayerStatus() {
            return status();
        }
        isOperationAllowed() {
            return { allowed: true, layer: 'Compute' };
        }
        getStatus() {
            return { enabled: true, languages: list() };
        }
    }
};