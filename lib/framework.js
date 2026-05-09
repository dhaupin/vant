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

let _qos = null;
let _qosInstance = null;
let _session = null;
let _eventEmitter = null;
let _serializer = null;
let _storage = null;
let _websocket = null;
let _cronParser = null;
let _uuid = null;
let _memoize = null;
let _debouncer = null;
let _throttler = null;
let _retry = null;
let _circuitBreaker = null;
let _bulkhead = null;
let _transformer = null;
let _hash = null;
let _timing = null;
let _buffer = null;
let _validator = null;
let _lru = null;
let _pool = null;
let _router = null;
let _request = null;
let _response = null;
let _context = null;
let _bodyParser = null;
let _cors = null;
let _errorHandler = null;
let _helmet = null;
let _static = null;
let _cacheControl = null;
let _compression = null;
let _server = null;
let _middlewareStack = null;
let _queryBuilder = null;
let _sanitize = null;
let _migration = null;
let _socketIO = null;
let _rateLimiter = null;
let _ipFilter = null;
let _serviceContainer = null;
let _jobWorker = null;
let _pubSub = null;
let _sessionStore = null;
let _config = null;

function getApi() {
    if (!_api) _api = require('./api');
    return _api;
}

function getEscrow() {
    if (!_escrow) _escrow = require('./escrow');
    return _escrow;
}

function getBrain() {
    if (!_brain) _brain = require('./brain');
    return _brain;
}

function getResolution() {
    if (!_resolution) _resolution = require('./resolution');
    return _resolution;
}

function getMitigate() {
    if (!_mitigate) _mitigate = require('./mitigate');
    return _mitigate;
}

function getSync() {
    if (!_sync) _sync = require('./sync');
    return _sync;
}

function getAuth() {
    if (!_auth) _auth = require('./auth');
    return _auth;
}

function getSearch() {
    if (!_search) _search = require('./search');
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
    if (!_metrics) _metrics = require('./metrics');
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

let _configFlag = null;

function getConfigFlag() {
    if (!_configFlag) _configFlag = require('./config');
    return _configFlag;
}

function getRateLimit() {
    // Use QoS class for rate limiting
    const qos = getQoS();
    return qos;
}

function getQoS() {
    if (!_qosInstance) {
        var QoS = require('./qos').QoS;
        _qosInstance = new QoS();
    }
    return _qosInstance;
}

function getSession() {
    if (!_session) _session = require('./session');
    return _session;
}
function getEventEmitter() {
    if (!_eventEmitter) {
        const eb = require('./event-bus');
        _eventEmitter = eb.EventEmitter ? new eb.EventEmitter() : eb.defaultEventEmitter;
    }
    return _eventEmitter;
}

function getSerializer() {
    if (!_serializer) _serializer = require('./serializer');
    return _serializer;
}

function getStorage() {
    if (!_storage) _storage = require('./pool');
    return _storage;
}

function getWebSocket() {
    if (!_websocket) _websocket = require('./websocket');
    return _websocket;
}

function getCronParser() {
    if (!_cronParser) _cronParser = require('./cron-parser');
    return _cronParser;
}

function getUUID() {
    if (!_uuid) _uuid = require('./uuid');
    return _uuid;
}

function getMemoize() {
    if (!_memoize) _memoize = require('./memoize');
    return _memoize;
}

function getDebouncer() {
    if (!_debouncer) _debouncer = require('./debouncer');
    return _debouncer;
}

function getThrottler() {
    if (!_throttler) _throttler = require('./throttler');
    return _throttler;
}

function getRetry() {
    if (!_retry) _retry = require('./retry');
    return _retry;
}

function getCircuitBreaker() {
    // Use QoS CircuitBreaker class
    return require('./qos').CircuitBreaker;
}

function getBulkhead() {
    // Use QoS Bulkhead class
    return require('./qos').Bulkhead;
}

function getTransformer() {
    if (!_transformer) _transformer = require('./transformer');
    return _transformer;
}

function getHash() {
    if (!_hash) _hash = require('./hash');
    return _hash;
}

function getTiming() {
    if (!_timing) _timing = require('./timing');
    return _timing;
}

function getHTTP() {
    // Use Server for HTTP layer (includes HTTP class for client requests)
    const { Server, HTTP } = require('./server');
    return { HTTP, create: (o) => new HTTP(o), getLayerStatus: () => ({ name: 'HTTP', type: 'http', enabled: true }), isOperationAllowed: (op) => ({ allowed: true, layer: 'HTTP' }), getStatus: () => ({ enabled: true }) };
}

function getBuffer() {
    if (!_buffer) _buffer = require('./pool');
    return _buffer;
}

function getValidator() {
    if (!_validator) _validator = require('./validator');
    return _validator;
}

function getLRU() {
    if (!_lru) _lru = require('./lru');
    return _lru;
}

function getPool() {
    if (!_pool) _pool = require('./pool');
    return _pool;
}

function getRouter() {
    if (!_router) _router = require('./router');
    return _router;
}

function getRequest() {
    if (!_request) _request = require('./request');
    return _request;
}

function getResponse() {
    if (!_response) _response = require('./response');
    return _response;
}

function getContext() {
    if (!_context) _context = require('./context');
    return _context;
}

function getBodyParser() {
    if (!_bodyParser) _bodyParser = require('./body-parser');
    return _bodyParser;
}

function getCORS() {
    if (!_cors) _cors = require('./cors');
    return _cors;
}

function getErrorHandler() {
    if (!_errorHandler) _errorHandler = require('./error-handler');
    return _errorHandler;
}

function getHelmet() {
    if (!_helmet) _helmet = require('./helmet');
    return _helmet;
}

function getStatic() {
    if (!_static) _static = require('./static');
    return _static;
}

function getCacheControl() {
    if (!_cacheControl) _cacheControl = require('./cache-control');
    return _cacheControl;
}

function getCompression() {
    if (!_compression) _compression = require('./compression');
    return _compression;
}

function getServer() {
    if (!_server) _server = require('./server');
    return _server;
}

function getMiddlewareStack() {
    if (!_middlewareStack) _middlewareStack = require('./middleware-stack');
    return _middlewareStack;
}

function getQueryBuilder() {
    if (!_queryBuilder) _queryBuilder = require('./query-builder');
    return _queryBuilder;
}

function getSanitize() {
    if (!_sanitize) _sanitize = require('./sanitize');
    return _sanitize;
}

function getMigration() {
    if (!_migration) _migration = require('./migration');
    return _migration;
}

function getSocketIO() {
    if (!_socketIO) _socketIO = require('./socket-io');
    return _socketIO;
}

function getRateLimiter() {
    // Use QoS RateLimiter class
    return require('./qos').RateLimiter;
}

function getQosInstance() {
    // Get singleton QoS instance
    return getQoS();
}

function getIPFilter() {
    if (!_ipFilter) _ipFilter = require('./ip-filter');
    return _ipFilter;
}

function getServiceContainer() {
    if (!_serviceContainer) _serviceContainer = require('./service-container');
    return _serviceContainer;
}

function getJobWorker() {
    if (!_jobWorker) _jobWorker = require('./job_worker');
    return _jobWorker;
}

function getPubSub() {
    if (!_pubSub) {
        const eb = require('./event-bus');
        _pubSub = eb.PubSub ? new eb.PubSub() : eb.defaultPubSub;
    }
    return _pubSub;
}

function getSessionStore() {
    if (!_sessionStore) _sessionStore = require('./session_store');
    return _sessionStore;
}

function getConfig() {
    if (!_config) _config = require('./config');
    return _config;
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
        return getRateLimiter();
    }
    
    /**
     * Get Session layer (lazy)
     */
    get session() {
        return getSession();
    }
    
    get eventEmitter() {
        return getEventEmitter();
    }
    
    get serializer() {
        return getSerializer();
    }
    
    get storage() {
        return getStorage();
    }
    
    get websocket() {
        return getWebSocket();
    }
    
    get cronParser() {
        return getCronParser();
    }
    
    get uuid() {
        return getUUID();
    }
    
    get memoize() {
        return getMemoize();
    }
    
    get debouncer() {
        return getDebouncer();
    }
    
    get throttler() {
        return getThrottler();
    }
    
    get retry() {
        return getRetry();
    }
    
    get circuitBreaker() {
        return getCircuitBreaker();
    }
    
    get bulkhead() {
        return getBulkhead();
    }
    
    get transformer() {
        return getTransformer();
    }
    
    get hash() {
        return getHash();
    }
    
    get timing() {
        return getTiming();
    }
    
    get http() {
        return getHTTP();
    }
    
    get buffer() {
        return getBuffer();
    }
    
    get validator() {
        return getValidator();
    }
    
    get lru() {
        return getLRU();
    }
    
    get pool() {
        return getPool();
    }
    
    get router() {
        return getRouter();
    }
    
    get request() {
        return getRequest();
    }
    
    get response() {
        return getResponse();
    }
    
    get context() {
        return getContext();
    }
    
    get bodyParser() {
        return getBodyParser();
    }
    
    get cors() {
        return getCORS();
    }
    
    get errorHandler() {
        return getErrorHandler();
    }
    
    get helmet() {
        return getHelmet();
    }
    
    get static() {
        return getStatic();
    }
    
    get cacheControl() {
        return getCacheControl();
    }
    
    get compression() {
        return getCompression();
    }
    
    get server() { return getServer(); }
    get middlewareStack() { return getMiddlewareStack(); }
    get queryBuilder() { return getQueryBuilder(); }
    get sanitize() { return getSanitize(); }
    get migration() { return getMigration(); }
    get socketIO() { return getSocketIO(); }
    get rateLimiter() { return getRateLimiter(); }
    get ipFilter() { return getIPFilter(); }
    get serviceContainer() { return getServiceContainer(); }
    get jobWorker() { return getJobWorker(); }
    get pubSub() { return getPubSub(); }
    get sessionStore() { return getSessionStore(); }
    get config() { return getConfig(); }
    
    /**
     * Initialize all 42 layers
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
        console.log('[Framework] RateLimit (via QoS): ' + (this.rateLimit.getLayerStatus().enabled ? 'OK' : 'FAIL'));
        
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
                session: this.session.getLayerStatus(),
                eventEmitter: this.eventEmitter.getLayerStatus(),
                serializer: this.serializer.getLayerStatus(),
                storage: this.storage.getLayerStatus(),
                websocket: this.websocket.getLayerStatus(),
                cronParser: this.cronParser.getLayerStatus(),
                uuid: this.uuid.getLayerStatus(),
                memoize: this.memoize.getLayerStatus(),
                debouncer: this.debouncer.getLayerStatus(),
                throttler: this.throttler.getLayerStatus(),
                retry: this.retry.getLayerStatus(),
                circuitBreaker: this.circuitBreaker.getLayerStatus(),
                bulkhead: this.bulkhead.getLayerStatus(),
                transformer: this.transformer.getLayerStatus(),
                hash: this.hash.getLayerStatus(),
                timing: this.timing.getLayerStatus(),
                http: this.http.getLayerStatus(),
                buffer: this.buffer.getLayerStatus(),
                validator: this.validator.getLayerStatus(),
                lru: this.lru.getLayerStatus(),
                pool: this.pool.getLayerStatus(),
                router: this.router.getLayerStatus(),
                request: this.request.getLayerStatus(),
                response: this.response.getLayerStatus(),
                context: this.context.getLayerStatus(),
                bodyParser: this.bodyParser.getLayerStatus(),
                cors: this.cors.getLayerStatus(),
                errorHandler: this.errorHandler.getLayerStatus(),
                helmet: this.helmet.getLayerStatus(),
                static: this.static.getLayerStatus(),
                cacheControl: this.cacheControl.getLayerStatus(),
                compression: this.compression.getLayerStatus(),
                server: this.server.getLayerStatus(),
                middlewareStack: this.middlewareStack.getLayerStatus(),
                queryBuilder: this.queryBuilder.getLayerStatus(),
                sanitize: this.sanitize.getLayerStatus(),
                migration: this.migration.getLayerStatus(),
                socketIO: this.socketIO.getLayerStatus(),
                rateLimiter: this.rateLimiter.getLayerStatus(),
                ipFilter: this.ipFilter.getLayerStatus(),
                serviceContainer: this.serviceContainer.getLayerStatus(),
                jobWorker: this.jobWorker.getLayerStatus(),
                pubSub: this.pubSub.getLayerStatus(),
                sessionStore: this.sessionStore.getLayerStatus(),
                config: this.config.getLayerStatus()
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
            session: this.session.isOperationAllowed(type),
            eventEmitter: this.eventEmitter.isOperationAllowed(type),
            serializer: this.serializer.isOperationAllowed(type),
            storage: this.storage.isOperationAllowed(type),
            websocket: this.websocket.isOperationAllowed(type),
            cronParser: this.cronParser.isOperationAllowed(type),
            uuid: this.uuid.isOperationAllowed(type),
            memoize: this.memoize.isOperationAllowed(type),
            debouncer: this.debouncer.isOperationAllowed(type),
            throttler: this.throttler.isOperationAllowed(type),
            retry: this.retry.isOperationAllowed(type),
            circuitBreaker: this.circuitBreaker.isOperationAllowed(type),
            bulkhead: this.bulkhead.isOperationAllowed(type),
            transformer: this.transformer.isOperationAllowed(type),
            hash: this.hash.isOperationAllowed(type),
            timing: this.timing.isOperationAllowed(type),
            http: this.http.isOperationAllowed(type),
            buffer: this.buffer.isOperationAllowed(type),
            validator: this.validator.isOperationAllowed(type),
            lru: this.lru.isOperationAllowed(type),
            pool: this.pool.isOperationAllowed(type),
            router: this.router.isOperationAllowed(type),
            request: this.request.isOperationAllowed(type),
            response: this.response.isOperationAllowed(type),
            context: this.context.isOperationAllowed(type),
            bodyParser: this.bodyParser.isOperationAllowed(type),
            cors: this.cors.isOperationAllowed(type),
            errorHandler: this.errorHandler.isOperationAllowed(type),
            helmet: this.helmet.isOperationAllowed(type),
            static: this.static.isOperationAllowed(type),
            cacheControl: this.cacheControl.isOperationAllowed(type),
            compression: this.compression.isOperationAllowed(type),
            server: this.server.isOperationAllowed(type),
            middlewareStack: this.middlewareStack.isOperationAllowed(type),
            queryBuilder: this.queryBuilder.isOperationAllowed(type),
            sanitize: this.sanitize.isOperationAllowed(type),
            migration: this.migration.isOperationAllowed(type),
            socketIO: this.socketIO.isOperationAllowed(type),
            rateLimiter: this.rateLimiter.isOperationAllowed(type),
            ipFilter: this.ipFilter.isOperationAllowed(type),
            serviceContainer: this.serviceContainer.isOperationAllowed(type),
            jobWorker: this.jobWorker.isOperationAllowed(type),
            pubSub: this.pubSub.isOperationAllowed(type),
            sessionStore: this.sessionStore.isOperationAllowed(type),
            config: this.config.isOperationAllowed(type)
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
    get rateLimit() { return getRateLimiter(); },
    get session() { return getSession(); },
    get eventEmitter() { return getEventEmitter(); },
    get serializer() { return getSerializer(); },
    get storage() { return getStorage(); },
    get websocket() { return getWebSocket(); },
    get cronParser() { return getCronParser(); },
    get uuid() { return getUUID(); },
    get memoize() { return getMemoize(); },
    get debouncer() { return getDebouncer(); },
    get throttler() { return getThrottler(); },
    get retry() { return getRetry(); },
    get circuitBreaker() { return getCircuitBreaker(); },
    get bulkhead() { return getBulkhead(); },
    get transformer() { return getTransformer(); },
    get hash() { return getHash(); },
    get timing() { return getTiming(); },
    get http() { return getHTTP(); },
    get buffer() { return getBuffer(); },
    get validator() { return getValidator(); },
    get lru() { return getLRU(); },
    get pool() { return getPool(); },
    get router() { return getRouter(); },
    get request() { return getRequest(); },
    get response() { return getResponse(); },
    get context() { return getContext(); },
    get bodyParser() { return getBodyParser(); },
    get cors() { return getCORS(); },
    get errorHandler() { return getErrorHandler(); },
    get helmet() { return getHelmet(); },
    get static() { return getStatic(); },
    get cacheControl() { return getCacheControl(); },
    get compression() { return getCompression(); },
    get server() { return getServer(); },
    get middlewareStack() { return getMiddlewareStack(); },
    get queryBuilder() { return getQueryBuilder(); },
    get sanitize() { return getSanitize(); },
    get migration() { return getMigration(); },
    get socketIO() { return getSocketIO(); },
    get rateLimiter() { return getRateLimiter(); },
    get ipFilter() { return getIPFilter(); },
    get serviceContainer() { return getServiceContainer(); },
    get jobWorker() { return getJobWorker(); },
    get pubSub() { return getPubSub(); },
    get sessionStore() { return getSessionStore(); },
    get config() { return getConfig(); }
};