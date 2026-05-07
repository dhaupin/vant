/**
 * Vant Framework
 * 
 * Unified 6-layer framework: VAF → Sandbox → QoS → Security → API → Escrow
 * All running at same global scope
 * 
 * Usage:
 *   const framework = require('./framework');
 *   
 *   // Initialize
 *   await framework.init();
 *   
 *   // Execute operation (all layers applied)
 *   const result = await framework.execute(
 *     () => brain.get('learnings', 'lesson-1'),
 *     { type: 'read' }
 *   );
 *   
 *   // Get full status
 *   console.log(framework.getStatus());
 */

const vaf = require('./vaf');
const sandbox = require('./sandbox');
const qos = require('./protection');
const security = require('./security');

// Lazy load to avoid circular dependency
let _api = null;
let _escrow = null;
let _brain = null;
let _resolution = null;
let _mitigate = null;
let _sync = null;
let _auth = null;
let _search = null;
let _cache = null;
let _queue = null;
let _eventBus = null;
let _metrics = null;
let _auditLog = null;
let _healthCheck = null;
let _pipeline = null;
let _configFlag = null;
let _rateLimit = null;
let _session = null;

function getApi() {
    if (!_api) _api = require('./api');
    return _api;
}

function getEscrow() {
    if (!_escrow) _escrow = require('./escrow');
    return _escrow;
}

function getBrain() {
    if (!_brain) _brain = require('./brain-class');
    return _brain;
}

function getResolution() {
    if (!_resolution) _resolution = require('./resolution-class');
    return _resolution;
}

function getMitigate() {
    if (!_mitigate) _mitigate = require('./mitigate');
    return _mitigate;
}

function getSync() {
    if (!_sync) _sync = require('./sync-class');
    return _sync;
}

function getAuth() {
    if (!_auth) _auth = require('./auth');
    return _auth;
}

function getSearch() {
    if (!_search) _search = require('./search-class');
    return _search;
}

function getCache() {
    if (!_cache) _cache = require('./cache');
    return _cache;
}

function getQueue() {
    if (!_queue) _queue = require('./queue');
    return _queue;
}

function getEventBus() {
    if (!_eventBus) _eventBus = require('./event-bus');
    return _eventBus;
}

function getMetrics() {
    if (!_metrics) _metrics = require('./metrics-class');
    return _metrics;
}

function getAuditLog() {
    if (!_auditLog) _auditLog = require('./audit-log');
    return _auditLog;
}

function getHealthCheck() {
    if (!_healthCheck) _healthCheck = require('./health-check');
    return _healthCheck;
}

function getPipeline() {
    if (!_pipeline) _pipeline = require('./pipeline');
    return _pipeline;
}

function getConfigFlag() {
    if (!_configFlag) _configFlag = require('./config-flag');
    return _configFlag;
}

function getRateLimit() {
    if (!_rateLimit) _rateLimit = require('./rate-limit-class');
    return _rateLimit;
}

function getSession() {
    if (!_session) _session = require('./session');
    return _session;
}

/**
 * Vant Framework Class
 * Brings all 6 layers together at same global scope
 */
class Framework {
    /**
     * Create framework instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        this.options = options;
        
        // Track initialization
        this._initialized = false;
        this._startTime = null;
        
        // Layer instances (lazy loaded)
        this.vaf = vaf;
        this.sandbox = sandbox;
        this.qos = qos;
        this.security = security;
        // API and Escrow are lazy loaded
    }
    
    /**
     * Get API layer (lazy)
     */
    get api() {
        return getApi();
    }
    
    /**
     * Get Escrow layer (lazy)
     */
    get escrow() {
        return getEscrow();
    }
    
    /**
     * Get Brain layer (lazy)
     */
    get brain() {
        return getBrain();
    }
    
    /**
     * Get Resolution layer (lazy)
     */
    get resolution() {
        return getResolution();
    }
    
    /**
     * Get Mitigate layer (lazy)
     */
    get mitigate() {
        return getMitigate();
    }
    
    /**
     * Get Sync layer (lazy)
     */
    get sync() {
        return getSync();
    }
    
    /**
     * Get Auth layer (lazy)
     */
    get auth() {
        return getAuth();
    }
    
    /**
     * Get Search layer (lazy)
     */
    get search() {
        return getSearch();
    }
    
    /**
     * Get Cache layer (lazy)
     */
    get cache() {
        return getCache();
    }
    
    /**
     * Get Queue layer (lazy)
     */
    get queue() {
        return getQueue();
    }
    
    /**
     * Get EventBus layer (lazy)
     */
    get eventBus() {
        return getEventBus();
    }
    
    /**
     * Get Metrics layer (lazy)
     */
    get metrics() {
        return getMetrics();
    }
    
    /**
     * Get AuditLog layer (lazy)
     */
    get auditLog() {
        return getAuditLog();
    }
    
    /**
     * Get HealthCheck layer (lazy)
     */
    get healthCheck() {
        return getHealthCheck();
    }
    
    /**
     * Get Pipeline layer (lazy)
     */
    get pipeline() {
        return getPipeline();
    }
    
    /**
     * Get ConfigFlag layer (lazy)
     */
    get configFlag() {
        return getConfigFlag();
    }
    
    /**
     * Get RateLimit layer (lazy)
     */
    get rateLimit() {
        return getRateLimit();
    }
    
    /**
     * Get Session layer (lazy)
     */
    get session() {
        return getSession();
    }
    
    /**
     * Initialize all 12 layers
     */
    async init() {
        if (this._initialized) return this;
        
        console.log('[Framework] Initializing 6 layers...');
        
        // VAF layer (always first - input validation)
        console.log('[Framework] VAF: ' + (this.vaf.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // Sandbox layer
        console.log('[Framework] Sandbox: ' + (this.sandbox.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // QoS layer
        console.log('[Framework] QoS: ' + (this.qos.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // Security layer
        console.log('[Framework] Security: ' + (this.security.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // API layer
        console.log('[Framework] API: ' + (this.api.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // Escrow layer (placeholder)
        console.log('[Framework] Escrow: ' + (this.escrow.getLayerStatus().enabled ? 'OK' : 'PLACEHOLDER'));
        
        // Brain layer
        console.log('[Framework] Brain: ' + (this.brain.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // Resolution layer
        console.log('[Framework] Resolution: ' + (this.resolution.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // Mitigate layer (placeholder)
        const mitStatus = this.mitigate.getLayerStatus();
        console.log('[Framework] Mitigate: ' + (mitStatus.enabled ? 'OK' : 'PLACEHOLDER'));
        
        // Sync layer
        console.log('[Framework] Sync: ' + (this.sync.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // Auth layer (placeholder)
        const authStatus = this.auth.getLayerStatus();
        console.log('[Framework] Auth: ' + (authStatus.enabled ? 'OK' : 'PLACEHOLDER'));
        
        // Search layer
        console.log('[Framework] Search: ' + (this.search.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // Cache layer
        console.log('[Framework] Cache: ' + (this.cache.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // Queue layer
        console.log('[Framework] Queue: ' + (this.queue.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // EventBus layer
        console.log('[Framework] EventBus: ' + (this.eventBus.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // Metrics layer
        console.log('[Framework] Metrics: ' + (this.metrics.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // AuditLog layer
        console.log('[Framework] AuditLog: ' + (this.auditLog.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // HealthCheck layer
        console.log('[Framework] HealthCheck: ' + (this.healthCheck.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // Pipeline layer
        console.log('[Framework] Pipeline: ' + (this.pipeline.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // ConfigFlag layer
        console.log('[Framework] ConfigFlag: ' + (this.configFlag.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // RateLimit layer
        console.log('[Framework] RateLimit: ' + (this.rateLimit.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        // Session layer
        console.log('[Framework] Session: ' + (this.session.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
        this._initialized = true;
        this._startTime = Date.now();
        
        console.log('[Framework] Ready');
        
        return this;
    }
    
    /**
     * Execute operation through all 6 layers
     * @param {Function} operation - Operation to execute
     * @param {object} context - { type: 'read'|'write', ... }
     */
    async execute(operation, context = {}) {
        const type = context.type || 'execute';
        
        // Layer 1: VAF - validate input
        const vafResult = this.vaf.isOperationAllowed(type);
        if (!vafResult.allowed) {
            throw new Error(`VAF blocked: ${vafResult.reason}`);
        }
        
        // Layer 4: Security - check auth (before sandbox for efficiency)
        const secResult = this.security.isOperationAllowed(type, context);
        if (!secResult.allowed) {
            throw new Error(`Security blocked: ${secResult.reason}`);
        }
        
        // Layer 3: QoS - check rate limits (before execution)
        const qosResult = this.qos.isOperationAllowed(type);
        if (!qosResult.allowed) {
            throw new Error(`QoS blocked: ${qosResult.reason}`);
        }
        
        // Layer 5: API - pass through (hooks already handled by api.execute())
        // Framework just adds the check
        
        // Layer 6: Escrow - budget/holds check (placeholder)
        const escrowResult = this.escrow.isOperationAllowed(type, context);
        if (!escrowResult.allowed) {
            throw new Error(`Escrow blocked: ${escrowResult.reason}`);
        }
        
        // Layer 2: Sandbox - execute with isolation
        try {
            this.qos.incrementActive();
            
            if (type === 'read') {
                return await this.sandbox.read(operation);
            } else if (type === 'write') {
                return await this.sandbox.write(operation);
            } else {
                return await this.sandbox.execute(operation, {type});
            }
        } finally {
            this.qos.decrementActive();
        }
    }
    
    /**
     * Execute read operation (picking up)
     */
    async read(operation) {
        return this.execute(operation, {type: 'read'});
    }
    
    /**
     * Execute write operation (doing)
     */
    async write(operation) {
        return this.execute(operation, {type: 'write'});
    }
    
    /**
     * Get full framework status
     */
    getStatus() {
        return {
            initialized: this._initialized,
            uptime: this._startTime ? Date.now() - this._startTime : 0,
            layers: {
                vaf: this.vaf.getLayerStatus(),
                sandbox: this.sandbox.getLayerStatus(),
                qos: this.qos.getLayerStatus(),
                security: this.security.getLayerStatus(),
                api: this.api.getLayerStatus(),
                escrow: this.escrow.getLayerStatus(),
                brain: this.brain.getLayerStatus(),
                resolution: this.resolution.getLayerStatus(),
                mitigate: this.mitigate.getLayerStatus(),
                sync: this.sync.getLayerStatus(),
                auth: this.auth.getLayerStatus(),
                search: this.search.getLayerStatus(),
                cache: this.cache.getLayerStatus(),
                queue: this.queue.getLayerStatus(),
                eventBus: this.eventBus.getLayerStatus(),
                metrics: this.metrics.getLayerStatus(),
                auditLog: this.auditLog.getLayerStatus(),
                healthCheck: this.healthCheck.getLayerStatus(),
                pipeline: this.pipeline.getLayerStatus(),
                configFlag: this.configFlag.getLayerStatus(),
                rateLimit: this.rateLimit.getLayerStatus(),
                session: this.session.getLayerStatus()
            }
        };
    }
    
    /**
     * Check operation through all layers (dry run)
     */
    canExecute(type) {
        const results = {
            vaf: this.vaf.isOperationAllowed(type),
            sandbox: this.sandbox.isOperationAllowed(type),
            qos: this.qos.isOperationAllowed(type),
            security: this.security.isOperationAllowed(type),
            api: this.api.isOperationAllowed(type),
            escrow: this.escrow.isOperationAllowed(type),
            brain: this.brain.isOperationAllowed(type),
            resolution: this.resolution.isOperationAllowed(type),
            mitigate: this.mitigate.isOperationAllowed(type),
            sync: this.sync.isOperationAllowed(type),
            auth: this.auth.isOperationAllowed(type),
            search: this.search.isOperationAllowed(type),
            cache: this.cache.isOperationAllowed(type),
            queue: this.queue.isOperationAllowed(type),
            eventBus: this.eventBus.isOperationAllowed(type),
            metrics: this.metrics.isOperationAllowed(type),
            auditLog: this.auditLog.isOperationAllowed(type),
            healthCheck: this.healthCheck.isOperationAllowed(type),
            pipeline: this.pipeline.isOperationAllowed(type),
            configFlag: this.configFlag.isOperationAllowed(type),
            rateLimit: this.rateLimit.isOperationAllowed(type),
            session: this.session.isOperationAllowed(type)
        };
        
        const allAllowed = Object.values(results).every(r => r.allowed);
        
        return {
            allowed: allAllowed,
            results,
            blockedBy: Object.entries(results)
                .filter(([_, r]) => !r.allowed)
                .map(([layer, r]) => `${layer}: ${r.reason}`)
        };
    }
    
    /**
     * Reset framework state
     */
    reset() {
        vaf.reset();
        this.sandbox.reset();
        this.escrow.reset();
    }
}

/**
 * Default framework instance
 */
const defaultFramework = new Framework();

module.exports = {
    // Class for custom instances
    Framework,
    
    /**
     * Create framework instance
     */
    create(options = {}) {
        return new Framework(options);
    },
    
    /**
     * Initialize (async)
     */
    async init() {
        await defaultFramework.init();
        return defaultFramework;
    },
    
    /**
     * Execute operation
     */
    execute(operation, context) {
        return defaultFramework.execute(operation, context);
    },
    
    /**
     * Execute read
     */
    read(operation) {
        return defaultFramework.read(operation);
    },
    
    /**
     * Execute write
     */
    write(operation) {
        return defaultFramework.write(operation);
    },
    
    /**
     * Get status
     */
    getStatus() {
        return defaultFramework.getStatus();
    },
    
    /**
     * Can execute (dry run)
     */
    canExecute(type) {
        return defaultFramework.canExecute(type);
    },
    
    /**
     * Reset
     */
    reset() {
        defaultFramework.reset();
    },
    
    // Expose individual layers for direct access (lazy)
    vaf,
    sandbox,
    qos,
    security,
    get api() { return getApi(); },
    get escrow() { return getEscrow(); },
    get brain() { return getBrain(); },
    get resolution() { return getResolution(); },
    get mitigate() { return getMitigate(); },
    get sync() { return getSync(); },
    get auth() { return getAuth(); },
    get search() { return getSearch(); },
    get cache() { return getCache(); },
    get queue() { return getQueue(); },
    get eventBus() { return getEventBus(); },
    get metrics() { return getMetrics(); },
    get auditLog() { return getAuditLog(); },
    get healthCheck() { return getHealthCheck(); },
    get pipeline() { return getPipeline(); },
    get configFlag() { return getConfigFlag(); },
    get rateLimit() { return getRateLimit(); },
    get session() { return getSession(); }
};