/**
 * Vant Framework (v0.8.6)
 * AI-first agent framework
 * 
 * Usage:
 *   const framework = require('./framework');
 *   await framework.init();
 *   const result = await framework.think('what am I?');
 */

const runtime = require('./vant');
const vaf = require('./vaf');
const qos = require('./qos');
const escrow = require('./escrow');
const network = require('./network');

// Framework-wide rate limiter (1000 ops/minute)
const _rateLimit = new qos.RateLimiter({ windowMs: 60000, maxPerMinute: 1000 });

// Core functions
const init = runtime.init;
const think = runtime.think;
const act = runtime.act;
const getState = runtime.getState;

/**
 * Execute with VAF + QoS + Escrow validation
 */
async function execute(operation, options = {}) {
    const { type = 'execute', validation = {} } = options;
    
    // VAF validation
    if (validation.schema) {
        vaf.check(operation, validation.schema);
    }
    
    // QoS rate limiting (per operation type)
    const opKey = operation?.type || operation || 'default';
    if (!_rateLimit.check(opKey)) {
        throw new Error('Rate limit exceeded for: ' + opKey);
    }
    
    // Escrow quota check
    const quota = escrow.checkQuota(opKey, 1);
    if (!quota.allowed) {
        throw new Error('Escrow quota exceeded for: ' + opKey);
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
    // Core
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
    
    // Re-export all systems from Vant
    runtime,
    brain: runtime.brain,
    search: runtime.search,
    islands: runtime.islands,
    config: runtime.config,
    memoize: runtime.memoize,
    lock: runtime.lock,
    audit: runtime.audit,
    compression: runtime.compression,
    vectorStore: runtime.vectorStore,
    cron: runtime.cron,
    conversation: runtime.conversation,
    agents: runtime.agents,
    ipc: runtime.ipc,
    encrypt: runtime.encrypt,
    stego: runtime.stego,
    qos: runtime.qos,
    event: runtime.event,
    network: runtime.network,
    
    // Also export direct Vant class
    Vant: runtime.Vant,
    
    Framework: class {
        constructor(options = {}) {
            this._runtime = new runtime.Vant(options);
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
