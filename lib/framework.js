/**
 * Vant Framework (v0.8.6)
 * AI-first agent framework
 * 
 * Usage:
 *   const framework = require('./framework');
 *   await framework.init();
 *   const result = await framework.think('what am I?');
 */

const runtime = require('./runtime');
const vaf = require('./vaf');

// Core functions
const init = runtime.init;
const think = runtime.think;
const act = runtime.act;
const getState = runtime.getState;

/**
 * Execute with VAF validation
 */
async function execute(operation, options = {}) {
    const { type = 'execute', validation = {} } = options;
    
    if (validation.schema) {
        vaf.check(operation, validation.schema);
    }
    
    return runtime.act(operation, options);
}

/**
 * Query brain for context
 */
async function query(query, options = {}) {
    return runtime.think(query, options);
}

/**
 * Load brain file
 */
async function loadBrain(key) {
    return runtime.brain().get(key);
}

/**
 * Save to brain
 */
async function saveBrain(key, content) {
    return runtime.brain().write(key, content);
}

/**
 * App status
 */
function appStatus() {
    return {
        ...runtime.getStatus(),
        framework: '0.8.6',
        enabled: true
    };
}

/**
 * Get layer status
 */
function getLayerStatus() {
    return { name: 'Framework', type: 'framework', version: '0.8.6', enabled: true };
}

/**
 * Check operation allowed
 */
function isOperationAllowed(operation) {
    return { allowed: true, layer: 'Framework' };
}

module.exports = {
    init,
    think,
    act,
    execute,
    query,
    loadBrain,
    saveBrain,
    getState,
    appStatus,
    getLayerStatus,
    isOperationAllowed,
    getStatus: () => ({ enabled: true }),
    
    runtime,
    brain: runtime.brain,
    search: runtime.search,
    islands: runtime.islands,
    config: runtime.config,
    memoize: runtime.memoize,
    lock: runtime.lock,
    audit: runtime.audit,
    
    Framework: class {
        constructor(options = {}) {
            this._runtime = new runtime.Runtime(options);
        }
        async init() {
            return this._runtime.init();
        }
        async think(query, opts) {
            return this._runtime.think(query, opts);
        }
        getStatus() {
            return appStatus();
        }
    }
};
