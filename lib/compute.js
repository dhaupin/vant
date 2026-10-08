const errors = require('./error');
/**
 * Compute (v0.8.6)
 * WITH EVENT EMISSIONS - compute execution emits globally
 * Polyglot FFI - talk to other languages from Vant
 *
 * Auto-discovers language connectors in /lib/connectors/
 * - python.js  → Python subprocess
 * - julia.js    → Julia subprocess
 * (rust.js is listed in the discovery allowlist but does NOT exist
 *  yet — adding it also means adding connectors/rust.js)
 * - etc.
 *
 * SIDECAR MODE (pass 166 — the hybrid polyglot bridge): JIT-heavy
 * languages pay their startup cost per SUBPROCESS eval (Julia: 2-30s
 * JIT per call). opts.mode routes around that:
 *   { mode: 'sidecar' }    — persistent localhost HTTP sidecar only
 *   { mode: 'auto' }       — sidecar, fall back to subprocess (default
 *                            for SidecarConnector)
 *   { mode: 'subprocess' } — legacy spawn-per-call
 * Same result shape either way ({ code, stdout, stderr, success }).
 * Shared runtime: lib/sidecar.js (used by adapters for parity).
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
 *   // JIT-heavy language, persistent sidecar (pays JIT once):
 *   const r = await compute.eval('println(2+2)', { lang: 'julia', mode: 'sidecar' });
 *
 *   // Check what's available
 *   const status = compute.status();
 *
 * SECURITY: Recursion guard to prevent compute loops
 */

const guard = require('./recursion');  // Unified recursion guard

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
    const langConnectors = ['python', 'julia', 'rust', 'node', 'ruby', 'go', 'php'];

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
            let connector = require(path.join(connectorsDir, file));
            // (pass 168) Two export shapes are legitimate here: a ready
            // singleton (python.js, julia.js, ...) and a named class export
            // (rust.js — also required by SidecarConnector's subprocess
            // fallback, which constructs it). Normalize to an instance.
            if (typeof connector !== 'function' && typeof connector.eval !== 'function') {
                const CtorName = connectorLang.charAt(0).toUpperCase() + connectorLang.slice(1) + 'Connector';
                if (typeof connector[CtorName] === 'function') {
                    connector = new connector[CtorName]();
                }
            }
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
// (pass 166) Sidecar connectors are created per (lang+mode) and REUSED so
// the spawned sidecar process survives across evals — that reuse is the
// entire point. stopSidecars() shuts them down.
const _sidecarConnectors = new Map();
function _getSidecarConnector(lang, options) {
    const key = lang + ':' + (options.mode || 'auto');
    if (!_sidecarConnectors.has(key)) {
        const { SidecarConnector } = require('./connectors/sidecar');
        _sidecarConnectors.set(key, new SidecarConnector({
            lang,
            mode: options.mode || 'auto',
            sidecar: options.sidecar || {}
        }));
    }
    return _sidecarConnectors.get(key);
}

/**
 * Stop all live sidecars spawned by this process (clean shutdown via
 * /stop + SIGTERM backstop). Call on vant shutdown.
 */
async function stopSidecars() {
    const stops = [];
    for (const connector of _sidecarConnectors.values()) {
        if (connector.stop) stops.push(connector.stop());
    }
    _sidecarConnectors.clear();
    await Promise.all(stops);
}

function _getConnector(lang) {
    if (!_connectors.has(lang)) {
        _discoverConnectors();
    }

    const connector = _connectors.get(lang);
    if (!connector) {
        throw new errors.VantError('No connector for language', { code: errors.CODES.VAF_INPUT_INVALID });
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
    // Recursion guard: prevent infinite invoke loops
    const depthCheck = guard.check('compute:invoke');
    if (!depthCheck.allowed) {
        throw new errors.VantError('Compute recursion exceeded', { code: errors.CODES.BRAIN_LOAD_FAIL });
    }

    try {
        _emit('compute:invoking', { func, lang, timestamp: Date.now() });

        const connector = _getConnector(lang);
        const result = await connector.invoke(func, args);

        _emit('compute:invoked', { func, lang, timestamp: Date.now() });

        return result;
    } finally {
        guard.release('compute:invoke');
    }
}

/**
 * Evaluate raw code in a foreign language
 *
 * @param {string} code - Code to evaluate
 * @param {object} options - Options like { lang, timeout }
 */
async function evaluate(code, options = {}) {
    // Recursion guard: prevent infinite eval loops
    const depthCheck = guard.check('compute:eval');
    if (!depthCheck.allowed) {
        throw new errors.VantError('Compute eval recursion exceeded', { code: errors.CODES.BRAIN_LOAD_FAIL });
    }

    const lang = options.lang || 'node';  // DEFAULT TO NODE since Vant runs on Node!
    const timeout = options.timeout || 30000;

    try {
        _emit('compute:eval:starting', { lang, timestamp: Date.now() });

        const connector = (options.mode && options.mode !== 'subprocess')
            ? _getSidecarConnector(lang, options)
            : _getConnector(lang);
        const result = await connector.eval(code, { timeout });

        _emit('compute:eval:complete', { lang, timestamp: Date.now() });

        return result;
    } finally {
        guard.release('compute:eval');
    }
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

    _emit('compute:run:starting', { scriptPath, lang, timestamp: Date.now() });

    const connector = _getConnector(lang);
    const result = await connector.run(scriptPath, args);

    _emit('compute:run:complete', { scriptPath, lang, timestamp: Date.now() });

    return result;
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
        version: require('./version'),
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
    evaluate,
    run,
    status,
    list,
    has,
    stopSidecars,

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
    },

    // Multibrain
    getBrainComputeConfig,
    setBrainComputeConfig,

    // Multibrain Stack
    getStackComputeConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainComputeConfigs = {};

function getBrainComputeConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainComputeConfigs[brainName] || { timeout: 30000 };
}

function setBrainComputeConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainComputeConfigs[brainName] = config;
    return true;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackComputeConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainComputeConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
